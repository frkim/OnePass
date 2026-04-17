using System.Collections.Concurrent;
using Azure.Data.Tables;

namespace OnePass.Api.Repositories;

/// <summary>
/// Thread-safe in-memory fallback for local development and unit tests.
/// Not persistent and not intended for production.
/// </summary>
public sealed class InMemoryTableStoreFactory : ITableStoreFactory
{
    private readonly ConcurrentDictionary<string, object> _tables = new();

    public ITableRepository<T> GetRepository<T>(string tableName) where T : class, ITableEntity, new()
    {
        return (ITableRepository<T>)_tables.GetOrAdd(tableName, _ => new InMemoryTableRepository<T>());
    }

    private sealed class InMemoryTableRepository<T> : ITableRepository<T> where T : class, ITableEntity, new()
    {
        private readonly ConcurrentDictionary<(string pk, string rk), T> _rows = new();

        public Task UpsertAsync(T entity, CancellationToken ct = default)
        {
            entity.Timestamp ??= DateTimeOffset.UtcNow;
            _rows[(entity.PartitionKey, entity.RowKey)] = entity;
            return Task.CompletedTask;
        }

        public Task<T?> GetAsync(string partitionKey, string rowKey, CancellationToken ct = default)
        {
            _rows.TryGetValue((partitionKey, rowKey), out var v);
            return Task.FromResult(v);
        }

        public Task DeleteAsync(string partitionKey, string rowKey, CancellationToken ct = default)
        {
            _rows.TryRemove((partitionKey, rowKey), out _);
            return Task.CompletedTask;
        }

        public async IAsyncEnumerable<T> QueryAsync(string? filter = null, [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
        {
            // The in-memory repo ignores the OData filter; callers perform filtering in services.
            foreach (var v in _rows.Values)
            {
                ct.ThrowIfCancellationRequested();
                yield return v;
            }
            await Task.CompletedTask;
        }
    }
}
