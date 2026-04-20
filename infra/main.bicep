targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the environment that can be used as part of naming resource convention, also used by azd.')
param environmentName string

@minLength(1)
@description('Primary location for all resources.')
param location string

@description('Id of the principal to assign data-plane roles (typically the deploying user).')
param principalId string = ''

@description('Google OAuth client id (Web application). Leave empty to disable Google sign-in.')
param googleClientId string = ''

@description('Google OAuth client secret. Leave empty to disable Google sign-in. Stored in Key Vault.')
@secure()
param googleClientSecret string = ''

@description('Microsoft Account / Entra ID app registration client id. Leave empty to disable Microsoft sign-in.')
param microsoftClientId string = ''

@description('Microsoft Account / Entra ID app registration client secret. Leave empty to disable Microsoft sign-in. Stored in Key Vault.')
@secure()
param microsoftClientSecret string = ''

var tags = {
  'azd-env-name': environmentName
}

var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))

resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module resources 'resources.bicep' = {
  name: 'resources'
  scope: rg
  params: {
    location: location
    resourceToken: resourceToken
    tags: tags
    principalId: principalId
    googleClientId: googleClientId
    googleClientSecret: googleClientSecret
    microsoftClientId: microsoftClientId
    microsoftClientSecret: microsoftClientSecret
  }
}

output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output AZURE_RESOURCE_GROUP string = rg.name
output SERVICE_APP_ENDPOINT_URL string = resources.outputs.appEndpoint
output AZURE_COSMOS_ENDPOINT string = resources.outputs.cosmosEndpoint
output AZURE_COSMOS_ACCOUNT string = resources.outputs.cosmosAccountName
output AZURE_KEY_VAULT_NAME string = resources.outputs.keyVaultName
output AZURE_KEY_VAULT_URI string = resources.outputs.keyVaultUri
output GOOGLE_REDIRECT_URI string = resources.outputs.googleRedirectUri
output MICROSOFT_REDIRECT_URI string = resources.outputs.microsoftRedirectUri
