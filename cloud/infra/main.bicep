@description('Short globally unique prefix, lower-case letters and numbers only.')
@minLength(5)
@maxLength(12)
param prefix string
param location string = resourceGroup().location
param environmentName string = 'pilot'
param apiImageTag string = '0.1.330'
@description('False for the first foundation deployment. Set true only after the API image exists in the created registry.')
param deployApi bool = false
param allowedWebOrigin string
param authIssuer string
param authAudience string
param authJwksUri string
param invitationBaseUrl string
param emailDeliveryUrl string
param emailFromAddress string
@secure() param postgresAdministratorPassword string
@secure() param databaseAppConnectionString string
@secure() param contactSearchHmacSecret string
@secure() param mfaHmacSecret string
@secure() param emailDeliveryBearerToken string

var suffix='${prefix}-${environmentName}'
var storageName=take(replace('${prefix}${environmentName}files','-',''),24)
var vaultName=take('${suffix}-kv',24)
var apiImage='${registry.properties.loginServer}/apex-ledger-api:${apiImageTag}'

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01'={name:'${suffix}-logs' location:location properties:{retentionInDays:90 features:{enableLogAccessUsingOnlyResourcePermissions:true}}}
resource insights 'Microsoft.Insights/components@2020-02-02'={name:'${suffix}-appi' location:location kind:'web' properties:{Application_Type:'web' WorkspaceResourceId:logs.id}}
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31'={name:'${suffix}-api-id' location:location}
resource registry 'Microsoft.ContainerRegistry/registries@2023-11-01-preview'={name:take(replace('${prefix}${environmentName}acr','-',''),50) location:location sku:{name:'Basic'} properties:{adminUserEnabled:false publicNetworkAccess:'Enabled' policies:{retentionPolicy:{days:14 status:'enabled'} trustPolicy:{type:'Notary' status:'disabled'}}}}

resource network 'Microsoft.Network/virtualNetworks@2024-05-01'={name:'${suffix}-vnet' location:location properties:{addressSpace:{addressPrefixes:['10.40.0.0/16']} subnets:[
  {name:'container-apps' properties:{addressPrefix:'10.40.0.0/23' delegations:[{name:'container-apps' properties:{serviceName:'Microsoft.App/environments'}}]}}
  {name:'postgres' properties:{addressPrefix:'10.40.8.0/24' delegations:[{name:'postgres' properties:{serviceName:'Microsoft.DBforPostgreSQL/flexibleServers'}}]}}
]}}
resource containerSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing={parent:network name:'container-apps'}
resource postgresSubnet 'Microsoft.Network/virtualNetworks/subnets@2024-05-01' existing={parent:network name:'postgres'}
resource postgresDns 'Microsoft.Network/privateDnsZones@2024-06-01'={name:'private.postgres.database.azure.com' location:'global'}
resource postgresDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2024-06-01'={parent:postgresDns name:'${suffix}-postgres-link' location:'global' properties:{registrationEnabled:false virtualNetwork:{id:network.id}}}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01'={name:'${suffix}-postgres' location:location sku:{name:'Standard_D2ds_v5' tier:'GeneralPurpose'} properties:{version:'16' administratorLogin:'apexadmin' administratorLoginPassword:postgresAdministratorPassword
  network:{delegatedSubnetResourceId:postgresSubnet.id privateDnsZoneArmResourceId:postgresDns.id publicNetworkAccess:'Disabled'} highAvailability:{mode:'ZoneRedundant'} storage:{storageSizeGB:128 autoGrow:'Enabled'} backup:{backupRetentionDays:35 geoRedundantBackup:'Enabled'}} dependsOn:[postgresDnsLink]}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01'={name:storageName location:location sku:{name:'Standard_GZRS'} kind:'StorageV2' properties:{allowBlobPublicAccess:false allowSharedKeyAccess:false defaultToOAuthAuthentication:true minimumTlsVersion:'TLS1_2' supportsHttpsTrafficOnly:true publicNetworkAccess:'Enabled'
  networkAcls:{bypass:'AzureServices' defaultAction:'Deny'} encryption:{keySource:'Microsoft.Storage' services:{blob:{enabled:true keyType:'Account'} file:{enabled:true keyType:'Account'}}}}}
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01'={parent:storage name:'default' properties:{deleteRetentionPolicy:{enabled:true days:30 allowPermanentDelete:false} containerDeleteRetentionPolicy:{enabled:true days:30} isVersioningEnabled:true changeFeed:{enabled:true retentionInDays:30}}}
resource quarantine 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01'={parent:blobService name:'quarantine' properties:{publicAccess:'None'}}
resource accepted 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01'={parent:blobService name:'accepted-documents' properties:{publicAccess:'None'}}
resource defender 'Microsoft.Security/defenderForStorageSettings@2025-01-01'={scope:storage name:'current' properties:{isEnabled:true overrideSubscriptionLevelSettings:true malwareScanning:{onUpload:{isEnabled:true capGBPerMonth:100} } sensitiveDataDiscovery:{isEnabled:true}}}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01'={name:vaultName location:location properties:{tenantId:subscription().tenantId sku:{family:'A' name:'standard'} enableRbacAuthorization:true enablePurgeProtection:true softDeleteRetentionInDays:90 publicNetworkAccess:'Enabled'}}
resource dbSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01'={parent:vault name:'database-url' properties:{value:databaseAppConnectionString}}
resource contactSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01'={parent:vault name:'contact-search-hmac' properties:{value:contactSearchHmacSecret}}
resource mfaSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01'={parent:vault name:'mfa-hmac' properties:{value:mfaHmacSecret}}
resource emailSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01'={parent:vault name:'email-delivery-token' properties:{value:emailDeliveryBearerToken}}
resource keyVaultReader 'Microsoft.Authorization/roleAssignments@2022-04-01'={scope:vault name:guid(vault.id,identity.id,'key-vault-secrets-user') properties:{principalId:identity.properties.principalId principalType:'ServicePrincipal' roleDefinitionId:subscriptionResourceId('Microsoft.Authorization/roleDefinitions','4633458b-17de-408a-b874-0445c86b69e6')}}
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01'={scope:registry name:guid(registry.id,identity.id,'acr-pull') properties:{principalId:identity.properties.principalId principalType:'ServicePrincipal' roleDefinitionId:subscriptionResourceId('Microsoft.Authorization/roleDefinitions','7f951dda-4ed3-4680-a7ca-43fe172d538d')}}

