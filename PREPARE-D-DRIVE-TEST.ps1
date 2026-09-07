$ErrorActionPreference = "Stop"
$target = "D:\NorthLedger-Test\Final-Test\NorthLedger-Ultimate-Test"
Write-Host "North Ledger Ultimate TEST workspace"
if (!(Test-Path "D:\")) { throw "D: drive not found." }
New-Item -ItemType Directory -Force -Path $target | Out-Null
Write-Host "Target: $target"
Write-Host "Copy/extract this source into the target folder, then run WINDOWS-FINAL-GATE.cmd from that folder."
Write-Host "The TEST build must use a separate app identity/data path before installer sign-off."
