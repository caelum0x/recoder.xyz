/**
 * Recoder RunEvent emission seam.
 *
 * This runtime is owned by Recoder and driven by the Recoder Runtime subsystem
 * (docs/subsystems/runtime.md). When Recoder drives this opencode CLI it consumes
 * the ACP session/tool stream and normalizes it into the canonical `RunEvent`
 * stream (`@recoder/agent-os` domain/event.ts). To let the control plane correlate
 * this runtime's own session activity to a run WITHOUT a side channel, the
 * Conductor sets `RECODER_RUN_ID` / `RECODER_TASK_ID` and an output target
 * (`RECODER_RUNEVENT_PATH` for a JSONL file, or `RECODER_RUNEVENT_FD` for an open
 * file descriptor). When neither the run id nor an output target is set, this
 * module is fully inert — opencode behaves exactly as upstream.
 *
 * The emitted records intentionally match the Recoder `RunEvent` shape so the
 * runtime adapter can forward them straight through with no re-mapping.
 */
import { writeSync } from "node:fs"
import { appendFile } from "node:fs/promises"

/** Mirror of `@recoder/agent-os` domain/event.ts RunEventType. */
export type RunEventType =
  | "started"
  | "state_transition"
  | "log"
  | "artifact"
  | "needs_input"
  | "verified"
  | "approval_requested"
  | "handoff"
  | "failed"
  | "completed"

/** Mirror of `@recoder/agent-os` domain/event.ts RunEvent. */
export type RunEvent = {
  eventId: string
  type: RunEventType
  taskId: string
  runId?: string
  agentId?: string
  message?: string
  artifactId?: string
  createdAt: string
  data?: Record<string, unknown>
}

export type RunEventInput = {
  readonly type: RunEventType
  readonly message?: string
  readonly artifactId?: string
  readonly data?: Record<string, unknown>
}

function readFd(): number | undefined {
  const raw = process.env["RECODER_RUNEVENT_FD"]
  if (!raw) return undefined
  const fd = Number.parseInt(raw, 10)
  return Number.isInteger(fd) && fd >= 0 ? fd : undefined
}

let counter = 0
function nextEventId(runId: string): string {
  counter += 1
  return `${runId}-oc-${Date.now().toString(36)}-${counter}`
}

/**
 * A single, process-wide RunEvent sink. Constructed once from the environment.
 * `enabled` is false unless Recoder is driving (a run id plus an output target),
 * in which case `emit` is a real, durable write — never a no-op stub.
 */
export class RecoderRunEventSink {
  readonly enabled: boolean
  private readonly runId: string
  private readonly taskId: string
  private readonly agentId?: string
  private readonly fd?: number
  private readonly filePath?: string

  constructor(envSource: NodeJS.ProcessEnv = process.env) {
    const runId = envSource["RECODER_RUN_ID"]
    const taskId = envSource["RECODER_TASK_ID"] ?? runId
    const fd = readFd()
    const filePath = envSource["RECODER_RUNEVENT_PATH"]

    this.runId = runId ?? ""
    this.taskId = taskId ?? ""
    this.agentId = envSource["RECODER_AGENT_ID"]
    this.fd = fd
    this.filePath = filePath

    this.enabled = Boolean(runId && taskId && (fd !== undefined || (filePath && filePath.length > 0)))
  }

  build(input: RunEventInput): RunEvent {
    return {
      eventId: nextEventId(this.runId),
      type: input.type,
      taskId: this.taskId,
      runId: this.runId,
      agentId: this.agentId,
      message: input.message,
      artifactId: input.artifactId,
      createdAt: new Date().toISOString(),
      data: input.data,
    }
  }

  /**
   * Emit a RunEvent. Returns the built event (or undefined when the sink is
   * disabled) so callers can also fan it out elsewhere if desired. Write failures
   * are swallowed deliberately: a broken control-plane pipe must never crash the
   * agent run, but the run itself is unaffected because this is purely additive
   * telemetry on top of the existing ACP stream.
   */
  async emit(input: RunEventInput): Promise<RunEvent | undefined> {
    if (!this.enabled) return undefined
    const event = this.build(input)
    const line = JSON.stringify(event) + "\n"
    try {
      if (this.fd !== undefined) {
        writeSync(this.fd, line)
      } else if (this.filePath) {
        await appendFile(this.filePath, line, { encoding: "utf8" })
      }
    } catch {
      // intentionally non-fatal — see method doc
    }
    return event
  }
}

let singleton: RecoderRunEventSink | undefined
export function runEventSink(): RecoderRunEventSink {
  singleton ??= new RecoderRunEventSink()
  return singleton
}

export * as RecoderRunEvent from "./recoder-runevent"