resource environment 'Microsoft.App/managedEnvironments@2024-03-01'={name:'${suffix}-cae' location:location properties:{appLogsConfiguration:{destination:'log-analytics' logAnalyticsConfiguration:{customerId:logs.properties.customerId sharedKey:listKeys(logs.id,logs.apiVersion).primarySharedKey}} vnetConfiguration:{infrastructureSubnetId:containerSubnet.id internal:false}}}
resource api 'Microsoft.App/containerApps@2024-03-01' = if (deployApi) {
  name: '${suffix}-api'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: { external: true targetPort: 8080 transport: 'auto' allowInsecure: false }
      registries: [{ server: registry.properties.loginServer identity: identity.id }]
      secrets: [
        { name: 'database-url' keyVaultUrl: dbSecret.properties.secretUriWithVersion identity: identity.id }
        { name: 'contact-hmac' keyVaultUrl: contactSecret.properties.secretUriWithVersion identity: identity.id }
        { name: 'mfa-hmac' keyVaultUrl: mfaSecret.properties.secretUriWithVersion identity: identity.id }
        { name: 'email-token' keyVaultUrl: emailSecret.properties.secretUriWithVersion identity: identity.id }
      ]
    }
    template: {
      scale: { minReplicas: 2 maxReplicas: 10 rules: [{ name: 'http' http: { metadata: { concurrentRequests: '50' } } }] }
      containers: [{
        name: 'api'
        image: apiImage
        resources: { cpu: 1 memory: '2Gi' }
        probes: [
          { type: 'Liveness' httpGet: { path: '/health' port: 8080 scheme: 'HTTP' } initialDelaySeconds: 15 periodSeconds: 30 }
          { type: 'Readiness' httpGet: { path: '/ready' port: 8080 scheme: 'HTTP' } initialDelaySeconds: 10 periodSeconds: 15 }
        ]
        env: [
          { name: 'NODE_ENV' value: 'production' }
          { name: 'PORT' value: '8080' }
          { name: 'APP_VERSION' value: apiImageTag }
          { name: 'AZURE_REGION' value: location }
          { name: 'DATABASE_URL' secretRef: 'database-url' }
          { name: 'DATABASE_POOL_MAX' value: '20' }
          { name: 'DATABASE_QUERY_TIMEOUT_MS' value: '15000' }
          { name: 'AUTH_ISSUER' value: authIssuer }
          { name: 'AUTH_AUDIENCE' value: authAudience }
          { name: 'AUTH_JWKS_URI' value: authJwksUri }
          { name: 'INVITATION_BASE_URL' value: invitationBaseUrl }
          { name: 'CONTACT_SEARCH_HMAC_SECRET' secretRef: 'contact-hmac' }
          { name: 'MFA_REQUIRED' value: 'true' }
          { name: 'MFA_HMAC_SECRET' secretRef: 'mfa-hmac' }
          { name: 'EMAIL_DELIVERY_URL' value: emailDeliveryUrl }
          { name: 'EMAIL_DELIVERY_BEARER_TOKEN' secretRef: 'email-token' }
          { name: 'EMAIL_FROM_ADDRESS' value: emailFromAddress }
          { name: 'ALLOWED_ORIGINS' value: allowedWebOrigin }
        ]
      }]
    }
  }
  dependsOn: [keyVaultReader, acrPull, postgres]
}

resource web 'Microsoft.Web/staticSites@2023-12-01'={name:'${suffix}-web' location:location sku:{name:'Standard' tier:'Standard'} properties:{allowConfigFileUpdates:true enterpriseGradeCdnStatus:'Enabled' publicNetworkAccess:'Enabled'}}

output apiHostname string=deployApi?api.properties.configuration.ingress.fqdn:''
output staticWebName string=web.name
output registryServer string=registry.properties.loginServer
output postgresServer string=postgres.properties.fullyQualifiedDomainName
output storageAccount string=storage.name
output keyVaultUri string=vault.properties.vaultUri
