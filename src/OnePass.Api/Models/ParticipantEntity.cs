using Azure;
using Azure.Data.Tables;

namespace OnePass.Api.Models;

/// <summary>
/// A participant in an event. Does not log in; identified via QR code.
/// PartitionKey is the activity id to allow fast per-activity queries.
/// </summary>
public class ParticipantEntity : ITableEntity
{
    public string PartitionKey { get; set; } = string.Empty; // ActivityId
    public string RowKey { get; set; } = Guid.NewGuid().ToString("N"); // ParticipantId (badge/QR)
    public DateTimeOffset? Timestamp { get; set; }
    public ETag ETag { get; set; }

    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
