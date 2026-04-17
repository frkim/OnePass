using OnePass.Api.Models;
using OnePass.Api.Repositories;

namespace OnePass.Api.Services;

public record ActivityStats(
    string ActivityId,
    string ActivityName,
    int TotalScans,
    int UniqueParticipants,
    IReadOnlyList<ScanBucket> ScansByDay);

public record ScanBucket(DateOnly Day, int Count);

public interface IScanService
{
    /// <summary>Records a scan and returns the persisted entity, or throws if invalid.</summary>
    Task<ScanEntity> RecordScanAsync(string activityId, string participantId, string scannedByUserId, CancellationToken ct = default);
    Task<IReadOnlyList<ScanEntity>> ListForActivityAsync(string activityId, bool includeArchived = false, CancellationToken ct = default);
    Task<ActivityStats> GetStatsAsync(string activityId, CancellationToken ct = default);
    Task<int> ArchiveOlderThanAsync(TimeSpan retention, CancellationToken ct = default);
}

public sealed class ScanService : IScanService
{
    internal const string TableName = "scans";

    private readonly ITableRepository<ScanEntity> _scans;
    private readonly IActivityService _activities;
    private readonly IParticipantService _participants;

    public ScanService(ITableStoreFactory factory, IActivityService activities, IParticipantService participants)
    {
        _scans = factory.GetRepository<ScanEntity>(TableName);
        _activities = activities;
        _participants = participants;
    }

    public async Task<ScanEntity> RecordScanAsync(string activityId, string participantId, string scannedByUserId, CancellationToken ct = default)
    {
        var activity = await _activities.GetAsync(activityId, ct)
                       ?? throw new InvalidOperationException("Activity not found.");
        if (!activity.IsActive)
            throw new InvalidOperationException("Activity is not active.");
        if (DateTimeOffset.UtcNow < activity.StartsAt || DateTimeOffset.UtcNow > activity.EndsAt)
            throw new InvalidOperationException("Activity is not currently running.");

        var participant = await _participants.GetAsync(activityId, participantId, ct);
        if (participant is null)
        {
            // Auto-register participant on first scan using the badge id as the identifier.
            participant = new ParticipantEntity
            {
                PartitionKey = activityId,
                RowKey = participantId,
                DisplayName = participantId,
            };
            await _participants.UpsertAsync(participant, ct);
        }

        // A participant can only be scanned once per activity. A second scan is rejected
        // with the well-known marker DUPLICATE_SCAN so the controller returns a stable error code.
        var existing = await ListForActivityAsync(activityId, includeArchived: true, ct);
        if (existing.Any(s => s.ParticipantId == participant.RowKey))
            throw new InvalidOperationException("DUPLICATE_SCAN");

        var now = DateTimeOffset.UtcNow;
        var scan = new ScanEntity
        {
            PartitionKey = activityId,
            RowKey = ScanEntity.NewRowKey(now),
            ParticipantId = participant.RowKey,
            ScannedByUserId = scannedByUserId,
            ScannedAt = now,
        };
        await _scans.UpsertAsync(scan, ct);
        return scan;
    }

    public async Task<IReadOnlyList<ScanEntity>> ListForActivityAsync(string activityId, bool includeArchived = false, CancellationToken ct = default)
    {
        var list = new List<ScanEntity>();
        await foreach (var s in _scans.QueryAsync(null, ct))
        {
            if (s.PartitionKey == activityId && (includeArchived || !s.IsArchived))
                list.Add(s);
        }
        return list;
    }

    public async Task<ActivityStats> GetStatsAsync(string activityId, CancellationToken ct = default)
    {
        var activity = await _activities.GetAsync(activityId, ct)
                       ?? throw new InvalidOperationException("Activity not found.");
        var scans = await ListForActivityAsync(activityId, includeArchived: false, ct);
        var byDay = scans
            .GroupBy(s => DateOnly.FromDateTime(s.ScannedAt.UtcDateTime))
            .Select(g => new ScanBucket(g.Key, g.Count()))
            .OrderBy(b => b.Day)
            .ToList();
        var unique = scans.Select(s => s.ParticipantId).Distinct().Count();
        return new ActivityStats(activity.RowKey, activity.Name, scans.Count, unique, byDay);
    }

    public async Task<int> ArchiveOlderThanAsync(TimeSpan retention, CancellationToken ct = default)
    {
        var cutoff = DateTimeOffset.UtcNow - retention;
        var count = 0;
        await foreach (var s in _scans.QueryAsync(null, ct))
        {
            if (!s.IsArchived && s.ScannedAt < cutoff)
            {
                s.IsArchived = true;
                await _scans.UpsertAsync(s, ct);
                count++;
            }
        }
        return count;
    }
}
