using System.Text.Json.Serialization;

namespace OnePass.Api.Models;

/// <summary>
/// Authenticated user (Admin or User). Participants are a separate entity
/// and do not require authentication.
/// </summary>
public class UserEntity : IEntity
{
    [JsonPropertyName("partitionKey")]
    public string PartitionKey { get; set; } = "User";

    [JsonPropertyName("id")]
    public string RowKey { get; set; } = Guid.NewGuid().ToString("N");

    public string Email { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    /// <summary>User-chosen display name. Falls back to Username if null/empty.</summary>
    public string? DisplayName { get; set; }
    public string PasswordHash { get; set; } = string.Empty;
    public string Role { get; set; } = Roles.User;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string PreferredLanguage { get; set; } = "en";

    /// <summary>
    /// Activity ids the user is allowed to select on the Scan page. An empty
    /// list means no restriction (all activities are available). Admins are
    /// implicitly allowed to access all activities regardless of this list.
    /// </summary>
    public List<string> AllowedActivityIds { get; set; } = new();

    /// <summary>
    /// User-chosen default activity id. Takes priority over the global default
    /// when pre-selecting an activity on the Scan page.
    /// </summary>
    public string? DefaultActivityId { get; set; }

    // ---- SaaS additions (Phase 1) ----

    /// <summary>
    /// Cross-org default organisation. Used by the SPA to auto-select the
    /// active org on login. Null means "no preference — pick the first".
    /// </summary>
    public string? DefaultOrgId { get; set; }

    /// <summary>
    /// Federated identities linked to this user (provider id + subject).
    /// Empty for users created via the legacy local-password flow.
    /// </summary>
    public List<ExternalIdentity> ExternalIdentities { get; set; } = new();

    /// <summary>UI locale preference (BCP 47).</summary>
    public string Locale { get; set; } = "en";

    /// <summary>
    /// Platform-level lock (set by <c>PlatformAdmin</c> for abuse handling).
    /// Distinct from <see cref="IsActive"/>, which is a legacy global flag,
    /// and from per-org <see cref="MembershipEntity.Status"/>.
    /// </summary>
    public bool IsLocked { get; set; }
}

/// <summary>A federated identity link from a CIAM provider.</summary>
public class ExternalIdentity
{
    public string Provider { get; set; } = string.Empty; // "google", "github", "msa", ...
    public string Subject { get; set; } = string.Empty;  // OIDC sub
    public string? Email { get; set; }
}
