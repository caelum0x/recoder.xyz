# Recoder governance daemon image (self-host).
#
# The owned Rust governance daemon (crates/recoder-governance/recoder-governance-daemon)
# boots a deny-biased GovernanceKernel and serves the typed IPC over a Unix-domain
# socket at $GOVERNANCE_SOCKET. The backend's @recoder/governance facade delegates
# to that socket when GOVERNANCE_SOCKET is set, and falls back to its pure-TS
# deny-biased path on ANY failure (no socket / connect error / timeout). So this
# service is an enhancement, never a hard dependency: if it is absent the backend
# still governs, truthfully marked `degraded`.
#
# Why a SEPARATE Dockerfile (not the docker-backend substrate stage):
#   - The main image's substrate stage is golang:1.26 and already builds tmux + bd
#     + recoder-xds. Adding a full Rust toolchain (rustup + cargo + the std build)
#     to that stage would bloat the build cache and slow every backend rebuild.
#   - The governance crate is a self-contained cargo workspace under
#     crates/recoder-governance/ with a tiny dependency surface (tokio minimal +
#     sha2/serde) — it builds fast and small (~1.4MB binary) in isolation here.
#
# Build context is the REPO ROOT (see docker-compose.selfhost.yml) so this can copy
# crates/recoder-governance/.
#
# CRITICAL — peer-cred / uid: the daemon pins its IPC accept loop to its OWN uid
# (geteuid). For the backend container to connect over the shared socket volume,
# BOTH containers must run as the SAME uid. The backend runtime user is uid 1001
# (docker-backend/Dockerfile creates `backend` uid 1001), so this image creates a
# matching uid-1001 user and runs as it. The shared socket dir volume is owned by
# 1001 in both. Keep these uids in lockstep.

# --- Stage 0: build the daemon ---
FROM rust:1-bookworm AS build
WORKDIR /src
# Copy only the governance cargo workspace (keeps the layer cache tight; this
# workspace has its own Cargo.toml/Cargo.lock and no path deps outside itself).
COPY crates/recoder-governance/ ./crates/recoder-governance/
WORKDIR /src/crates/recoder-governance
# Build just the daemon binary in release. The workspace's tiny dep surface keeps
# this fast. A real, optimized binary — no stubs.
RUN cargo build --release -p recoder-governance-daemon \
    && install -D target/release/recoder-governance-daemon /out/recoder-governance-daemon

# --- Stage 1: minimal runtime ---
# debian-slim (not scratch) so the runtime has libc/ssl the dynamically linked
# binary needs, plus a real shell for the healthcheck.
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# uid 1001 must match the backend container's runtime user so peer-cred auth on
# the shared socket succeeds (same-uid policy). See header note.
RUN groupadd --system --gid 1001 governance \
    && useradd --system --uid 1001 --gid 1001 --home /home/governance --create-home governance \
    && mkdir -p /run/recoder-governance \
    && chown governance:governance /run/recoder-governance

COPY --from=build /out/recoder-governance-daemon /usr/local/bin/recoder-governance-daemon

USER governance

# Default socket path lives on a shared volume mounted at /run/recoder-governance
# in both this service and the backend. Overridable via $GOVERNANCE_SOCKET.
ENV GOVERNANCE_SOCKET=/run/recoder-governance/governance.sock

# Liveness: the socket file exists once the daemon has bound and is accepting.
# Degrade-safe by nature — if this never goes healthy the backend still governs
# via its pure-TS fallback.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=4 \
  CMD test -S "$GOVERNANCE_SOCKET" || exit 1

ENTRYPOINT ["/usr/local/bin/recoder-governance-daemon"]
