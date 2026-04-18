using System.Text.Json.Serialization;

namespace OnePass.Api.Models;

/// <summary>
/// A pending invitation for an email address to join an organisation with a
/// specific role. Accepted by exchanging the token against
/// <c>POST /api/orgs/{orgId}/invitations/{token}/accept</c>.
/// </summary>
public class InvitationEntity : IEntity
{
    [JsonPropertyName("partitionKey")]
    public string PartitionKey { get; set; } = string.Empty; // OrgId

    [JsonPropertyName("id")]
    public string RowKey { get; set; } = string.Empty;       // Token (cryptographic)

    public string OrgId { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = OrgRoles.Viewer;
    public string InvitedByUserId { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; set; } = DateTimeOffset.UtcNow.AddDays(14);
    public string? AcceptedByUserId { get; set; }
    public DateTimeOffset? AcceptedAt { get; set; }
}
