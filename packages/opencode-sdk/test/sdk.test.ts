import { afterEach, describe, expect, it } from "vitest"

// Import from the built dist to prove the shipped artifact loads under Node ESM.
import { createOpencodeClient, createOpencodeServer, OpencodeClient } from "../dist/index.js"
import { bindAbort, stop } from "../dist/process.js"

describe("@recoder/opencode-sdk", () => {
  it("creates a client with the generated API surface", () => {
    const client = createOpencodeClient({ baseUrl: "http://127.0.0.1:9" })
    expect(client).toBeInstanceOf(OpencodeClient)
    expect(typeof client.session.list).toBe("function")
    expect(typeof client.session.prompt).toBe("function")
    expect(typeof client.app.agents).toBe("function")
    expect(typeof client.event.subscribe).toBe("function")
  })

  it("exposes server lifecycle helpers", () => {
    expect(typeof createOpencodeServer).toBe("function")
    expect(typeof stop).toBe("function")
    expect(typeof bindAbort).toBe("function")
  })

  describe("createOpencodeServer without an opencode binary", () => {
    const originalPath = process.env.PATH
    afterEach(() => {
      process.env.PATH = originalPath
    })

    it("rejects instead of hanging when the binary cannot be spawned", async () => {
      // Blank PATH so cross-spawn cannot find `opencode`, regardless of host setup.
      process.env.PATH = ""
      await expect(
        createOpencodeServer({ hostname: "127.0.0.1", port: 0, timeout: 3000 }),
      ).rejects.toThrow()
    })
  })
})
