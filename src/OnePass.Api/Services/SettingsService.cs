using OnePass.Api.Models;
using OnePass.Api.Repositories;

namespace OnePass.Api.Services;

public interface ISettingsService
{
    Task<SettingsEntity> GetAsync(CancellationToken ct = default);
    Task<SettingsEntity> UpdateAsync(string? eventName, string? defaultActivityId, CancellationToken ct = default);
}

public sealed class SettingsService : ISettingsService
{
    internal const string TableName = "settings";
    private readonly ITableRepository<SettingsEntity> _repo;

    public SettingsService(ITableStoreFactory factory)
    {
        _repo = factory.GetRepository<SettingsEntity>(TableName);
    }

    public async Task<SettingsEntity> GetAsync(CancellationToken ct = default)
    {
        var existing = await _repo.GetAsync(SettingsEntity.SingletonPartitionKey, SettingsEntity.SingletonRowKey, ct);
        if (existing is not null) return existing;
        var created = new SettingsEntity();
        await _repo.UpsertAsync(created, ct);
        return created;
    }

    public async Task<SettingsEntity> UpdateAsync(string? eventName, string? defaultActivityId, CancellationToken ct = default)
    {
        var current = await GetAsync(ct);
        if (eventName is not null) current.EventName = eventName.Trim();
        // An empty/whitespace string clears the default; null leaves it unchanged.
        if (defaultActivityId is not null)
            current.DefaultActivityId = string.IsNullOrWhiteSpace(defaultActivityId) ? null : defaultActivityId.Trim();
        await _repo.UpsertAsync(current, ct);
        return current;
    }
}
