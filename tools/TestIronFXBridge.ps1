param(
  [int]$Port = 32178,
  [switch]$Open
)

$ErrorActionPreference = "Stop"

$path = if ($Open) { "open" } else { "health" }
$uri = "http://127.0.0.1:$Port/$path"

try {
  $response = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $uri -TimeoutSec 2
  Write-Host "IronFX bridge responded:"
  Write-Host $response.Content
} catch {
  Write-Host "IronFX bridge did not respond on $uri"
  Write-Host $_.Exception.Message
  exit 1
}
