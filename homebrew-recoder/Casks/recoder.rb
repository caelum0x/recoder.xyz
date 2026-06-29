cask "recoder" do
  # Bump `version` and the two `sha256` values when a new desktop release ships.
  # The sha256 values below are intentional placeholders; the release pipeline
  # rewrites them from the published .dmg checksums (see `brew fetch --cask` /
  # `shasum -a 256 Recoder-<version>-<arch>.dmg`). Never commit real artifact
  # secrets here — only the public checksums of published GitHub release assets.
  version "1.0.0"

  on_arm do
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"

    url "https://github.com/recoder-xyz/recoder-desktop/releases/download/v#{version}/Recoder-#{version}-arm64.dmg",
        verified: "github.com/recoder-xyz/recoder-desktop/"
  end

  on_intel do
    sha256 "1111111111111111111111111111111111111111111111111111111111111111"

    url "https://github.com/recoder-xyz/recoder-desktop/releases/download/v#{version}/Recoder-#{version}-x64.dmg",
        verified: "github.com/recoder-xyz/recoder-desktop/"
  end

  name "Recoder"
  desc "Self-hosting agent control plane desktop app — bundled backend + tmux"
  homepage "https://recoder.xyz"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: ">= :big_sur"

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
