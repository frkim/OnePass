using Azure;
using Azure.Data.Tables;
using OnePass.Api.Models;

namespace OnePass.Api.Repositories;

public interface ITableStoreFactory
{
    /// <summary>
    /// Returns a repository for the specified entity type and table name.
    /// Uses Azure Table Storage when configured, otherwise an in-memory fallback.
    /// </summary>
    ITableRepository<T> GetRepository<T>(string tableName) where T : class, ITableEntity, new();
}

public interface ITableRepository<T> where T : class, ITableEntity, new()
{
    Task UpsertAsync(T entity, CancellationToken ct = default);
    Task<T?> GetAsync(string partitionKey, string rowKey, CancellationToken ct = default);
    Task DeleteAsync(string partitionKey, string rowKey, CancellationToken ct = default);
    IAsyncEnumerable<T> QueryAsync(string? filter = null, CancellationToken ct = default);
}
