using System.Text.Json.Serialization;

namespace OnePass.Api.Models;

/// <summary>
/// Singleton platform-wide settings managed by global (PlatformAdmin)
/// administrators only. Stored as a single row in the "platform_settings"
/// table with a fixed partition/row key, so reads are O(1) and there is
/// never any contention with per-tenant data.
/// </summary>
public class PlatformSettingsEntity : IEntity
{
    public const string FixedPartitionKey = "platform";
    public const string FixedRowKey = "default";

    [JsonPropertyName("partitionKey")]
    public string PartitionKey { get; set; } = FixedPartitionKey;

    [JsonPropertyName("id")]
    public string RowKey { get; set; } = FixedRowKey;

    /// <summary>If false, public self-registration is disabled platform-wide.</summary>
    public bool RegistrationOpen { get; set; } = true;

    /// <summary>
    /// Optional banner message shown across the SPA (e.g. for planned
    /// maintenance). Null/empty disables the banner.
    /// </summary>
    public string? MaintenanceMessage { get; set; }

    /// <summary>
    /// Default retention window (days) applied when an organisation has no
    /// override. 0 / negative means "never auto-purge".
    /// </summary>
    public int DefaultRetentionDays { get; set; } = 30;

    /// <summary>
    /// Default fair-use limits used when a new organisation is created.
    /// Existing orgs keep whatever is on their entity until edited.
    /// </summary>
    public OrganizationLimits DefaultOrgLimits { get; set; } = new();

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public string? UpdatedByUserId { get; set; }
}
