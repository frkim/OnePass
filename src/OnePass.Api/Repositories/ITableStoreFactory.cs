using OnePass.Api.Models;

namespace OnePass.Api.Repositories;

/// <summary>
/// Abstraction over the underlying document store. The default production
/// implementation talks to Azure Cosmos DB (NoSQL). An in-memory variant is
/// used for tests and as a fallback when no Cosmos endpoint is configured.
/// </summary>
public interface ITableStoreFactory
{
    ITableRepository<T> GetRepository<T>(string tableName) where T : class, IEntity, new();
}

public interface ITableRepository<T> where T : class, IEntity, new()
{
    Task UpsertAsync(T entity, CancellationToken ct = default);
    Task<T?> GetAsync(string partitionKey, string rowKey, CancellationToken ct = default);
    Task DeleteAsync(string partitionKey, string rowKey, CancellationToken ct = default);

    /// <summary>
    /// Enumerates entities in the underlying container.
    /// The optional <paramref name="filter"/> is currently ignored by all
    /// implementations — services perform additional filtering in memory.
    /// </summary>
    IAsyncEnumerable<T> QueryAsync(string? filter = null, CancellationToken ct = default);
}
