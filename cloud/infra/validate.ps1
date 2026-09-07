[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $ResourceGroup,
  [Parameter(Mandatory)] [string] $ParametersFile,
  [bool] $DeployApi = $false,
  [string] $TemplateFile = (Join-Path $PSScriptRoot 'main.bicep')
)

$ErrorActionPreference = 'Stop'

foreach ($path in @($TemplateFile, $ParametersFile)) {
  $resolved = Resolve-Path -LiteralPath $path -ErrorAction Stop
  if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
    throw "Required deployment file was not found: $path"
  }
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
  throw 'Azure CLI is required. Install it from Microsoft, then run az login before validation.'
}

$account = az account show --output json 2>$null | ConvertFrom-Json
if (-not $account.id) {
  throw 'No active Azure subscription was found. Run az login and select the pilot subscription.'
}

$parameterText = Get-Content -LiteralPath $ParametersFile -Raw
if ($parameterText -match '<[^>]+>' -or $parameterText -match 'replace-with') {
  throw 'The parameters file still contains placeholders. Use a secure file outside source control.'
}

$group = az group show --name $ResourceGroup --output json 2>$null | ConvertFrom-Json
if (-not $group.id) {
  throw "Resource group '$ResourceGroup' does not exist in subscription '$($account.name)'."
}

Write-Host "Validating Apex Ledger infrastructure for subscription '$($account.name)' and resource group '$ResourceGroup'."
$deployApiValue = $DeployApi.ToString().ToLowerInvariant()
az bicep build --file $TemplateFile
if ($LASTEXITCODE -ne 0) { throw 'Bicep compilation failed.' }

az deployment group validate `
  --resource-group $ResourceGroup `
  --template-file $TemplateFile `
  --parameters $ParametersFile `
  --parameters deployApi=$deployApiValue `
  --only-show-errors
if ($LASTEXITCODE -ne 0) { throw 'Azure deployment validation failed.' }

az deployment group what-if `
  --resource-group $ResourceGroup `
  --template-file $TemplateFile `
  --parameters $ParametersFile `
  --parameters deployApi=$deployApiValue
if ($LASTEXITCODE -ne 0) { throw 'Azure deployment what-if failed.' }

Write-Host "Validation and what-if completed for deployApi=$deployApiValue. Review every proposed resource change before deployment."
