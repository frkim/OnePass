using System.Text.Json.Serialization;

namespace OnePass.Api.Models;

/// <summary>
/// Join row between a <see cref="UserEntity"/> and an <see cref="OrganizationEntity"/>.
/// Carries the user's role inside the org plus per-org preferences that PR #5
/// originally stored on <see cref="UserEntity"/>.
/// </summary>
public class MembershipEntity : IEntity
{
    [JsonPropertyName("partitionKey")]
    public string PartitionKey { get; set; } = string.Empty; // OrgId

    [JsonPropertyName("id")]
    public string RowKey { get; set; } = string.Empty;       // UserId

    public string OrgId { get; set; } = string.Empty;
    public string UserId { get; set; } = string.Empty;

    /// <summary>One of <see cref="OrgRoles"/>.</summary>
    public string Role { get; set; } = OrgRoles.Viewer;

    /// <summary>One of <see cref="MembershipStatus"/>.</summary>
    public string Status { get; set; } = MembershipStatus.Active;

    public string? InvitedByUserId { get; set; }
    public DateTimeOffset JoinedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// Activity ids the member is allowed to select on the Scan page.
    /// Empty list means "no restriction inside this org" (org admins can
    /// always select any activity in any of their org's events).
    /// </summary>
    public List<string> AllowedActivityIds { get; set; } = new();

    /// <summary>Member-chosen default activity (within this org).</summary>
    public string? DefaultActivityId { get; set; }

    /// <summary>Member-chosen default event (within this org).</summary>
    public string? DefaultEventId { get; set; }
}
