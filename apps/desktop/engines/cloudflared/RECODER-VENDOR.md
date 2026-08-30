# Recoder vendored connector — cloudflared

**Upstream:** Cloudflare Tunnel client — https://github.com/cloudflare/cloudflared @ 2026.5.2

**License:** Apache-2.0 (retained at `./LICENSE`)

**Artifact:** macOS arm64 Mach-O executable

**SHA-256:** `151a81e06101cfe5a3da280e8e6eb87bf803fcb4175c1c14c2ad70813d708737`

Recoder bundles the unmodified upstream `cloudflared` executable to provide an
outbound-only transport from the installed desktop app to a Recoder-owned
Cloudflare Tunnel hostname. It is launched with auto-update disabled so the
signed app bundle remains immutable. Production uses a remotely managed named
tunnel token; TryCloudflare quick tunnels are available only in explicit
development mode.

The current binary was copied from the Homebrew `cloudflared` 2026.5.2 bottle
for Apple Silicon. Refresh it by installing the pinned version, verifying the
upstream checksum and license, copying the executable and license here, then
updating the version and checksum above.
