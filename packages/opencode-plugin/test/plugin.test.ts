import { describe, expect, it } from "vitest"

// Import from the built dist to prove the shipped artifact loads under Node ESM.
import { tool } from "../dist/index.js"
import type { Plugin, PluginInput } from "../dist/index.js"

describe("@recoder/opencode-plugin", () => {
  it("tool() builds a tool definition with zod args and preserves execute", async () => {
    const definition = tool({
      description: "adds two numbers",
      args: {
        a: tool.schema.number(),
        b: tool.schema.number(),
      },
      async execute(args) {
        return String(args.a + args.b)
      },
    })

    expect(definition.description).toBe("adds two numbers")
    expect(definition.args.a.safeParse(1).success).toBe(true)
    expect(definition.args.a.safeParse("one").success).toBe(false)

    const result = await definition.execute({ a: 2, b: 3 }, {} as never)
    expect(result).toBe("5")
  })

  it("exposes the zod instance used for tool args", () => {
    expect(typeof tool.schema.object).toBe("function")
  })

  it("type-level: Plugin hook contract is importable", () => {
    const plugin: Plugin = async (_input: PluginInput) => ({
      "permission.ask": async () => {},
    })
    expect(typeof plugin).toBe("function")
  })
})
