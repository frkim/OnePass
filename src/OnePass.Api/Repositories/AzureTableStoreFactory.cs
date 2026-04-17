using System.Runtime.CompilerServices;
using Azure;
using Azure.Data.Tables;
using Azure.Identity;

namespace OnePass.Api.Repositories;

/// <summary>
/// Azure Table Storage backed factory. When the application is configured with
/// <c>Storage:TableEndpoint</c> it uses Managed Identity (recommended for Azure),
/// otherwise it falls back to a connection string, otherwise to in-memory storage.
/// </summary>
public sealed class AzureTableStoreFactory : ITableStoreFactory
{
    private readonly TableServiceClient? _client;
    private readonly InMemoryTableStoreFactory _fallback = new();
    private readonly ILogger<AzureTableStoreFactory> _logger;

    public AzureTableStoreFactory(IConfiguration configuration, ILogger<AzureTableStoreFactory> logger)
    {
        _logger = logger;
        var endpoint = configuration["Storage:TableEndpoint"];
        var connectionString = configuration["Storage:ConnectionString"];

        if (!string.IsNullOrWhiteSpace(endpoint))
        {
            _client = new TableServiceClient(new Uri(endpoint), new DefaultAzureCredential());
            _logger.LogInformation("Using Azure Table Storage with Managed Identity at {Endpoint}", endpoint);
        }
        else if (!string.IsNullOrWhiteSpace(connectionString))
        {
            _client = new TableServiceClient(connectionString);
            _logger.LogInformation("Using Azure Table Storage with connection string");
        }
        else
        {
            _logger.LogWarning("No Storage configuration found. Using in-memory table storage (not for production).");
        }
    }

    public ITableRepository<T> GetRepository<T>(string tableName) where T : class, ITableEntity, new()
    {
        if (_client is null)
            return _fallback.GetRepository<T>(tableName);

        var table = _client.GetTableClient(tableName);
        table.CreateIfNotExists();
        return new AzureTableRepository<T>(table);
    }

    private sealed class AzureTableRepository<T> : ITableRepository<T> where T : class, ITableEntity, new()
    {
        private readonly TableClient _table;
        public AzureTableRepository(TableClient table) => _table = table;

        public Task UpsertAsync(T entity, CancellationToken ct = default) =>
            _table.UpsertEntityAsync(entity, TableUpdateMode.Replace, ct);

        public async Task<T?> GetAsync(string partitionKey, string rowKey, CancellationToken ct = default)
        {
            try
            {
                var resp = await _table.GetEntityAsync<T>(partitionKey, rowKey, cancellationToken: ct);
                return resp.Value;
            }
            catch (RequestFailedException ex) when (ex.Status == 404)
            {
                return null;
            }
        }

        public Task DeleteAsync(string partitionKey, string rowKey, CancellationToken ct = default) =>
            _table.DeleteEntityAsync(partitionKey, rowKey, cancellationToken: ct);

        public async IAsyncEnumerable<T> QueryAsync(string? filter = null, [EnumeratorCancellation] CancellationToken ct = default)
        {
            await foreach (var page in _table.QueryAsync<T>(filter, cancellationToken: ct).AsPages())
            {
                foreach (var e in page.Values) yield return e;
            }
        }
    }
}
