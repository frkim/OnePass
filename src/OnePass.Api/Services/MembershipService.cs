using OnePass.Api.Models;
using OnePass.Api.Repositories;

namespace OnePass.Api.Services;

public interface IMembershipService
{
    Task<MembershipEntity> AddAsync(string orgId, string userId, string role, string status = MembershipStatus.Active, string? invitedByUserId = null, CancellationToken ct = default);
    Task<MembershipEntity?> GetAsync(string orgId, string userId, CancellationToken ct = default);
    Task<IReadOnlyList<MembershipEntity>> ListForOrgAsync(string orgId, CancellationToken ct = default);
    Task<IReadOnlyList<MembershipEntity>> ListForUserAsync(string userId, CancellationToken ct = default);
    Task<MembershipEntity> UpdateAsync(MembershipEntity membership, CancellationToken ct = default);
    Task RemoveAsync(string orgId, string userId, CancellationToken ct = default);
}

public sealed class MembershipService : IMembershipService
{
    internal const string TableName = "memberships";
    private readonly ITableRepository<MembershipEntity> _repo;

    public MembershipService(ITableStoreFactory factory)
    {
        _repo = factory.GetRepository<MembershipEntity>(TableName);
    }

    public async Task<MembershipEntity> AddAsync(string orgId, string userId, string role, string status = MembershipStatus.Active, string? invitedByUserId = null, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(orgId)) throw new ArgumentException("OrgId required.", nameof(orgId));
        if (string.IsNullOrWhiteSpace(userId)) throw new ArgumentException("UserId required.", nameof(userId));
        if (!OrgRoles.IsValid(role)) throw new ArgumentException($"Unknown role '{role}'.", nameof(role));
        if (!MembershipStatus.IsValid(status)) throw new ArgumentException($"Unknown status '{status}'.", nameof(status));

        var existing = await GetAsync(orgId, userId, ct);
        if (existing is not null && !string.Equals(existing.Status, MembershipStatus.Removed, StringComparison.Ordinal))
            throw new InvalidOperationException("User is already a member of this organisation.");

        var m = new MembershipEntity
        {
            PartitionKey = orgId,
            RowKey = userId,
            OrgId = orgId,
            UserId = userId,
            Role = role,
            Status = status,
            InvitedByUserId = invitedByUserId,
        };
        await _repo.UpsertAsync(m, ct);
        return m;
    }

    public Task<MembershipEntity?> GetAsync(string orgId, string userId, CancellationToken ct = default) =>
        _repo.GetAsync(orgId, userId, ct);

    public async Task<IReadOnlyList<MembershipEntity>> ListForOrgAsync(string orgId, CancellationToken ct = default)
    {
        var list = new List<MembershipEntity>();
        await foreach (var m in _repo.QueryAsync(null, ct))
        {
            if (string.Equals(m.OrgId, orgId, StringComparison.Ordinal) &&
                !string.Equals(m.Status, MembershipStatus.Removed, StringComparison.Ordinal))
                list.Add(m);
        }
        return list;
    }

    public async Task<IReadOnlyList<MembershipEntity>> ListForUserAsync(string userId, CancellationToken ct = default)
    {
        var list = new List<MembershipEntity>();
        await foreach (var m in _repo.QueryAsync(null, ct))
        {
            if (string.Equals(m.UserId, userId, StringComparison.Ordinal) &&
                !string.Equals(m.Status, MembershipStatus.Removed, StringComparison.Ordinal))
                list.Add(m);
        }
        return list;
    }

    public async Task<MembershipEntity> UpdateAsync(MembershipEntity membership, CancellationToken ct = default)
    {
        membership.PartitionKey = membership.OrgId;
        membership.RowKey = membership.UserId;
        await _repo.UpsertAsync(membership, ct);
        return membership;
    }

    public async Task RemoveAsync(string orgId, string userId, CancellationToken ct = default)
    {
        var m = await GetAsync(orgId, userId, ct);
        if (m is null) return;
        m.Status = MembershipStatus.Removed;
        await UpdateAsync(m, ct);
    }
}
