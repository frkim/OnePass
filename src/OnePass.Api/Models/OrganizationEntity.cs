using System.Text.Json.Serialization;

namespace OnePass.Api.Models;

/// <summary>
/// A tenant. Owns one or more events and a member roster. Slug is the
/// URL-friendly identifier surfaced in `/{orgSlug}/...` routes; renaming
/// is supported but the previous slug should serve a 301 redirect at the
/// edge (handled at the routing layer, not here).
/// </summary>
public class OrganizationEntity : IEntity
{
    /// <summary>Convention: every organisation lives in its own partition.</summary>
    [JsonPropertyName("partitionKey")]
    public string PartitionKey { get; set; } = string.Empty; // OrgId

    [JsonPropertyName("id")]
    public string RowKey { get; set; } = string.Empty;       // OrgId (mirrors PartitionKey)

    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string OwnerUserId { get; set; } = string.Empty;
    public string Status { get; set; } = OrganizationStatus.Active;

    /// <summary>Region for data residency (e.g. "eu", "us"). EU only at launch.</summary>
    public string Region { get; set; } = "eu";

    /// <summary>
    /// Plan placeholder (Free/Pro/Enterprise). Free is the only available
    /// plan today; persisted so billing-ready scaffolding (Phase 7) can
    /// turn it into something meaningful without a second migration.
    /// </summary>
    public string Plan { get; set; } = "Free";

    /// <summary>Optional retention window override (days).</summary>
    public int? RetentionDays { get; set; }

    /// <summary>Branding hints surfaced to the SPA (logo URL, primary colour).</summary>
    public string? BrandingLogoUrl { get; set; }
    public string? BrandingPrimaryColor { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>Slug used **before** the most recent rename, for 301 redirects.</summary>
    public string? PreviousSlug { get; set; }

    /// <summary>
    /// Fair-use caps applied per organisation (Phase 7 — anti-abuse, not
    /// commercial). All defaults are intentionally generous to cover real
    /// in-person events; the <see cref="Auth.TenantPolicies.EnforceFairUse"/>
    /// policy returns 429 with a friendly message when these are exceeded.
    /// </summary>
    public OrganizationLimits Limits { get; set; } = new();
}

public class OrganizationLimits
{
    /// <summary>Maximum number of events one organisation can host.</summary>
    public int MaxEvents { get; set; } = 50;
    /// <summary>Maximum number of members one organisation can have.</summary>
    public int MaxMembers { get; set; } = 1000;
    /// <summary>Maximum number of scans recorded per calendar month, summed across the org.</summary>
    public int MaxScansPerMonth { get; set; } = 100_000;
}
