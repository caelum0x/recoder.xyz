# installed by loom
# managed by loom; reinstalling or updating the integration overwrites this file.
# add custom hooks beside this file instead of editing it.
# LOOM_INTEGRATION_ID=mastracode
# LOOM_INTEGRATION_VERSION=2

param([string]$Action = "")

if ($Action -notin @("session", "working", "idle", "blocked")) { exit 0 }
if ($env:LOOM_ENV -ne "1") { exit 0 }
if ([string]::IsNullOrWhiteSpace($env:LOOM_PANE_ID)) { exit 0 }

$inputText = [Console]::In.ReadToEnd()
try {
    $payload = if ([string]::IsNullOrWhiteSpace($inputText)) { $null } else { $inputText | ConvertFrom-Json }
} catch {
    $payload = $null
}

$sessionId = if ($null -ne $payload -and $payload.session_id -is [string]) { $payload.session_id } else { $null }
$seq = [DateTime]::UtcNow.Ticks
$loom = if ([string]::IsNullOrWhiteSpace($env:LOOM_BIN_PATH)) { "loom" } else { $env:LOOM_BIN_PATH }
try {
    if ($Action -eq "session") {
        if ([string]::IsNullOrWhiteSpace($sessionId)) { exit 0 }
        & $loom pane report-agent-session $env:LOOM_PANE_ID --source loom:mastracode --agent mastracode --seq $seq --session-start-source startup --agent-session-id $sessionId 2>$null | Out-Null
    } else {
        $args = @("pane", "report-agent", $env:LOOM_PANE_ID, "--source", "loom:mastracode", "--agent", "mastracode", "--state", $Action, "--seq", "$seq")
        if (-not [string]::IsNullOrWhiteSpace($sessionId)) {
            $args += @("--agent-session-id", $sessionId)
        }
        & $loom @args 2>$null | Out-Null
    }
} catch {
}
