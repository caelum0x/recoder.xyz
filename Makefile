# Recoder — unified build/verify orchestration across all languages.
# Each OSS project keeps its own native build; this orchestrates them.
# Heavy targets (rust-*, go-ziti) are CI-grade and may exceed a laptop's disk.
# See docs/RECODER-PRODUCT-ARCHITECTURE.md §4 and §6.

.DEFAULT_GOAL := help
.PHONY: help all verify ts site backend go-beads go-ziti rust-openfang rust-claw py-pal py-ops heavy build-tmux build-dmux substrate

help: ## Show targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

# ---- TypeScript (pnpm workspace) ----
ts: ## Build all TS packages
	pnpm -r build

backend: ## Typecheck the control-plane service
	cd docker-backend && npx tsc --noEmit

# ---- Substrate binaries (vendored C/TS, pinned in the runtime image) ----
build-tmux: ## Build the vendored tmux binary from c/tmux (needs cc + libevent + ncurses)
	./scripts/build-tmux.sh

build-dmux: ## Build the vendored dmux operator console from ts/dmux
	cd ts/dmux && pnpm install --frozen-lockfile && pnpm run build

substrate: build-tmux build-dmux ## Build both substrate binaries (tmux + dmux)

site: ## Build the marketing site
	cd site && pnpm build

# ---- Go ----
go-beads: ## Build beads (bd) issue tracker
	cd go/beads && go build ./...

go-ziti: ## Build ziti zero-trust mesh (HEAVY)
	cd go/ziti && go build ./...

# ---- Rust (each its own Cargo workspace; HEAVY, disk-hungry -> CI) ----
rust-openfang: ## Build OpenFang kernel (HEAVY)
	cd crates/openfang && cargo build --release

rust-claw: ## Build claw-code-parity permission engine (HEAVY)
	cd crates/claw-code-parity/rust && cargo build --release

# ---- Python (uv per project) ----
py-pal: ## Sync pal-mcp-server
	cd py/pal-mcp-server && uv sync

py-ops: ## Sync ops-recorder
	cd py/ops-recorder && uv sync

# ---- Aggregates ----
verify: backend site ## Fast green gate (TS only, laptop-safe)
	@echo "✓ laptop-safe gates green"

heavy: go-beads go-ziti rust-openfang rust-claw ## CI-grade builds (needs disk + time)

all: ts backend site go-beads py-pal py-ops ## Build the laptop-feasible product surface
	@echo "✓ feasible product surface built"
