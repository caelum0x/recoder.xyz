cask "recoder" do
  # ---------------------------------------------------------------------------
  # needsExternal: a signed + notarized .dmg published as a real GitHub release
  #   (ROADMAP M4.1). Until that ships, the two `sha256` values below are
  #   PLACEHOLDERS and `brew install --cask recoder` will fail checksum
  #   verification by design — it must not pretend to install an unverified or
  #   unsigned binary.
  #
  # On each desktop release, bump `version` and replace BOTH placeholder
  #   `sha256` values (arm64 + x64) with the published .dmg checksums:
  #     shasum -a 256 dist/Recoder-<version>-arm64.dmg
  #     shasum -a 256 dist/Recoder-<version>-x64.dmg
  #   (or `brew fetch --cask recoder` to print the actual hash). The checksums
  #   are PUBLIC; never commit signing secrets or tokens to this repo.
  #
  # URL/artifact names track electron-builder defaults from
  #   apps/desktop/package.json (productName "Recoder", publish owner
  #   "recoder-xyz", repo "recoder-desktop"). Keep them in sync with that file
  #   and with the site Download page (site/lib/releases.ts).
  # ---------------------------------------------------------------------------
  version "1.0.0"

  on_arm do
    # PLACEHOLDER — replace with `shasum -a 256 Recoder-#{version}-arm64.dmg`
    # of the signed/notarized GitHub release asset (M4.1).
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"

    url "https://github.com/recoder-xyz/recoder-desktop/releases/download/v#{version}/Recoder-#{version}-arm64.dmg",
        verified: "github.com/recoder-xyz/recoder-desktop/"
  end
  on_intel do
    # PLACEHOLDER — replace with `shasum -a 256 Recoder-#{version}-x64.dmg`
    # of the signed/notarized GitHub release asset (M4.1).
    sha256 "1111111111111111111111111111111111111111111111111111111111111111"

    url "https://github.com/recoder-xyz/recoder-desktop/releases/download/v#{version}/Recoder-#{version}-x64.dmg",
        verified: "github.com/recoder-xyz/recoder-desktop/"
  end

  name "Recoder"
  desc "Self-hosting agent control plane desktop app — bundled backend + tmux"
  homepage "https://recoder.xyz/"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: :big_sur

  app "Recoder.app"

  zap trash: [
    "~/Library/Application Support/Recoder",
    "~/Library/Caches/xyz.recoder.desktop",
    "~/Library/Caches/xyz.recoder.desktop.ShipIt",
    "~/Library/HTTPStorages/xyz.recoder.desktop",
    "~/Library/Preferences/xyz.recoder.desktop.plist",
    "~/Library/Saved Application State/xyz.recoder.desktop.savedState",
  ]
end
