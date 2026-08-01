# Install

Recoder ships as a desktop app that runs entirely on your machine. There's no
account required to start.

## Download

Go to **[recoder.xyz/download](https://recoder.xyz/download)** and pick your
platform.

- **macOS (Apple Silicon / arm64):** a `.dmg` signed with an Apple Developer ID
  and **notarized by Apple**, so it installs without Gatekeeper warnings. Intel
  and universal builds are on the roadmap.
- **Windows / Linux:** on the roadmap; the download page will show a "notify me"
  option until they ship.

### Verify the download (recommended)

Every macOS build publishes a SHA-256 checksum. On the download page, expand
**"Verify checksum"** and confirm it matches before installing:

```bash
shasum -a 256 ~/Downloads/Recoder-<version>-arm64.dmg
# compare the output to the digest shown on the download page
```

You can also confirm the signature and notarization yourself:

```bash
# after copying Recoder.app to /Applications
codesign --verify --deep --strict /Applications/Recoder.app && echo "signature OK"
spctl -a -t open --context context:primary-signature ~/Downloads/Recoder-<version>-arm64.dmg
```

## Install

1. Open the `.dmg`.
2. Drag **Recoder** to your **Applications** folder.
3. Launch it from Applications.

Because the build is notarized, macOS opens it without the "unidentified
developer" prompt.

## First run — what starts on your machine

When Recoder launches it starts a **local control-plane backend** on your machine
(loopback `http://127.0.0.1:3100` by default) and supervises it. This backend is
the conductor + agent-os + engine host. Nothing is exposed to the network; it
binds to loopback only.

On first run, Recoder imports your local environment so it can drive the agents
you already have:

- your **git identity** (name/email) for commits it makes on your behalf,
- which **agent CLIs** are installed and on your `PATH`,
- your **GitHub CLI** (`gh`) auth, if present, for PR/checks integration,
- your shell environment, so agents inherit the keys and tools you normally use.

No account is required to run locally. Team features (sharing runs, remote
substrates) are opt-in.

## Requirements

- macOS 11 (Big Sur) or later on Apple Silicon.
- At least one coding-agent CLI installed and on your `PATH` — e.g. Claude Code,
  Codex, or opencode. See [Connect your coding agents](./04-connect-agents.md).
- The provider keys those agents use (BYOK). See
  [Bring your own keys](./07-byok-and-keys.md).

## Updating

Recoder checks for updates automatically and updates in place. You can also just
re-download the latest build from the download page.

Next: [Quickstart](./03-quickstart.md).
