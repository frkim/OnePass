using OnePass.Api.Models;
using OnePass.Api.Repositories;

namespace OnePass.Api.Services;

public interface IEventService
{
    Task<EventEntity> CreateAsync(string orgId, string name, string? slug, string createdByUserId, CancellationToken ct = default);
    Task<EventEntity?> GetAsync(string orgId, string eventId, CancellationToken ct = default);
    Task<EventEntity?> GetBySlugAsync(string orgId, string slug, CancellationToken ct = default);
    Task<IReadOnlyList<EventEntity>> ListForOrgAsync(string orgId, CancellationToken ct = default);
    Task<EventEntity> UpdateAsync(EventEntity ev, CancellationToken ct = default);
    Task DeleteAsync(string orgId, string eventId, CancellationToken ct = default);
}

public sealed class EventService : IEventService
{
    internal const string TableName = "events";
    private readonly ITableRepository<EventEntity> _repo;

    public EventService(ITableStoreFactory factory)
    {
        _repo = factory.GetRepository<EventEntity>(TableName);
    }

    public async Task<EventEntity> CreateAsync(string orgId, string name, string? slug, string createdByUserId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(orgId)) throw new ArgumentException("OrgId required.", nameof(orgId));
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Event name required.", nameof(name));
        var normSlug = OrganizationService.NormaliseSlug(slug ?? name);
        OrganizationService.EnsureValidSlug(normSlug);

        // Slugs must be unique within an org.
        var existing = await GetBySlugAsync(orgId, normSlug, ct);
        if (existing is not null)
            throw new InvalidOperationException($"An event with slug '{normSlug}' already exists in this organisation.");

        var ev = new EventEntity
        {
            PartitionKey = orgId,
            RowKey = Guid.NewGuid().ToString("N"),
            OrgId = orgId,
            Name = name.Trim(),
            Slug = normSlug,
            CreatedByUserId = createdByUserId,
        };
        await _repo.UpsertAsync(ev, ct);
        return ev;
    }

    public Task<EventEntity?> GetAsync(string orgId, string eventId, CancellationToken ct = default) =>
        _repo.GetAsync(orgId, eventId, ct);

    public async Task<EventEntity?> GetBySlugAsync(string orgId, string slug, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(orgId) || string.IsNullOrWhiteSpace(slug)) return null;
        var needle = slug.Trim().ToLowerInvariant();
        await foreach (var e in _repo.QueryAsync(null, ct))
        {
            if (string.Equals(e.OrgId, orgId, StringComparison.Ordinal) &&
                string.Equals(e.Slug, needle, StringComparison.Ordinal))
                return e;
        }
        return null;
    }

    public async Task<IReadOnlyList<EventEntity>> ListForOrgAsync(string orgId, CancellationToken ct = default)
    {
        var list = new List<EventEntity>();
        await foreach (var e in _repo.QueryAsync(null, ct))
        {
            if (string.Equals(e.OrgId, orgId, StringComparison.Ordinal))
                list.Add(e);
        }
        return list.OrderByDescending(e => e.StartsAt ?? e.CreatedAt).ToList();
    }

    public async Task<EventEntity> UpdateAsync(EventEntity ev, CancellationToken ct = default)
    {
        ev.PartitionKey = ev.OrgId;
        await _repo.UpsertAsync(ev, ct);
        return ev;
    }

    public Task DeleteAsync(string orgId, string eventId, CancellationToken ct = default) =>
        _repo.DeleteAsync(orgId, eventId, ct);
}
