using System.Text.Json.Serialization;

namespace OnePass.Api.Models;

public class ActivityEntity : IEntity
{
    [JsonPropertyName("partitionKey")]
    public string PartitionKey { get; set; } = "Activity";

    [JsonPropertyName("id")]
    public string RowKey { get; set; } = Guid.NewGuid().ToString("N");

    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public DateTimeOffset StartsAt { get; set; }
    public DateTimeOffset EndsAt { get; set; }
    public int MaxScansPerParticipant { get; set; } = 1;
    public bool IsActive { get; set; } = true;
    /// <summary>
    /// True for the activity flagged as the system-wide default by the admin.
    /// At most one activity should be marked as default at any time. Surfaced
    /// to the UI as the activity pre-selected on the Scan page when the
    /// signed-in user has not chosen their own default.
    /// </summary>
    public bool IsDefault { get; set; }
    public string CreatedByUserId { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
