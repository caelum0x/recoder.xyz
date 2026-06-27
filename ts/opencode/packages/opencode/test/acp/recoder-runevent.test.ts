import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { RecoderRunEventSink } from "@/acp/recoder-runevent"

describe("RecoderRunEventSink", () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "recoder-runevent-"))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("is inert when Recoder is not driving (no run id / no target)", async () => {
    const sink = new RecoderRunEventSink({})
    expect(sink.enabled).toBe(false)
    expect(await sink.emit({ type: "log", message: "ignored" })).toBeUndefined()
  })

  test("is inert when a run id is set but no output target", () => {
    const sink = new RecoderRunEventSink({ RECODER_RUN_ID: "run_1", RECODER_TASK_ID: "task_1" })
    expect(sink.enabled).toBe(false)
  })

  test("emits RunEvent-shaped JSONL to RECODER_RUNEVENT_PATH when driven", async () => {
    const path = join(dir, "events.jsonl")
    const sink = new RecoderRunEventSink({
      RECODER_RUN_ID: "run_42",
      RECODER_TASK_ID: "task_7",
      RECODER_AGENT_ID: "agent_oc",
      RECODER_RUNEVENT_PATH: path,
    })
    expect(sink.enabled).toBe(true)

    const event = await sink.emit({
      type: "log",
      message: "tool bash completed",
      data: { tool: "bash", status: "completed" },
    })

    expect(event).toBeDefined()
    expect(event!.type).toBe("log")
    expect(event!.taskId).toBe("task_7")
    expect(event!.runId).toBe("run_42")
    expect(event!.agentId).toBe("agent_oc")
    expect(typeof event!.eventId).toBe("string")
    expect(typeof event!.createdAt).toBe("string")

    const lines = readFileSync(path, "utf8").trim().split("\n")
    expect(lines.length).toBe(1)
    const parsed = JSON.parse(lines[0]!)
    expect(parsed).toEqual(event)
    expect(parsed.data).toEqual({ tool: "bash", status: "completed" })
  })

  test("falls back taskId to runId when task id missing", () => {
    const sink = new RecoderRunEventSink({
      RECODER_RUN_ID: "run_x",
      RECODER_RUNEVENT_PATH: join(dir, "e.jsonl"),
    })
    expect(sink.enabled).toBe(true)
    expect(sink.build({ type: "started" }).taskId).toBe("run_x")
  })

  test("produces unique event ids across emissions", () => {
    const sink = new RecoderRunEventSink({
      RECODER_RUN_ID: "run_dedupe",
      RECODER_TASK_ID: "task_dedupe",
      RECODER_RUNEVENT_PATH: join(dir, "e.jsonl"),
    })
    const a = sink.build({ type: "log" })
    const b = sink.build({ type: "log" })
    expect(a.eventId).not.toBe(b.eventId)
  })
})
