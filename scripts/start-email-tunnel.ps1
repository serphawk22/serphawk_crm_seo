param(
    [ValidateRange(1, 65535)][int]$Port = 8000,
    [switch]$Stop
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $projectRoot '.local\tunnel'
$statePath = Join-Path $runtime 'session.json'
$envPath = Join-Path $projectRoot '.env'
$binary = Join-Path $runtime 'cloudflared.exe'
$logPath = Join-Path $runtime 'cloudflared.log'
New-Item -ItemType Directory -Force $runtime | Out-Null

# Reuse only the process we started, never an unrelated process with a reused PID.
if (Test-Path -LiteralPath $statePath) {
    $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
    $existing = Get-Process -Id $state.ProcessId -ErrorAction SilentlyContinue
    if ($existing -and $existing.Path -eq $binary -and
        $existing.StartTime.ToUniversalTime().Ticks.ToString() -eq $state.StartTicks) {
        if ($Stop) {
            Stop-Process -Id $existing.Id
            Remove-Item -LiteralPath $statePath
            Write-Host 'Tunnel stopped. Existing email pixel URLs are now offline.'
        } else {
            Write-Host "Tunnel already running: $($state.Url) -> port $($state.Port)"
            Write-Host 'Use -Stop before starting a new tunnel or changing ports.'
        }
        return
    }
    Remove-Item -LiteralPath $statePath
}
if ($Stop) { Write-Host 'No managed tunnel is running.'; return }
if (-not (Test-Path -LiteralPath $envPath)) { throw "Missing $envPath" }
if (-not (Test-Path -LiteralPath $binary)) {
    throw "Download cloudflared first; see docs/email-tracking-tunnel.md. Expected: $binary"
}

# Explicit empty config avoids a user's named-tunnel config affecting Quick Tunnels.
$configPath = Join-Path $runtime 'quick-tunnel.yml'
[IO.File]::WriteAllText($configPath, "{}")
$tunnel = Start-Process -FilePath $binary -WindowStyle Hidden -PassThru `
    -ArgumentList @('tunnel', '--config', "`"$configPath`"", '--no-autoupdate',
        '--protocol', 'http2', '--url', "http://127.0.0.1:$Port") `
    -RedirectStandardError $logPath `
    -RedirectStandardOutput (Join-Path $runtime 'stdout.log')

try {
    $deadline = (Get-Date).AddSeconds(90)
    $publicUrl = $null
    $verified = $false
    $pixelPath = Join-Path $runtime 'probe.gif'
    $agents = @(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)'
    )
    while ((Get-Date) -lt $deadline -and -not $verified) {
        if ($tunnel.HasExited) { throw "cloudflared exited. See $logPath" }
        $log = Get-Content -Raw -LiteralPath $logPath -ErrorAction SilentlyContinue
        if ($log -match 'https://[a-z0-9-]+\.trycloudflare\.com') { $publicUrl = $Matches[0] }
        if ($publicUrl) {
            try {
                foreach ($agent in $agents) {
                    # ID 0 does not correspond to a sent email; no real open is recorded.
                    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 `
                        -Uri "$publicUrl/webhook/track-email-open?id=0" -UserAgent $agent `
                        -OutFile $pixelPath -PassThru
                    $bytes = [IO.File]::ReadAllBytes($pixelPath)
                    if ($response.StatusCode -ne 200 -or
                        $response.Headers['Content-Type'] -notmatch '^image/gif' -or
                        $bytes.Length -lt 10 -or
                        [Text.Encoding]::ASCII.GetString($bytes, 0, 6) -notmatch '^GIF8[79]a$' -or
                        $bytes[6] -ne 1 -or $bytes[7] -ne 0 -or
                        $bytes[8] -ne 1 -or $bytes[9] -ne 0) {
                        throw 'Public endpoint did not return a 1x1 GIF.'
                    }
                }
                $verified = $true
            } catch {
                $lastProbeError = $_.Exception.Message
            }
        }
        if (-not $verified) { Start-Sleep -Seconds 2 }
    }
    if (-not $verified) { throw "Pixel verification failed: $lastProbeError. See $logPath" }

    $envText = [IO.File]::ReadAllText($envPath)
    $entry = "PUBLIC_BASE_URL=`"$publicUrl`""
    if ($envText -match '(?m)^\s*PUBLIC_BASE_URL\s*=') {
        $envText = [regex]::Replace($envText, '(?m)^[\t ]*PUBLIC_BASE_URL[\t ]*=[^\r\n]*', $entry)
    } else {
        $envText = $envText.TrimEnd() + "`r`n$entry`r`n"
    }
    [IO.File]::WriteAllText($envPath, $envText, (New-Object Text.UTF8Encoding($false)))
    @{
        ProcessId = $tunnel.Id
        StartTicks = $tunnel.StartTime.ToUniversalTime().Ticks.ToString()
        Url = $publicUrl
        Port = $Port
    } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
    Write-Host "Tunnel running: $publicUrl -> http://127.0.0.1:$Port"
    Write-Host 'Verified 1x1 image/gif with browser and GoogleImageProxy User-Agents.'
    Write-Host 'Updated PUBLIC_BASE_URL in .env. Restart the backend before sending new emails.'
    Write-Host "Logs: $logPath"
    Write-Host 'Stop: powershell -ExecutionPolicy Bypass -File scripts/start-email-tunnel.ps1 -Stop'
} catch {
    if (-not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id }
    throw
}
