param location string
param resourceToken string
param tags object
param principalId string = ''

// ---------- Log Analytics + App Insights ----------
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${resourceToken}'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${resourceToken}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
  }
}

// ---------- Managed Identity ----------
resource apiIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-api-${resourceToken}'
  location: location
  tags: tags
}

// ---------- Azure Cosmos DB for NoSQL (Serverless — pay per request, cheap tier) ----------
resource cosmos 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: 'cosmos-${resourceToken}'
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    // Serverless: pay only for the RU/s consumed. Ideal for low-volume event apps.
    capabilities: [
      { name: 'EnableServerless' }
    ]
    // Key-based authentication is disabled on purpose; we use Managed Identity + RBAC.
    disableLocalAuth: true
    minimalTlsVersion: 'Tls12'
    publicNetworkAccess: 'Enabled'
  }
}

resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmos
  name: 'onepass'
  properties: {
    resource: {
      id: 'onepass'
    }
  }
}

var containerNames = [
  'users'
  'activities'
  'participants'
  'scans'
]

resource cosmosContainers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = [for name in containerNames: {
  parent: cosmosDb
  name: name
  properties: {
    resource: {
      id: name
      partitionKey: {
        paths: [ '/partitionKey' ]
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [ { path: '/*' } ]
        excludedPaths: [ { path: '/"_etag"/?' } ]
      }
    }
  }
}]

// Cosmos DB data plane RBAC: "Cosmos DB Built-in Data Contributor".
// This is the well-known built-in role id for full read/write data access.
var cosmosDataContributorRoleId = '00000000-0000-0000-0000-000000000002'

resource apiCosmosRole 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmos
  name: guid(cosmos.id, apiIdentity.id, cosmosDataContributorRoleId)
  properties: {
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    principalId: apiIdentity.properties.principalId
    scope: cosmos.id
  }
}

// Grant the deploying user data access too so they can inspect the DB in the portal.
resource principalCosmosRole 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = if (!empty(principalId)) {
  parent: cosmos
  name: guid(cosmos.id, principalId, cosmosDataContributorRoleId)
  properties: {
    roleDefinitionId: '${cosmos.id}/sqlRoleDefinitions/${cosmosDataContributorRoleId}'
    principalId: principalId
    scope: cosmos.id
  }
}

// ---------- App Service plan (Linux, B1) ----------
resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'plan-${resourceToken}'
  location: location
  tags: tags
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

// ---------- Single App Service (serves both the API and the bundled SPA) ----------
resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: 'app-${resourceToken}'
  location: location
  tags: union(tags, { 'azd-service-name': 'app' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${apiIdentity.id}': {}
    }
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    keyVaultReferenceIdentity: apiIdentity.id
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|10.0'
      alwaysOn: false
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [
        { name: 'ASPNETCORE_ENVIRONMENT', value: 'Production' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
        { name: 'Cosmos__Endpoint', value: cosmos.properties.documentEndpoint }
        { name: 'Cosmos__DatabaseName', value: 'onepass' }
        { name: 'AZURE_CLIENT_ID', value: apiIdentity.properties.clientId }
        { name: 'Jwt__Issuer', value: 'onepass' }
        { name: 'Jwt__Audience', value: 'onepass' }
        // Stable per-environment signing key derived from the resource group id.
        // For stronger guarantees, override with a Key Vault reference App Setting:
        //   @Microsoft.KeyVault(SecretUri=https://<vault>.vault.azure.net/secrets/jwt-signing-key/)
        { name: 'Jwt__SigningKey', value: base64('${uniqueString(resourceGroup().id, 'jwt-a')}${uniqueString(resourceGroup().id, 'jwt-b')}${uniqueString(resourceGroup().id, 'jwt-c')}') }
        { name: 'Retention__RetentionDays', value: '30' }
        // Same-origin: the SPA is served from the same host, no additional CORS origin required.
        { name: 'Cors__Origins__0', value: 'https://app-${resourceToken}.azurewebsites.net' }
      ]
    }
  }
}

output appEndpoint string = 'https://${app.properties.defaultHostName}'
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output cosmosAccountName string = cosmos.name
