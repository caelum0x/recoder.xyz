import { describe, expect, it } from "vitest"

// Import from the built dist to prove the shipped artifact loads under Node ESM.
// Importing the index also smoke-loads the entire schema module graph.
import * as schema from "../dist/index.js"
import { WorkspaceID } from "../dist/workspace-id.js"
import { SessionID } from "../dist/session-id.js"

describe("@recoder/opencode-schema", () => {
  it("loads the full wire-model module graph from dist", () => {
    expect(schema.Session).toBeDefined()
    expect(schema.Permission).toBeDefined()
    expect(schema.Event).toBeDefined()
    expect(schema.Model).toBeDefined()
    expect(schema.Provider).toBeDefined()
  })

  it("WorkspaceID statics create and validate branded ids", () => {
    const id = WorkspaceID.create()
    expect(id.startsWith("wrk_")).toBe(true)
    expect(WorkspaceID.ascending(id)).toBe(id)
    expect(() => WorkspaceID.ascending("bogus_123")).toThrow()
  })

  it("SessionID statics create ids with the ses prefix", () => {
    const id = SessionID.create()
    expect(id.startsWith("ses_")).toBe(true)
  })
})
