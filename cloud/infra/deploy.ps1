[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $ResourceGroup,
  [Parameter(Mandatory)] [string] $ParametersFile,
  [ValidateSet('Foundation','Application')] [string] $Stage,
  [switch] $ApproveDeployment,
  [string] $TemplateFile = (Join-Path $PSScriptRoot 'main.bicep')
)

$ErrorActionPreference = 'Stop'
if (-not $ApproveDeployment) {
  throw 'Deployment was not approved. Review validate.ps1 output, then rerun with -ApproveDeployment.'
}

$deployApi = if ($Stage -eq 'Application') { 'true' } else { 'false' }
& (Join-Path $PSScriptRoot 'validate.ps1') -ResourceGroup $ResourceGroup -ParametersFile $ParametersFile -DeployApi ($Stage -eq 'Application') -TemplateFile $TemplateFile
$deploymentName = "apex-ledger-$($Stage.ToLowerInvariant())-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

az deployment group create `
  --name $deploymentName `
  --resource-group $ResourceGroup `
  --template-file $TemplateFile `
  --parameters $ParametersFile deployApi=$deployApi `
  --only-show-errors `
  --output json
if ($LASTEXITCODE -ne 0) { throw "Azure $Stage deployment failed." }

Write-Host "Apex Ledger $Stage deployment completed as '$deploymentName'."
