cask "recoder" do
  # ---------------------------------------------------------------------------
  # Points at the real, live, signed+notarized artifact the site itself serves
  #   (verified: HEAD https://recoder.xyz/releases/Recoder-arm64.dmg -> 200).
  #   The URL and checksum below must stay in lockstep with
  #   site/.env.production.local (NEXT_PUBLIC_DOWNLOAD_MACOS_URL /
  #   NEXT_PUBLIC_DOWNLOAD_MACOS_SHA256) and the `version` label with
  #   NEXT_PUBLIC_RELEASE_VERSION — that file is the single source of truth
  #   for what's actually published; update all three together on release.
  #
  # arm64-only, deliberately: every bundled engine binary (bd, tmux,
  #   recoder-server, the Rust NAPI addons) is built arm64-darwin only, and
  #   apps/desktop/app/electron-builder.config.cjs refuses to package any
  #   other target (see docs/DESKTOP-CROSS-PLATFORM.md). There is no x64 or
  #   Windows/Linux artifact to point a cask at yet.
  #
  # The artifact filename is NOT version-templated (unlike a GitHub Releases
  #   URL) — the site overwrites the same object on every release, so the URL
  #   below is static and `version` is a display-only label for `brew info`.
  # ---------------------------------------------------------------------------
  version "0.16.5"
  sha256 "5456639b819f792a4e78442e0c2213e394248d6066bd0a80d22b0f6adef7f385"

  url "https://recoder.xyz/releases/Recoder-arm64.dmg"

  name "Recoder"
  desc "Self-hosting agent control plane desktop app — bundled backend + tmux"
  homepage "https://recoder.xyz/"

  # No GitHub Releases feed to poll (artifact is a static, non-versioned
  # object on recoder.xyz) — watch the object's Last-Modified header instead.
  livecheck do
    url "https://recoder.xyz/releases/Recoder-arm64.dmg"
    strategy :header_match
  end

  auto_updates true
  depends_on macos: :big_sur
  depends_on arch: :arm64

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
