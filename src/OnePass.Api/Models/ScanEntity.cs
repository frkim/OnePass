using Azure;
using Azure.Data.Tables;

namespace OnePass.Api.Models;

/// <summary>
/// A single QR scan event: records who scanned whom and when.
/// PartitionKey = ActivityId for fast per-activity analytics queries.
/// RowKey uses inverted ticks so newest scans come first.
/// </summary>
public class ScanEntity : ITableEntity
{
    public string PartitionKey { get; set; } = string.Empty; // ActivityId
    public string RowKey { get; set; } = string.Empty;
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; }

    public string ParticipantId { get; set; } = string.Empty;
    public string ScannedByUserId { get; set; } = string.Empty;
    public DateTimeOffset ScannedAt { get; set; } = DateTimeOffset.UtcNow;
    public bool IsArchived { get; set; }

    public static string NewRowKey(DateTimeOffset scannedAt) =>
        $"{DateTimeOffset.MaxValue.Ticks - scannedAt.Ticks:D19}-{Guid.NewGuid():N}";
}
