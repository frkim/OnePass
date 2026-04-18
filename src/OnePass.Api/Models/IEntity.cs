namespace OnePass.Api.Models;

/// <summary>
/// Marker interface for entities persisted to a partitioned key/value store
/// (e.g. Azure Cosmos DB or the in-memory test repository).
/// </summary>
/// <remarks>
/// We keep the historical <c>PartitionKey</c>/<c>RowKey</c> property names so
/// the service layer (and existing tests) continue to work unchanged after the
/// switch from Azure Table Storage to Cosmos DB.
/// </remarks>
public interface IEntity
{
    /// <summary>Logical partition key. Mapped to the Cosmos document <c>partitionKey</c> field.</summary>
    string PartitionKey { get; set; }

    /// <summary>Unique id within the partition. Mapped to the Cosmos document <c>id</c> field.</summary>
    string RowKey { get; set; }
}
