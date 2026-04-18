using System.Text.RegularExpressions;
using OnePass.Api.Models;
using OnePass.Api.Repositories;

namespace OnePass.Api.Services;

public interface IOrganizationService
{
    Task<OrganizationEntity> CreateAsync(string name, string slug, string ownerUserId, CancellationToken ct = default);
    Task<OrganizationEntity?> GetAsync(string orgId, CancellationToken ct = default);
    Task<OrganizationEntity?> GetBySlugAsync(string slug, CancellationToken ct = default);
    Task<IReadOnlyList<OrganizationEntity>> ListAsync(CancellationToken ct = default);
    Task<OrganizationEntity> UpdateAsync(OrganizationEntity org, CancellationToken ct = default);
    Task<OrganizationEntity> RenameSlugAsync(string orgId, string newSlug, CancellationToken ct = default);
    Task SoftDeleteAsync(string orgId, CancellationToken ct = default);
}

/// <summary>
/// Manages organisations (tenants). Slugs are normalised to lowercase
/// kebab-case, validated, and verified to be globally unique.
/// </summary>
public sealed class OrganizationService : IOrganizationService
{
    internal const string TableName = "organizations";

    /// <summary>Reserved at the routing layer (cannot collide with org slugs).</summary>
    public static readonly HashSet<string> ReservedSlugs = new(StringComparer.OrdinalIgnoreCase)
    {
        "api", "auth", "admin", "scalar", "swagger", "health", "static",
        "assets", "favicon.ico", "p", "signup", "login", "logout",
        "settings", "scan", "scans", "activities", "events", "users",
        "memberships", "invitations", "orgs", "organisations", "organizations", "me",
    };

    private static readonly Regex SlugRegex = new("^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$", RegexOptions.Compiled);

    private readonly ITableRepository<OrganizationEntity> _repo;

    public OrganizationService(ITableStoreFactory factory)
    {
        _repo = factory.GetRepository<OrganizationEntity>(TableName);
    }

    public async Task<OrganizationEntity> CreateAsync(string name, string slug, string ownerUserId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(name)) throw new ArgumentException("Organisation name is required.", nameof(name));
        if (string.IsNullOrWhiteSpace(ownerUserId)) throw new ArgumentException("Owner user id is required.", nameof(ownerUserId));
        var normSlug = NormaliseSlug(slug);
        EnsureValidSlug(normSlug);

        var existing = await GetBySlugAsync(normSlug, ct);
        if (existing is not null) throw new InvalidOperationException($"Slug '{normSlug}' is already in use.");

        var orgId = Guid.NewGuid().ToString("N");
        var org = new OrganizationEntity
        {
            PartitionKey = orgId,
            RowKey = orgId,
            Name = name.Trim(),
            Slug = normSlug,
            OwnerUserId = ownerUserId,
        };
        await _repo.UpsertAsync(org, ct);
        return org;
    }

    public Task<OrganizationEntity?> GetAsync(string orgId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(orgId)) return Task.FromResult<OrganizationEntity?>(null);
        return _repo.GetAsync(orgId, orgId, ct);
    }

    public async Task<OrganizationEntity?> GetBySlugAsync(string slug, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(slug)) return null;
        var needle = slug.Trim().ToLowerInvariant();
        await foreach (var o in _repo.QueryAsync(null, ct))
        {
            if (string.Equals(o.Slug, needle, StringComparison.Ordinal) ||
                string.Equals(o.PreviousSlug, needle, StringComparison.Ordinal))
                return o;
        }
        return null;
    }

    public async Task<IReadOnlyList<OrganizationEntity>> ListAsync(CancellationToken ct = default)
    {
        var list = new List<OrganizationEntity>();
        await foreach (var o in _repo.QueryAsync(null, ct)) list.Add(o);
        return list;
    }

    public async Task<OrganizationEntity> UpdateAsync(OrganizationEntity org, CancellationToken ct = default)
    {
        // PartitionKey/RowKey are the org id; do not allow them to drift.
        org.PartitionKey = org.RowKey;
        await _repo.UpsertAsync(org, ct);
        return org;
    }

    public async Task<OrganizationEntity> RenameSlugAsync(string orgId, string newSlug, CancellationToken ct = default)
    {
        var org = await GetAsync(orgId, ct) ?? throw new InvalidOperationException("Organisation not found.");
        var normSlug = NormaliseSlug(newSlug);
        EnsureValidSlug(normSlug);
        if (string.Equals(org.Slug, normSlug, StringComparison.Ordinal)) return org;

        var collision = await GetBySlugAsync(normSlug, ct);
        if (collision is not null && !string.Equals(collision.RowKey, orgId, StringComparison.Ordinal))
            throw new InvalidOperationException($"Slug '{normSlug}' is already in use.");

        org.PreviousSlug = org.Slug;
        org.Slug = normSlug;
        return await UpdateAsync(org, ct);
    }

    public async Task SoftDeleteAsync(string orgId, CancellationToken ct = default)
    {
        var org = await GetAsync(orgId, ct);
        if (org is null) return;
        org.Status = OrganizationStatus.Deleted;
        await UpdateAsync(org, ct);
    }

    public static string NormaliseSlug(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return string.Empty;
        var s = raw.Trim().ToLowerInvariant();
        // Replace anything not alphanumeric with a single dash, then trim dashes.
        s = Regex.Replace(s, "[^a-z0-9]+", "-").Trim('-');
        return s;
    }

    public static void EnsureValidSlug(string slug)
    {
        if (string.IsNullOrEmpty(slug))
            throw new ArgumentException("Slug is required.", nameof(slug));
        if (!SlugRegex.IsMatch(slug))
            throw new ArgumentException("Slug must be 1–40 lowercase alphanumeric characters or dashes (no leading/trailing dash).", nameof(slug));
        if (ReservedSlugs.Contains(slug))
            throw new ArgumentException($"Slug '{slug}' is reserved.", nameof(slug));
    }
}
