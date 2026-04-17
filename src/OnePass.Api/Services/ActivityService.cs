using OnePass.Api.Models;
using OnePass.Api.Repositories;

namespace OnePass.Api.Services;

public interface IActivityService
{
    Task<ActivityEntity> CreateAsync(ActivityEntity activity, CancellationToken ct = default);
    Task<ActivityEntity?> GetAsync(string id, CancellationToken ct = default);
    Task<ActivityEntity?> FindByNameAsync(string name, CancellationToken ct = default);
    Task<IReadOnlyList<ActivityEntity>> ListAsync(CancellationToken ct = default);
    Task UpdateAsync(ActivityEntity activity, CancellationToken ct = default);
    Task DeleteAsync(string id, CancellationToken ct = default);
}

public sealed class ActivityService : IActivityService
{
    internal const string TableName = "activities";
    private readonly ITableRepository<ActivityEntity> _activities;

    public ActivityService(ITableStoreFactory factory)
    {
        _activities = factory.GetRepository<ActivityEntity>(TableName);
    }

    public async Task<ActivityEntity> CreateAsync(ActivityEntity activity, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(activity.Name))
            throw new ArgumentException("Activity name is required.");
        if (activity.EndsAt < activity.StartsAt)
            throw new ArgumentException("End date must be after start date.");

        var existing = await FindByNameAsync(activity.Name, ct);
        if (existing is not null)
            throw new InvalidOperationException($"An activity named '{activity.Name.Trim()}' already exists.");

        activity.Name = activity.Name.Trim();
        activity.PartitionKey = "Activity";
        if (string.IsNullOrWhiteSpace(activity.RowKey))
            activity.RowKey = Guid.NewGuid().ToString("N");
        activity.CreatedAt = DateTimeOffset.UtcNow;
        await _activities.UpsertAsync(activity, ct);
        return activity;
    }

    public async Task<ActivityEntity?> FindByNameAsync(string name, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;
        var needle = name.Trim();
        await foreach (var a in _activities.QueryAsync(null, ct))
        {
            if (a.Name.Equals(needle, StringComparison.OrdinalIgnoreCase))
                return a;
        }
        return null;
    }

    public Task<ActivityEntity?> GetAsync(string id, CancellationToken ct = default) =>
        _activities.GetAsync("Activity", id, ct);

    public async Task<IReadOnlyList<ActivityEntity>> ListAsync(CancellationToken ct = default)
    {
        var list = new List<ActivityEntity>();
        await foreach (var a in _activities.QueryAsync(null, ct)) list.Add(a);
        return list.OrderByDescending(a => a.StartsAt).ToList();
    }

    public Task UpdateAsync(ActivityEntity activity, CancellationToken ct = default)
    {
        activity.PartitionKey = "Activity";
        return _activities.UpsertAsync(activity, ct);
    }

    public Task DeleteAsync(string id, CancellationToken ct = default) =>
        _activities.DeleteAsync("Activity", id, ct);
}
