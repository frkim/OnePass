using System.Security.Cryptography;
using OnePass.Api.Models;
using OnePass.Api.Repositories;

namespace OnePass.Api.Services;

public interface IInvitationService
{
    Task<InvitationEntity> CreateAsync(string orgId, string email, string role, string invitedByUserId, TimeSpan? ttl = null, CancellationToken ct = default);
    Task<InvitationEntity?> GetAsync(string orgId, string token, CancellationToken ct = default);
    Task<IReadOnlyList<InvitationEntity>> ListForOrgAsync(string orgId, CancellationToken ct = default);
    Task<InvitationEntity?> FindByTokenAsync(string token, CancellationToken ct = default);
    Task<InvitationEntity> AcceptAsync(string orgId, string token, string userId, CancellationToken ct = default);
    Task RevokeAsync(string orgId, string token, CancellationToken ct = default);
}

public sealed class InvitationService : IInvitationService
{
    internal const string TableName = "invitations";
    /// <summary>Default invitation lifetime when the caller doesn't override.</summary>
    public static readonly TimeSpan DefaultInvitationTtl = TimeSpan.FromDays(14);
    private readonly ITableRepository<InvitationEntity> _repo;

    public InvitationService(ITableStoreFactory factory)
    {
        _repo = factory.GetRepository<InvitationEntity>(TableName);
    }

    public async Task<InvitationEntity> CreateAsync(string orgId, string email, string role, string invitedByUserId, TimeSpan? ttl = null, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(orgId)) throw new ArgumentException("OrgId required.", nameof(orgId));
        if (string.IsNullOrWhiteSpace(email)) throw new ArgumentException("Email required.", nameof(email));
        if (!OrgRoles.IsValid(role)) throw new ArgumentException($"Unknown role '{role}'.", nameof(role));

        var inv = new InvitationEntity
        {
            PartitionKey = orgId,
            RowKey = NewToken(),
            OrgId = orgId,
            Email = email.Trim().ToLowerInvariant(),
            Role = role,
            InvitedByUserId = invitedByUserId,
            ExpiresAt = DateTimeOffset.UtcNow + (ttl ?? DefaultInvitationTtl),
        };
        await _repo.UpsertAsync(inv, ct);
        return inv;
    }

    public Task<InvitationEntity?> GetAsync(string orgId, string token, CancellationToken ct = default) =>
        _repo.GetAsync(orgId, token, ct);

    public async Task<IReadOnlyList<InvitationEntity>> ListForOrgAsync(string orgId, CancellationToken ct = default)
    {
        var list = new List<InvitationEntity>();
        await foreach (var i in _repo.QueryAsync(null, ct))
        {
            if (string.Equals(i.OrgId, orgId, StringComparison.Ordinal))
                list.Add(i);
        }
        return list;
    }

    public async Task<InvitationEntity?> FindByTokenAsync(string token, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        await foreach (var i in _repo.QueryAsync(null, ct))
        {
            if (string.Equals(i.RowKey, token, StringComparison.Ordinal)) return i;
        }
        return null;
    }

    public async Task<InvitationEntity> AcceptAsync(string orgId, string token, string userId, CancellationToken ct = default)
    {
        var inv = await GetAsync(orgId, token, ct)
                  ?? throw new InvalidOperationException("Invitation not found.");
        if (inv.AcceptedByUserId is not null)
            throw new InvalidOperationException("Invitation has already been accepted.");
        if (inv.ExpiresAt < DateTimeOffset.UtcNow)
            throw new InvalidOperationException("Invitation has expired.");
        inv.AcceptedByUserId = userId;
        inv.AcceptedAt = DateTimeOffset.UtcNow;
        await _repo.UpsertAsync(inv, ct);
        return inv;
    }

    public Task RevokeAsync(string orgId, string token, CancellationToken ct = default) =>
        _repo.DeleteAsync(orgId, token, ct);

    private static string NewToken()
    {
        // 32 bytes ≈ 256 bits of entropy; URL-safe base64 (no padding).
        Span<byte> buf = stackalloc byte[32];
        RandomNumberGenerator.Fill(buf);
        return Convert.ToBase64String(buf)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }
}
