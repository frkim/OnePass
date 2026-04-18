using System.Text.Json.Serialization;

namespace OnePass.Api.Models;

/// <summary>
/// Append-only audit record. PartitionKey = OrgId for fast per-tenant audits;
/// RowKey uses inverted ticks so newest entries sort first.
/// </summary>
public class AuditEvent : IEntity
{
    [JsonPropertyName("partitionKey")]
    public string PartitionKey { get; set; } = string.Empty; // OrgId

    [JsonPropertyName("id")]
    public string RowKey { get; set; } = string.Empty;

    public string OrgId { get; set; } = string.Empty;
    public string ActorUserId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;       // e.g. "membership.update"
    public string TargetType { get; set; } = string.Empty;   // e.g. "Membership"
    public string TargetId { get; set; } = string.Empty;
    public string? Metadata { get; set; }                     // JSON-encoded blob
    public string? IpHash { get; set; }
    public string? UserAgent { get; set; }
    public DateTimeOffset OccurredAt { get; set; } = DateTimeOffset.UtcNow;

    public static string NewRowKey(DateTimeOffset occurredAt) =>
        $"{DateTimeOffset.MaxValue.Ticks - occurredAt.Ticks:D19}-{Guid.NewGuid():N}";
}

/// <summary>Well-known audit action names (kept central so logs are searchable).</summary>
public static class AuditActions
{
    public const string OrganizationCreate = "organization.create";
    public const string OrganizationUpdate = "organization.update";
    public const string OrganizationDelete = "organization.delete";
    public const string MembershipInvite = "membership.invite";
    public const string MembershipAccept = "membership.accept";
    public const string MembershipUpdate = "membership.update";
    public const string MembershipRemove = "membership.remove";
    public const string EventCreate = "event.create";
    public const string EventUpdate = "event.update";
    public const string EventDelete = "event.delete";
    public const string ActivityReset = "activity.reset";
    public const string SettingsUpdate = "settings.update";
}
