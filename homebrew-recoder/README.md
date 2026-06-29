# Homebrew Tap for Recoder

## Installation

### CLI (`recoder-code`)

```bash
brew tap recoder-team/recoder
brew install recoder-code
```

### Desktop app (cask)

```bash
brew tap recoder-team/recoder
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
brew untap recoder-team/recoder
```

## Maintainer notes

`Casks/recoder.rb` points at the GitHub release `.dmg` artifacts published by
`recoder-xyz/recoder-desktop` (electron-builder, `productName: "Recoder"`,
`appId: xyz.recoder.desktop`). On each release, bump `version` and replace the
two placeholder `sha256` values (arm64 + x64) with the published asset
checksums. The checksums are public; never store signing secrets in this repo.
