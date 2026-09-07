[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $RegistryName,
  [string] $Version = '0.1.330',
  [string] $ApiDirectory = (Join-Path $PSScriptRoot '..\api')
)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command az -ErrorAction SilentlyContinue)) { throw 'Azure CLI is required.' }
$resolvedApi = Resolve-Path -LiteralPath $ApiDirectory -ErrorAction Stop
if (-not (Test-Path -LiteralPath (Join-Path $resolvedApi 'Dockerfile'))) { throw 'API Dockerfile was not found.' }
if ($Version -notmatch '^\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$') { throw 'Version must be a valid immutable release tag.' }

$image = "apex-ledger-api:$Version"
az acr show --name $RegistryName --only-show-errors --output none
if ($LASTEXITCODE -ne 0) { throw "Registry '$RegistryName' is unavailable." }

az acr build `
  --registry $RegistryName `
  --image $image `
  --file (Join-Path $resolvedApi 'Dockerfile') `
  $resolvedApi
if ($LASTEXITCODE -ne 0) { throw 'Azure Container Registry build failed.' }

$digest = az acr repository show --name $RegistryName --image $image --query digest --output tsv
if ($LASTEXITCODE -ne 0 -or -not $digest) { throw 'The built image digest could not be verified.' }
Write-Output "$RegistryName.azurecr.io/apex-ledger-api@$digest"
