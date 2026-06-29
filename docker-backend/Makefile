# Recoder docker-backend developer Makefile.
# Local-dev conductor harness for the desktop cockpit.

.PHONY: dev-conductor dev-conductor-key

# Boot the backend on :3001, mint a dev conductor sk_ key, wait for the conductor
# health endpoint to authenticate, then print + write the desktop config.
# Runs in the foreground; Ctrl+C stops the backend. See scripts/dev-conductor.sh.
dev-conductor:
	./scripts/dev-conductor.sh

# Just mint the dev conductor key and write .dev/conductor.json (no backend boot).
dev-conductor-key:
	./scripts/dev-conductor.sh --mint-only
