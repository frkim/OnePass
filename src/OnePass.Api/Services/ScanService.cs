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

/// <summary>
/// Thrown when a participant attempts to scan for an activity they have already been scanned for.
/// Carries the timestamp of the original (previous) scan so callers can surface it to the user.
/// </summary>
public sealed class DuplicateScanException : InvalidOperationException
{
    public DateTimeOffset PreviousScannedAt { get; }
    public DuplicateScanException(DateTimeOffset previousScannedAt)
        : base("DUPLICATE_SCAN")
    {
        PreviousScannedAt = previousScannedAt;
    }
}

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
        // with a DuplicateScanException carrying the previous scan timestamp so the
        // controller (and ultimately the UI) can show when the participant was first scanned.
        var existing = await ListForActivityAsync(activityId, includeArchived: true, ct);
        var previous = existing.FirstOrDefault(s => s.ParticipantId == participant.RowKey);
        if (previous is not null)
            throw new DuplicateScanException(previous.ScannedAt);

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
