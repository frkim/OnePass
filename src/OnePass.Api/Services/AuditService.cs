using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using OnePass.Api.Models;
using OnePass.Api.Repositories;

namespace OnePass.Api.Services;

public interface IAuditService
{
    Task LogAsync(string orgId, string actorUserId, string action, string targetType, string targetId,
                  object? metadata = null, string? ipAddress = null, string? userAgent = null,
                  CancellationToken ct = default);
    Task<IReadOnlyList<AuditEvent>> ListForOrgAsync(string orgId, int max = 200, CancellationToken ct = default);
}

public sealed class AuditService : IAuditService
{
    internal const string TableName = "audit_events";
    private readonly ITableRepository<AuditEvent> _repo;

    public AuditService(ITableStoreFactory factory)
    {
        _repo = factory.GetRepository<AuditEvent>(TableName);
    }

    public async Task LogAsync(string orgId, string actorUserId, string action, string targetType, string targetId,
                               object? metadata = null, string? ipAddress = null, string? userAgent = null,
                               CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(orgId)) return; // no-op for legacy / unscoped calls
        var occurredAt = DateTimeOffset.UtcNow;
        var entry = new AuditEvent
        {
            PartitionKey = orgId,
            RowKey = AuditEvent.NewRowKey(occurredAt),
            OrgId = orgId,
            ActorUserId = actorUserId ?? string.Empty,
            Action = action,
            TargetType = targetType,
            TargetId = targetId,
            Metadata = metadata is null ? null : JsonSerializer.Serialize(metadata),
            IpHash = ipAddress is null ? null : HashIp(ipAddress),
            UserAgent = userAgent,
            OccurredAt = occurredAt,
        };
        await _repo.UpsertAsync(entry, ct);
    }

    public async Task<IReadOnlyList<AuditEvent>> ListForOrgAsync(string orgId, int max = 200, CancellationToken ct = default)
    {
        var list = new List<AuditEvent>();
        await foreach (var e in _repo.QueryAsync(null, ct))
        {
            if (string.Equals(e.OrgId, orgId, StringComparison.Ordinal)) list.Add(e);
        }
        return list.OrderByDescending(e => e.OccurredAt).Take(max).ToList();
    }

    /// <summary>SHA-256 of the IP — keeps audit useful for correlation while
    /// avoiding storing raw addresses (GDPR data minimisation).</summary>
    private static string HashIp(string ip)
    {
        Span<byte> hash = stackalloc byte[32];
        SHA256.HashData(Encoding.UTF8.GetBytes(ip), hash);
        return Convert.ToHexString(hash);
    }
}
