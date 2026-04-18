using System.Collections.Concurrent;
using System.Net;
using System.Runtime.CompilerServices;
using Azure.Identity;
using Microsoft.Azure.Cosmos;
using OnePass.Api.Models;

namespace OnePass.Api.Repositories;

/// <summary>
/// Azure Cosmos DB (NoSQL) backed factory. The same single
/// <see cref="CosmosClient"/> instance is shared across all repositories
/// (sdk-singleton-client best practice).
/// Containers are created on first use with <c>/partitionKey</c> as the
/// partition key path. The database itself is expected to already exist
/// (provisioned by Bicep as a serverless account).
/// </summary>
public sealed class CosmosTableStoreFactory : ITableStoreFactory, IAsyncDisposable
{
    private readonly CosmosClient? _client;
    private readonly string _databaseName;
    private readonly InMemoryTableStoreFactory _fallback = new();
    private readonly ConcurrentDictionary<string, object> _repositories = new();
    private readonly ILogger<CosmosTableStoreFactory> _logger;

    public CosmosTableStoreFactory(IConfiguration configuration, ILogger<CosmosTableStoreFactory> logger)
    {
        _logger = logger;
        var endpoint = configuration["Cosmos:Endpoint"];
        var connectionString = configuration["Cosmos:ConnectionString"];
        _databaseName = configuration["Cosmos:DatabaseName"] ?? "onepass";

        var options = new CosmosClientOptions
        {
            // Direct mode is preferred for production performance (sdk-connection-mode).
            ConnectionMode = ConnectionMode.Direct,
            ApplicationName = "onepass-api",
            // Use System.Text.Json so our [JsonPropertyName] attributes on entities are honored.
            UseSystemTextJsonSerializerWithOptions = new System.Text.Json.JsonSerializerOptions
            {
                PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase,
                PropertyNameCaseInsensitive = true,
            },
        };

        if (!string.IsNullOrWhiteSpace(endpoint))
        {
            _client = new CosmosClient(endpoint, new DefaultAzureCredential(), options);
            _logger.LogInformation("Using Azure Cosmos DB with Managed Identity at {Endpoint} (db={Database})", endpoint, _databaseName);
        }
        else if (!string.IsNullOrWhiteSpace(connectionString))
        {
            _client = new CosmosClient(connectionString, options);
            _logger.LogInformation("Using Azure Cosmos DB with connection string (db={Database})", _databaseName);
        }
        else
        {
            _logger.LogWarning("No Cosmos configuration found. Using in-memory store (not for production).");
        }
    }

    public ITableRepository<T> GetRepository<T>(string tableName) where T : class, IEntity, new()
    {
        if (_client is null)
            return _fallback.GetRepository<T>(tableName);

        return (ITableRepository<T>)_repositories.GetOrAdd(tableName, name =>
        {
            var container = EnsureContainer(name).GetAwaiter().GetResult();
            return new CosmosRepository<T>(container);
        });
    }

    private async Task<Container> EnsureContainer(string containerName)
    {
        var dbResponse = await _client!.CreateDatabaseIfNotExistsAsync(_databaseName);
        var props = new ContainerProperties(containerName, partitionKeyPath: "/partitionKey");
        var containerResponse = await dbResponse.Database.CreateContainerIfNotExistsAsync(props);
        return containerResponse.Container;
    }

    public async ValueTask DisposeAsync()
    {
        _client?.Dispose();
        await Task.CompletedTask;
    }

    private sealed class CosmosRepository<T> : ITableRepository<T> where T : class, IEntity, new()
    {
        private readonly Container _container;
        public CosmosRepository(Container container) => _container = container;

        public async Task UpsertAsync(T entity, CancellationToken ct = default)
        {
            await _container.UpsertItemAsync(entity, new PartitionKey(entity.PartitionKey), cancellationToken: ct);
        }

        public async Task<T?> GetAsync(string partitionKey, string rowKey, CancellationToken ct = default)
        {
            try
            {
                var resp = await _container.ReadItemAsync<T>(rowKey, new PartitionKey(partitionKey), cancellationToken: ct);
                return resp.Resource;
            }
            catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
            {
                return null;
            }
        }

        public async Task DeleteAsync(string partitionKey, string rowKey, CancellationToken ct = default)
        {
            try
            {
                await _container.DeleteItemAsync<T>(rowKey, new PartitionKey(partitionKey), cancellationToken: ct);
            }
            catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
            {
                // Idempotent delete: ignore.
            }
        }

        public async IAsyncEnumerable<T> QueryAsync(string? filter = null, [EnumeratorCancellation] CancellationToken ct = default)
        {
            // Filter is currently unused — services apply their own predicates.
            // SELECT * scans the container; for the small data sizes here this is acceptable.
            using var iterator = _container.GetItemQueryIterator<T>("SELECT * FROM c");
            while (iterator.HasMoreResults)
            {
                var page = await iterator.ReadNextAsync(ct);
                foreach (var item in page) yield return item;
            }
        }
    }
}
