param location string
param resourceToken string
param tags object
param principalId string = ''
param googleClientId string = ''
@secure()
param googleClientSecret string = ''
param microsoftClientId string = ''
@secure()
param microsoftClientSecret string = ''

var googleEnabled = !empty(googleClientId) && !empty(googleClientSecret)
var microsoftEnabled = !empty(microsoftClientId) && !empty(microsoftClientSecret)

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
  // Legacy single-tenant containers (preserved for backwards compatibility
  // during the SaaS migration — see docs/saas-migration-plan.md).
  'users'
  'activities'
  'participants'
  'scans'
  'settings'
  // SaaS multi-tenant containers (Phase 1).
  'organizations'
  'memberships'
  'events'
  'invitations'
  'audit_events'
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

// ---------- Key Vault (Phase 0 hardening: stores the JWT signing key) ----------
// RBAC-authorized so the App Service managed identity can read secrets without
// access policies, and the deploying user can manage them via Azure RBAC.
resource keyVault 'Microsoft.KeyVault/vaults@2024-04-01-preview' = {
  name: 'kv-${take(resourceToken, 18)}'
  location: location
  tags: tags
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enabledForTemplateDeployment: true
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    publicNetworkAccess: 'Enabled'
  }
}

// Grant the API's managed identity Secrets User on the vault.
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
resource apiKeyVaultRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, apiIdentity.id, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: apiIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Same role for the deploying user so secrets can be inspected locally.
resource principalKeyVaultRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(principalId)) {
  name: guid(keyVault.id, principalId, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: principalId
  }
}

// Stable per-deployment JWT signing key (192 chars of high-entropy base64
// derived from the resource group id). Rotated by re-deploying with a
// different resourceToken or by manually overwriting the secret.
var jwtSigningKeyValue = base64('${uniqueString(resourceGroup().id, 'jwt-a')}${uniqueString(resourceGroup().id, 'jwt-b')}${uniqueString(resourceGroup().id, 'jwt-c')}')

resource jwtSigningKeySecret 'Microsoft.KeyVault/vaults/secrets@2024-04-01-preview' = {
  parent: keyVault
  name: 'jwt-signing-key'
  properties: {
    value: jwtSigningKeyValue
    contentType: 'OnePass JWT HS256 signing key'
    attributes: { enabled: true }
  }
}

// Optional: Google OAuth client secret. Only created when both client id
// and secret have been supplied as deploy parameters; the App Service
// appSettings reference below is also gated, so leaving the parameters
// empty in dev simply disables the "Continue with Google" button.
resource googleClientSecretKv 'Microsoft.KeyVault/vaults/secrets@2024-04-01-preview' = if (googleEnabled) {
  parent: keyVault
  name: 'google-client-secret'
  properties: {
    value: googleClientSecret
    contentType: 'Google OAuth client secret'
    attributes: { enabled: true }
  }
}

// Optional: Microsoft Account / Entra ID app registration client secret.
resource microsoftClientSecretKv 'Microsoft.KeyVault/vaults/secrets@2024-04-01-preview' = if (microsoftEnabled) {
  parent: keyVault
  name: 'microsoft-client-secret'
  properties: {
    value: microsoftClientSecret
    contentType: 'Microsoft OAuth client secret'
    attributes: { enabled: true }
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
      appSettings: concat([
        { name: 'ASPNETCORE_ENVIRONMENT', value: 'Production' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
        { name: 'Cosmos__Endpoint', value: cosmos.properties.documentEndpoint }
        { name: 'Cosmos__DatabaseName', value: 'onepass' }
        { name: 'AZURE_CLIENT_ID', value: apiIdentity.properties.clientId }
        { name: 'Jwt__Issuer', value: 'onepass' }
        { name: 'Jwt__Audience', value: 'onepass' }
        // Phase 0 hardening: signing key lives in Key Vault and is fetched
        // at startup via the user-assigned managed identity (see
        // keyVaultReferenceIdentity above). Rotating the secret in the vault
        // takes effect on the next App Service slot restart.
        { name: 'Jwt__SigningKey', value: '@Microsoft.KeyVault(SecretUri=${jwtSigningKeySecret.properties.secretUri})' }
        { name: 'Retention__RetentionDays', value: '30' }
        // Dev deployment seed admin: keeps the well-known admin@onepass.local
        // account available with a known password so the team can sign in
        // immediately after `azd up`. CHANGE both flags before any production
        // rollout — leave SeedDefaultAdmin=false and provision the first owner
        // via the bootstrap script (docs/saas-migration-plan.md §Phase 0).
        { name: 'Bootstrap__SeedDefaultAdmin', value: 'true' }
        { name: 'Bootstrap__DefaultAdminPassword', value: 'OnePass2026!' }
        // Same-origin: the SPA is served from the same host, no additional CORS origin required.
        { name: 'Cors__Origins__0', value: 'https://app-${resourceToken}.azurewebsites.net' }
      ], googleEnabled ? [
        // Google OAuth wiring is appended only when both deploy parameters
        // were supplied, so that omitting them simply leaves the
        // "Continue with Google" button hidden in the SPA (the API
        // /api/auth/providers endpoint reports `google: false`).
        { name: 'Auth__Google__ClientId', value: googleClientId }
        { name: 'Auth__Google__ClientSecret', value: '@Microsoft.KeyVault(SecretUri=${googleClientSecretKv.properties.secretUri})' }
        { name: 'Auth__Google__SpaCallbackPath', value: '/auth/callback' }
      ] : [], microsoftEnabled ? [
        // Microsoft Account / Entra ID wiring — same conditional pattern
        // as Google. The SPA hides "Continue with Microsoft" when these
        // settings are absent.
        { name: 'Auth__Microsoft__ClientId', value: microsoftClientId }
        { name: 'Auth__Microsoft__ClientSecret', value: '@Microsoft.KeyVault(SecretUri=${microsoftClientSecretKv.properties.secretUri})' }
        { name: 'Auth__Microsoft__SpaCallbackPath', value: '/auth/callback' }
      ] : [])
    }
  }
}

output appEndpoint string = 'https://${app.properties.defaultHostName}'
output cosmosEndpoint string = cosmos.properties.documentEndpoint
output cosmosAccountName string = cosmos.name
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
// Reminder for operators: the Google OAuth client must allow this exact
// redirect URI in the Google Cloud Console (APIs & Services > Credentials).
output googleRedirectUri string = 'https://${app.properties.defaultHostName}/api/auth/google/callback'
output microsoftRedirectUri string = 'https://${app.properties.defaultHostName}/api/auth/microsoft/callback'
