# Homebrew Tap for Recoder

## Installation

> The tap lives under the `recoder-xyz` GitHub org (matching the desktop
> publish target in `apps/desktop/package.json`). Use `recoder-xyz/recoder`
> everywhere — not `recoder-team`.

### CLI (`recoder-code`)

```bash
brew tap recoder-xyz/recoder
brew install recoder-code
```

### Desktop app (cask)

> Requires a signed + notarized release (ROADMAP M4.1). Until that ships, the
> cask carries placeholder checksums and `brew install --cask recoder` will
> fail checksum verification by design.

```bash
brew tap recoder-xyz/recoder
brew install --cask recoder
```

## Update

```bash
brew upgrade recoder-code
brew upgrade --cask recoder
```

## Uninstall

```bash
brew uninstall recoder-code
brew uninstall --cask recoder
brew untap recoder-xyz/recoder
```

## Maintainer notes

`Casks/recoder.rb` points at the GitHub release `.dmg` artifacts published by
`recoder-xyz/recoder-desktop` (electron-builder, `productName: "Recoder"`,
`appId: xyz.recoder.desktop`). On each release, bump `version` and replace the
two placeholder `sha256` values (arm64 + x64) with the published asset
checksums:

```bash
shasum -a 256 dist/Recoder-<version>-arm64.dmg
shasum -a 256 dist/Recoder-<version>-x64.dmg
```

The checksums are public; never store signing secrets in this repo. The cask
URL pattern and the site Download page (`site/lib/releases.ts`,
`site/app/download/page.tsx`) must point at the same GitHub release assets.
