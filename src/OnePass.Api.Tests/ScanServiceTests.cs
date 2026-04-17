using OnePass.Api.Models;
using OnePass.Api.Repositories;
using OnePass.Api.Services;

namespace OnePass.Api.Tests;

public class ScanServiceTests
{
    private static (IActivityService, IParticipantService, IScanService) BuildServices(out ITableStoreFactory store)
    {
        store = new InMemoryTableStoreFactory();
        var activities = new ActivityService(store);
        var participants = new ParticipantService(store);
        var scans = new ScanService(store, activities, participants);
        return (activities, participants, scans);
    }

    private static async Task<(ActivityEntity, ParticipantEntity)> SeedAsync(
        IActivityService activities, IParticipantService participants, int maxScans = 1)
    {
        var activity = await activities.CreateAsync(new ActivityEntity
        {
            Name = "Keynote",
            StartsAt = DateTimeOffset.UtcNow.AddMinutes(-5),
            EndsAt = DateTimeOffset.UtcNow.AddHours(1),
            MaxScansPerParticipant = maxScans,
        });
        var participant = await participants.CreateAsync(activity.RowKey, "Bob", "bob@example.com");
        return (activity, participant);
    }

    [Fact]
    public async Task Record_Scan_Creates_Record_And_Stats()
    {
        var (activities, participants, scans) = BuildServices(out _);
        var (activity, participant) = await SeedAsync(activities, participants);

        var scan = await scans.RecordScanAsync(activity.RowKey, participant.RowKey, "admin-user-id");
        Assert.Equal(activity.RowKey, scan.PartitionKey);
        Assert.Equal(participant.RowKey, scan.ParticipantId);

        var stats = await scans.GetStatsAsync(activity.RowKey);
        Assert.Equal(1, stats.TotalScans);
        Assert.Equal(1, stats.UniqueParticipants);
    }

    [Fact]
    public async Task Record_Scan_Beyond_Max_Is_Rejected()
    {
        var (activities, participants, scans) = BuildServices(out _);
        var (activity, participant) = await SeedAsync(activities, participants, maxScans: 1);

        await scans.RecordScanAsync(activity.RowKey, participant.RowKey, "u1");
        await Assert.ThrowsAsync<InvalidOperationException>(async () =>
            await scans.RecordScanAsync(activity.RowKey, participant.RowKey, "u1"));
    }

    [Fact]
    public async Task Record_Scan_For_Inactive_Activity_Is_Rejected()
    {
        var (activities, participants, scans) = BuildServices(out _);
        var (activity, participant) = await SeedAsync(activities, participants);
        activity.IsActive = false;
        await activities.UpdateAsync(activity);

        await Assert.ThrowsAsync<InvalidOperationException>(async () =>
            await scans.RecordScanAsync(activity.RowKey, participant.RowKey, "u1"));
    }

    [Fact]
    public async Task Record_Scan_For_Unknown_Participant_Is_Rejected()
    {
        var (activities, participants, scans) = BuildServices(out _);
        var (activity, _) = await SeedAsync(activities, participants);

        await Assert.ThrowsAsync<InvalidOperationException>(async () =>
            await scans.RecordScanAsync(activity.RowKey, "does-not-exist", "u1"));
    }

    [Fact]
    public async Task Retention_Archives_Old_Scans_Only()
    {
        var (activities, participants, scans) = BuildServices(out var store);
        var (activity, participant) = await SeedAsync(activities, participants, maxScans: 5);

        // Fresh scan via service
        await scans.RecordScanAsync(activity.RowKey, participant.RowKey, "u1");

        // Insert an old scan directly to the repository
        var repo = store.GetRepository<ScanEntity>("scans");
        var old = new ScanEntity
        {
            PartitionKey = activity.RowKey,
            RowKey = ScanEntity.NewRowKey(DateTimeOffset.UtcNow.AddDays(-45)),
            ParticipantId = participant.RowKey,
            ScannedByUserId = "u1",
            ScannedAt = DateTimeOffset.UtcNow.AddDays(-45),
        };
        await repo.UpsertAsync(old);

        var archived = await scans.ArchiveOlderThanAsync(TimeSpan.FromDays(30));
        Assert.Equal(1, archived);

        var visible = await scans.ListForActivityAsync(activity.RowKey, includeArchived: false);
        Assert.Single(visible);
        var all = await scans.ListForActivityAsync(activity.RowKey, includeArchived: true);
        Assert.Equal(2, all.Count);
    }
}
