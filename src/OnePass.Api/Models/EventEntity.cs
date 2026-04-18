using System.Text.Json.Serialization;

namespace OnePass.Api.Models;

/// <summary>
/// An event groups a set of activities under one organisation.
/// Absorbs the legacy <see cref="SettingsEntity"/>'s `EventName` and
/// `DefaultActivityId` (per the SaaS migration plan §4.2).
/// </summary>
public class EventEntity : IEntity
{
    [JsonPropertyName("partitionKey")]
    public string PartitionKey { get; set; } = string.Empty; // OrgId

    [JsonPropertyName("id")]
    public string RowKey { get; set; } = string.Empty;       // EventId

    public string OrgId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTimeOffset? StartsAt { get; set; }
    public DateTimeOffset? EndsAt { get; set; }
    public string? Venue { get; set; }

    /// <summary>Per-event default activity (was <c>SettingsEntity.DefaultActivityId</c>).</summary>
    public string? DefaultActivityId { get; set; }

    public bool IsArchived { get; set; }
    public string CreatedByUserId { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
