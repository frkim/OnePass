using System.Text.Json.Serialization;

namespace OnePass.Api.Models;

/// <summary>
/// A single QR scan event: records who scanned whom and when.
/// PartitionKey = ActivityId for fast per-activity analytics queries.
/// RowKey uses inverted ticks so newest scans come first when sorted lexicographically.
/// </summary>
public class ScanEntity : IEntity
{
    [JsonPropertyName("partitionKey")]
    public string PartitionKey { get; set; } = string.Empty; // ActivityId

    [JsonPropertyName("id")]
    public string RowKey { get; set; } = string.Empty;

    public string ParticipantId { get; set; } = string.Empty;
    public string ScannedByUserId { get; set; } = string.Empty;
    public DateTimeOffset ScannedAt { get; set; } = DateTimeOffset.UtcNow;
    public bool IsArchived { get; set; }

    // ---- SaaS additions (Phase 1) ----
    public string OrgId { get; set; } = string.Empty;
    public string EventId { get; set; } = string.Empty;

    public static string NewRowKey(DateTimeOffset scannedAt) =>
        $"{DateTimeOffset.MaxValue.Ticks - scannedAt.Ticks:D19}-{Guid.NewGuid():N}";
}
