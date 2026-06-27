import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { resolveConductorTmux } from "./tmux-path-resolver"

describe("resolveConductorTmux (Recoder Conductor tmux substrate)", () => {
  let dir: string
  let originalConductorBin: string | undefined
  let originalBuildPath: string | undefined

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "recoder-tmux-"))
    originalConductorBin = process.env.CONDUCTOR_TMUX_BIN
    originalBuildPath = process.env.RECODER_TMUX_BUILD_PATH
    delete process.env.CONDUCTOR_TMUX_BIN
    delete process.env.RECODER_TMUX_BUILD_PATH
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    if (originalConductorBin === undefined) delete process.env.CONDUCTOR_TMUX_BIN
    else process.env.CONDUCTOR_TMUX_BIN = originalConductorBin
    if (originalBuildPath === undefined) delete process.env.RECODER_TMUX_BUILD_PATH
    else process.env.RECODER_TMUX_BUILD_PATH = originalBuildPath
  })

  it("returns null when no Conductor env is set", () => {
    expect(resolveConductorTmux()).toBeNull()
  })

  it("prefers CONDUCTOR_TMUX_BIN when the pinned binary exists", () => {
    const pinned = join(dir, "tmux")
    writeFileSync(pinned, "#!/bin/sh\n")
    process.env.CONDUCTOR_TMUX_BIN = pinned

    expect(resolveConductorTmux()).toBe(pinned)
  })

  it("falls back to RECODER_TMUX_BUILD_PATH when CONDUCTOR_TMUX_BIN is absent", () => {
    const vendored = join(dir, "vendored-tmux")
    writeFileSync(vendored, "#!/bin/sh\n")
    process.env.RECODER_TMUX_BUILD_PATH = vendored

    expect(resolveConductorTmux()).toBe(vendored)
  })

  it("ignores Conductor env that points at a missing binary", () => {
    process.env.CONDUCTOR_TMUX_BIN = join(dir, "does-not-exist")

    expect(resolveConductorTmux()).toBeNull()
  })

  it("prefers CONDUCTOR_TMUX_BIN over RECODER_TMUX_BUILD_PATH when both exist", () => {
    const pinned = join(dir, "pinned")
    const vendored = join(dir, "vendored")
    writeFileSync(pinned, "#!/bin/sh\n")
    writeFileSync(vendored, "#!/bin/sh\n")
    process.env.CONDUCTOR_TMUX_BIN = pinned
    process.env.RECODER_TMUX_BUILD_PATH = vendored

    expect(resolveConductorTmux()).toBe(pinned)
  })
})
