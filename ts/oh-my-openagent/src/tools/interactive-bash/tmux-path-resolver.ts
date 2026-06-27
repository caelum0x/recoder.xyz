import { existsSync } from "node:fs"
import { spawn } from "bun"

let tmuxPath: string | null = null
let initPromise: Promise<string | null> | null = null

/**
 * Resolve the tmux binary the Recoder Conductor pins, if this harness is running
 * inside a Conductor pane. Mirrors `docker-backend/src/conductor/tmux-path.ts`:
 *
 *   1. CONDUCTOR_TMUX_BIN — absolute path to the pinned binary the Conductor drives.
 *   2. RECODER_TMUX_BUILD_PATH — the vendored tmux build path.
 *
 * When set and present, the harness must drive the *same* tmux binary the
 * Conductor uses so background/subagent panes survive the substrate the same way.
 * Falls back to the regular `which tmux` lookup when neither is configured.
 */
export function resolveConductorTmux(): string | null {
  const candidates = [
    process.env.CONDUCTOR_TMUX_BIN,
    process.env.RECODER_TMUX_BUILD_PATH,
  ]
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

async function findTmuxPath(): Promise<string | null> {
  const conductorTmux = resolveConductorTmux()
  if (conductorTmux) {
    return conductorTmux
  }

  const isWindows = process.platform === "win32"
  const cmd = isWindows ? "where" : "which"

  try {
    const proc = spawn([cmd, "tmux"], {
      stdout: "pipe",
      stderr: "pipe",
    })

    const exitCode = await proc.exited
    if (exitCode !== 0) {
      return null
    }

    const stdout = await new Response(proc.stdout).text()
    const path = stdout.trim().split("\n")[0]

    if (!path) {
      return null
    }

    const verifyProc = spawn([path, "-V"], {
      stdout: "pipe",
      stderr: "pipe",
    })

    const verifyExitCode = await verifyProc.exited
    if (verifyExitCode !== 0) {
      return null
    }

    return path
  } catch {
    return null
  }
}

export async function getTmuxPath(): Promise<string | null> {
  if (tmuxPath !== null) {
    return tmuxPath
  }

  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    const path = await findTmuxPath()
    tmuxPath = path
    return path
  })()

  return initPromise
}

export function getCachedTmuxPath(): string | null {
  return tmuxPath
}

export function startBackgroundCheck(): void {
  if (!initPromise) {
    initPromise = getTmuxPath()
    initPromise.catch(() => {})
  }
}
