using OnePass.Api.Models;
using OnePass.Api.Repositories;

namespace OnePass.Api.Services;

public interface IPlatformSettingsService
{
    Task<PlatformSettingsEntity> GetAsync(CancellationToken ct = default);
    Task<PlatformSettingsEntity> UpdateAsync(PlatformSettingsEntity settings, string? actorUserId, CancellationToken ct = default);
}

/// <summary>
/// Single-row store for platform-wide settings. Cached in-memory after the
/// first read so the SPA's banner / registration check has a near-zero cost
/// per request — invalidated on every write.
/// </summary>
public sealed class PlatformSettingsService : IPlatformSettingsService
{
    internal const string TableName = "platform_settings";

    private readonly ITableRepository<PlatformSettingsEntity> _repo;
    private PlatformSettingsEntity? _cached;
    private readonly SemaphoreSlim _gate = new(1, 1);

    public PlatformSettingsService(ITableStoreFactory factory)
    {
        _repo = factory.GetRepository<PlatformSettingsEntity>(TableName);
    }

    public async Task<PlatformSettingsEntity> GetAsync(CancellationToken ct = default)
    {
        if (_cached is not null) return _cached;
        await _gate.WaitAsync(ct);
        try
        {
            if (_cached is not null) return _cached;
            var existing = await _repo.GetAsync(
                PlatformSettingsEntity.FixedPartitionKey,
                PlatformSettingsEntity.FixedRowKey,
                ct);
            if (existing is null)
            {
                existing = new PlatformSettingsEntity();
                await _repo.UpsertAsync(existing, ct);
            }
            _cached = existing;
            return existing;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<PlatformSettingsEntity> UpdateAsync(PlatformSettingsEntity settings, string? actorUserId, CancellationToken ct = default)
    {
        // Force the canonical keys regardless of what the caller posted.
        settings.PartitionKey = PlatformSettingsEntity.FixedPartitionKey;
        settings.RowKey = PlatformSettingsEntity.FixedRowKey;
        settings.UpdatedAt = DateTimeOffset.UtcNow;
        settings.UpdatedByUserId = actorUserId;
        await _repo.UpsertAsync(settings, ct);
        _cached = settings;
        return settings;
    }
}
