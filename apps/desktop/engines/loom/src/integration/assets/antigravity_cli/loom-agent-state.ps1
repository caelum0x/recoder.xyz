# installed by loom
# managed by loom; reinstalling or updating the integration overwrites this file.
# add custom hooks beside this file instead of editing it.
# LOOM_INTEGRATION_ID=antigravity_cli
# LOOM_INTEGRATION_VERSION=1

# Session-only: this hook reports the Antigravity conversation so Loom can
# resume the pane. Lifecycle state comes from Loom's screen detection.

param([string]$Action = "")

# Antigravity CLI expects a JSON object on stdout and this hook never injects
# anything, so every exit path emits an empty object.
function Exit-Hook {
    Write-Output "{}"
    exit 0
}

if ($Action -ne "session") { Exit-Hook }
if ($env:LOOM_ENV -ne "1") { Exit-Hook }
if ([string]::IsNullOrWhiteSpace($env:LOOM_PANE_ID)) { Exit-Hook }

$inputText = [Console]::In.ReadToEnd()
try {
    $payload = if ([string]::IsNullOrWhiteSpace($inputText)) { $null } else { $inputText | ConvertFrom-Json }
} catch {
    Exit-Hook
}

if ($null -eq $payload) { Exit-Hook }

$conversationId = if ($payload.conversationId -is [string]) { $payload.conversationId } else { $null }
if ([string]::IsNullOrWhiteSpace($conversationId)) { Exit-Hook }

$seq = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
try {
    $sessionArgs = @(
        "pane",
        "report-agent-session",
        $env:LOOM_PANE_ID,
        "--source",
        "loom:antigravity_cli",
        "--agent",
        "agy",
        "--seq",
        "$seq",
        "--agent-session-id",
        "$conversationId"
    )
    if ($payload.transcriptPath -is [string] -and -not [string]::IsNullOrWhiteSpace($payload.transcriptPath)) {
        $sessionArgs += @("--agent-session-path", "$($payload.transcriptPath)")
    }
    & loom @sessionArgs 2>$null | Out-Null
} catch {
}

Exit-Hook
