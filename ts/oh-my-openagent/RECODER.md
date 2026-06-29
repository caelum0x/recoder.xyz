<h1 align="center">@recoder/opencode-harness</h1>

<h3 align="center">The opencode coding-agent surface for Recoder's Conductor</h3>

<p align="center">
  A batteries-included <a href="https://opencode.ai">opencode</a> plugin — multi-model
  orchestration, parallel background agents, crafted LSP/AST tools — vendored and owned
  by Recoder and wired to the Recoder control plane.<br/>
  Forked from <a href="https://github.com/code-yeongyu/oh-my-openagent">oh-my-opencode</a>
  (by YeonGyu-Kim), kept attributed below.
</p>

<p align="center">
  <a href="https://recoder.xyz"><strong>Recoder</strong></a> &nbsp;&middot;&nbsp;
  <a href="../../docker-backend/src/conductor/README.md"><strong>Conductor</strong></a>
</p>

---

## What this is

`@recoder/opencode-harness` is Recoder's **opencode driver surface**. Recoder is an
Agent OS control plane that drives multiple coding-agent runtimes (Claude Code, Codex,
opencode, pi, in-process agents) behind one `RuntimeDriver` contract. This package is
the **opencode fusion target**: it is
the opencode plugin Recoder loads into the user's `opencode` CLI to add tools, hooks,
and the tmux runtime config the Conductor expects.

It is published under the `@recoder` scope and ships two CLI bins:

| Bin | Purpose |
| --- | --- |
| `recoder-opencode` | Recoder-branded entry point (alias) |
| `oh-my-opencode` | Backward-compatible entry point |

Both wrap the same prebuilt native CLI (`oh-my-opencode-<os>-<arch>`,
shipped as `optionalDependencies`).

## What Recoder owns / changed (beyond branding)

These are real behavioral changes, not just identity edits:

### 1. Conductor tmux substrate resolution

`src/tools/interactive-bash/tmux-path-resolver.ts` now resolves the tmux binary
through Recoder's Conductor substrate **before** falling back to `which tmux`:

1. `CONDUCTOR_TMUX_BIN` — the pinned tmux binary the Conductor drives.
2. `RECODER_TMUX_BUILD_PATH` — the vendored tmux build path.

This mirrors `docker-backend/src/conductor/tmux-path.ts` and `ts/dmux/src/utils/tmuxBin.ts`,
so when this harness runs inside a Conductor pane, its interactive-bash, background-agent,
and tmux-subagent features drive the **same** pinned tmux the Conductor uses — instead of
whatever `tmux` happens to be on `PATH`. That matters because the Conductor's panes must
survive a backend restart, which only works against the pinned/vendored binary.

Covered by `src/tools/interactive-bash/tmux-path-resolver.test.ts`.

### 2. Conductor-correlatable startup identity

`src/index.ts` emits a Recoder-tagged startup log line (`[recoder] opencode harness
loading`) carrying the surface name, package name, working directory, and the resolved
Conductor tmux binary. The Conductor tails the harness log to attribute the opencode
coding-agent surface to a run.

### 3. Recoder ownership identity

- npm package renamed to `@recoder/opencode-harness`, authored by Recoder, with the
  original author preserved in `contributors`.
- `recoder-opencode` CLI bin alias added.
- `RECODER_SURFACE_NAME` / `RECODER_PACKAGE_NAME` constants in
  `src/shared/plugin-identity.ts`.

### Intentionally NOT renamed

`PLUGIN_NAME` / `CONFIG_BASENAME` (`oh-my-openagent`) and the platform binary base name
(`oh-my-opencode`) are the **opencode-facing** identity: the name opencode uses to resolve
this plugin in `opencode.json`, the basename of on-disk plugin config files, and the
published native-binary package family. Renaming them would break plugin resolution,
existing user configs, and native-binary resolution — so they are kept and documented as
load-bearing in `plugin-identity.ts`, `bin/oh-my-opencode.js`, and `postinstall.mjs`.

## Build

Bun-built (Bun 1.3.1+). From `ts/oh-my-openagent/`:

```bash
bun install        # local install only — never run the root-workspace install
bun run build      # bundles src/index.ts + cli, emits .d.ts, builds the JSON schema
bun test           # unit tests (includes the Conductor tmux resolver tests)
```

The build runs:
`bun build src/index.ts --target bun --format esm --external @ast-grep/napi`,
then `tsc --emitDeclarationOnly`, then the CLI bundle, then `build:schema`.
`@ast-grep/napi` is an external native dependency and is intentionally not bundled.

## Where this fits in the runtime contract

The Recoder `drivers/opencode/*` bridge adapts
this package's `{plugin-config, create-hooks, create-tools, create-runtime-tmux-config}.ts`
into `opencode-{plugin-config, hooks-bridge, tools-bridge, tmux-config}.ts`, emitting
shared `RunEvent` records back to Recoder. This package stays a replaceable execution
surface; canonical task/approval/memory/artifact state remains Recoder-owned.

## Attribution

Forked from [oh-my-opencode](https://github.com/code-yeongyu/oh-my-openagent) by
YeonGyu-Kim. Licensed under SUL-1.0 (see [LICENSE.md](./LICENSE.md)). The upstream
documentation is retained in [README.md](./README.md) below the Recoder banner.
