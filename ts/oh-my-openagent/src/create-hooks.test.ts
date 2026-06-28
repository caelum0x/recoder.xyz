import { describe, expect, it, mock } from "bun:test"
import { disposeCreatedHooks, type DisposableCreatedHooks } from "./create-hooks"

/**
 * Unit tests for the hook-disposal contract.
 *
 * `disposeCreatedHooks` is the teardown half of the opencode hooks bridge that the Recoder
 * runtime fuses (`drivers/opencode/opencode-hooks-bridge.ts`). A leaked hook means a leaked
 * timer/listener/child-process across runs, so its contract — dispose every present hook
 * exactly once, tolerate null/undefined/missing entries — is load-bearing and worth pinning
 * with real assertions rather than relying on it never regressing.
 *
 * These tests use plain spy functions (no module mocking, no fake subsystems): they exercise
 * the actual disposal logic against real disposable shapes.
 */
describe("disposeCreatedHooks", () => {
  it("calls dispose() on every present hook exactly once", () => {
    const claudeCode = mock(() => {})
    const commentChecker = mock(() => {})
    const runtimeFallback = mock(() => {})
    const todoContinuation = mock(() => {})
    const autoSlash = mock(() => {})

    const hooks: DisposableCreatedHooks = {
      claudeCodeHooks: { dispose: claudeCode },
      commentChecker: { dispose: commentChecker },
      runtimeFallback: { dispose: runtimeFallback },
      todoContinuationEnforcer: { dispose: todoContinuation },
      autoSlashCommand: { dispose: autoSlash },
    }

    disposeCreatedHooks(hooks)

    expect(claudeCode).toHaveBeenCalledTimes(1)
    expect(commentChecker).toHaveBeenCalledTimes(1)
    expect(runtimeFallback).toHaveBeenCalledTimes(1)
    expect(todoContinuation).toHaveBeenCalledTimes(1)
    expect(autoSlash).toHaveBeenCalledTimes(1)
  })

  it("tolerates null, undefined, and dispose-less hook entries without throwing", () => {
    const present = mock(() => {})

    const hooks: DisposableCreatedHooks = {
      claudeCodeHooks: null,
      commentChecker: undefined,
      // A hook object that exposes no dispose() — must be skipped, not crash.
      runtimeFallback: {} as { dispose?: () => void },
      todoContinuationEnforcer: { dispose: present },
      // autoSlashCommand omitted entirely.
    }

    expect(() => disposeCreatedHooks(hooks)).not.toThrow()
    expect(present).toHaveBeenCalledTimes(1)
  })

  it("disposes the remaining hooks even when one is missing dispose", () => {
    const claudeCode = mock(() => {})
    const autoSlash = mock(() => {})

    const hooks: DisposableCreatedHooks = {
      claudeCodeHooks: { dispose: claudeCode },
      commentChecker: { notDispose: true } as unknown as { dispose?: () => void },
      autoSlashCommand: { dispose: autoSlash },
    }

    disposeCreatedHooks(hooks)

    expect(claudeCode).toHaveBeenCalledTimes(1)
    expect(autoSlash).toHaveBeenCalledTimes(1)
  })

  it("is safe to call on an empty hook set", () => {
    expect(() => disposeCreatedHooks({})).not.toThrow()
  })

  it("each call to dispose triggers the underlying dispose again (idempotency is the caller's concern)", () => {
    const dispose = mock(() => {})
    const hooks: DisposableCreatedHooks = { claudeCodeHooks: { dispose } }

    disposeCreatedHooks(hooks)
    disposeCreatedHooks(hooks)

    // disposeCreatedHooks itself is stateless: it forwards to whatever dispose is present.
    // Two teardown calls forward twice — guarding against double-teardown is the owner's job,
    // and this test documents that contract so a future "swallow second call" change is caught.
    expect(dispose).toHaveBeenCalledTimes(2)
  })
})
