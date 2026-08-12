# loom


<p align="center">
  <img src="assets/logo.png" alt="loom" width="100" />
</p>

<p align="center">
  <a href="https://loom.dev">loom.dev</a> · <a href="#install">install</a> · <a href="https://loom.dev/docs/quick-start/">quick start</a> · <a href="https://loom.dev/docs/">docs</a>
</p>

<p align="center">
  English · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-666666?labelColor=333333" alt="Apache 2.0 license" /></a>
  <a href="https://github.com/loomdev/loom/releases"><img src="https://img.shields.io/github/downloads/loomdev/loom/total?labelColor=333333&color=666666" alt="total GitHub release downloads" /></a>
  <a href="https://github.com/loomdev/loom/stargazers"><img src="https://img.shields.io/github/stars/loomdev/loom?labelColor=333333&color=666666&logo=github" alt="GitHub stars" /></a>
  <a href="https://github.com/loomdev/loom/releases/latest"><img src="https://img.shields.io/github/v/release/loomdev/loom?label=release&labelColor=333333&color=666666" alt="latest stable release" /></a>
  <a href="https://formulae.brew.sh/formula/loom"><img src="https://img.shields.io/homebrew/v/loom?label=homebrew&labelColor=333333&color=666666" alt="Homebrew version" /></a>
  <a href="https://x.com/loomdev"><img src="https://img.shields.io/badge/follow-%40loomdev-000000?logo=x&logoColor=white" alt="follow @loomdev on X" /></a>
</p>

---

https://github.com/user-attachments/assets/043ec09f-4bdd-41d5-aee0-8fda6b83e267

**the runtime your coding agents live on.**

- **always running** — loom is a background server; the terminals live inside it. close the lid, drop the network, or restart the machine; agents keep working and sessions come back. reattach from any terminal, or over ssh.
- **never hunt for the stuck one** — every pane is marked working, blocked, or idle. when an agent stops and needs an answer, loom says so.
- **agent-native** — agents drive loom through the cli and socket api: they can spawn panes, prompt each other, and wait until another agent is genuinely blocked. [agent skill →](https://loom.dev/docs/agent-skill/)
- **runs what you already run** — claude code, codex, cursor, opencode, grok and the rest. loom doesn't wrap or replace them; it owns their terminals.
- **keyboard and mouse, both first-class** — tmux-style prefix keys *and* click, drag, split. pick per moment, not per tool.
- **plugins** — extend panes and workflows. [browse the marketplace →](https://loom.dev/plugins/)
- **one rust binary, no electron** — runs in whatever terminal you already use.

---

## install

```bash
curl -fsSL https://loom.dev/install.sh | sh
```

or `brew install loom` · `mise use -g loom` · windows beta: `powershell -ExecutionPolicy Bypass -c "irm https://loom.dev/install.ps1 | iex"` · [binaries](https://github.com/loomdev/loom/releases)

then start it where the work lives:

```bash
loom
```

run your agents, split panes, walk away. `ctrl+b q` detaches, `loom` reattaches. [quick start →](https://loom.dev/docs/quick-start/)

## docs

everything lives at [loom.dev/docs](https://loom.dev/docs/): [quick start](https://loom.dev/docs/quick-start/) · [concepts](https://loom.dev/docs/concepts/) · [supported agents](https://loom.dev/docs/agents/) · [keyboard](https://loom.dev/docs/keyboard/) · [configuration](https://loom.dev/docs/configuration/) · [session state](https://loom.dev/docs/session-state/) · [remote](https://loom.dev/docs/persistence-remote/) · [integrations](https://loom.dev/docs/integrations/) · [plugins](https://loom.dev/docs/plugins/) · [socket api](https://loom.dev/docs/socket-api/)

## thanks

every past sponsor and backer is listed in [SPONSORS.md](./SPONSORS.md) — thank you 🐑

enterprise / partnership: hey@loom.dev

## agent instructions

if you are an ai agent helping with this repository, read [`AGENTS.md`](./AGENTS.md) before making changes and read [`CONTRIBUTING.md`](./CONTRIBUTING.md) before opening issues or PRs.

## development

```bash
git clone https://github.com/loomdev/loom
cd loom
cargo build --release

just test        # unit tests
just check       # formatting, tests, and maintenance checks
```

## license

Loom is licensed under the [Apache License 2.0](LICENSE).
