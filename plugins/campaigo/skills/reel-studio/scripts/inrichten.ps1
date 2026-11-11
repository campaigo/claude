# Richt de Reel-studio van Campaigo in op Windows.
#   powershell -NoProfile -ExecutionPolicy Bypass -File inrichten.ps1 [-Studio "<map>"]
# Staat er geen Node 18 of nieuwer op de computer, dan zet dit een eigen Node in <studio>\.studio\node
# (zonder installatie en zonder beheerdersrechten). Daarna draait het inrichten.mjs; de uitkomst is JSON.
param([string]$Studio = (Join-Path $HOME "Campaigo Reels"))
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$NodeVersie = "v24.11.1"
$hier = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-Node($pad) {
  try { $v = & $pad --version 2>$null; if ($v -match '^v(\d+)\.') { return [int]$Matches[1] -ge 18 } } catch {}
  return $false
}

$eigen = Join-Path $Studio ".studio\node\node.exe"
$node = $null
if (Test-Path $eigen) { $node = $eigen }
elseif ((Get-Command node -ErrorAction SilentlyContinue) -and (Test-Node "node")) { $node = (Get-Command node).Source }
else {
  New-Item -ItemType Directory -Force (Join-Path $Studio ".studio") | Out-Null
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "arm64" } else { "x64" }
  $naam = "node-$NodeVersie-win-$arch"
  $zip = Join-Path $env:TEMP "$naam.zip"
  $tmp = Join-Path $env:TEMP "campaigo-node"
  try {
    Invoke-WebRequest "https://nodejs.org/dist/$NodeVersie/$naam.zip" -OutFile $zip -UseBasicParsing
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    Expand-Archive $zip -DestinationPath $tmp -Force
    $doel = Join-Path $Studio ".studio\node"
    if (Test-Path $doel) { Remove-Item -Recurse -Force $doel }
    Move-Item (Join-Path $tmp $naam) $doel
  } catch {
    Write-Output (@{ ok = $false; fout = "Node downloaden lukte niet: $($_.Exception.Message)" } | ConvertTo-Json -Compress)
    exit 1
  } finally {
    if (Test-Path $zip) { Remove-Item -Force $zip }
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  }
  $node = $eigen
}
& $node (Join-Path $hier "inrichten.mjs") --studio $Studio
exit $LASTEXITCODE
