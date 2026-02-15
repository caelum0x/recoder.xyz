#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAG=""
WRITE=false
SET_SECRETS=false
ENV_FILE=""

usage() {
  cat <<'EOF'
Usage:
  bash scripts/desktop-release-closeout.sh <tag> [--write] [--set-secrets] [--from-env-file <path>]

Examples:
  bash scripts/desktop-release-closeout.sh v1.0.0
  bash scripts/desktop-release-closeout.sh v1.0.0 --write --set-secrets --from-env-file .env.desktop-release

Behavior:
  - always runs readiness checks first
  - dry-run by default for git tag push
  - with --set-secrets, syncs desktop release secrets
  - with --write, performs real secret upsert and real tag push
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      ;;
    --write)
      WRITE=true
      shift
      ;;
    --set-secrets)
      SET_SECRETS=true
      shift
      ;;
    --from-env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      if [[ -z "$TAG" || "$TAG" == "$1" ]]; then
        TAG="$1"
        shift
      else
        echo "unknown arg: $1"
        usage
        exit 2
      fi
      ;;
  esac
done

if [[ -z "$TAG" ]]; then
  echo "missing required tag argument"
  usage
  exit 2
fi

if [[ -n "$ENV_FILE" && "$SET_SECRETS" == false ]]; then
  echo "--from-env-file requires --set-secrets"
  exit 2
fi

echo "== Desktop Release Closeout =="
echo "tag: $TAG"
echo "mode: $([[ "$WRITE" == true ]] && echo write || echo dry-run)"
echo "set-secrets: $SET_SECRETS"
echo

pnpm -C "$REPO_ROOT" run check:desktop-release-readiness || true

if [[ "$SET_SECRETS" == true ]]; then
  secret_args=()
  if [[ -n "$ENV_FILE" ]]; then
    secret_args+=(--from-env-file "$ENV_FILE")
  fi
  if [[ "$WRITE" == true ]]; then
    secret_args+=(--write)
  fi
  bash "$REPO_ROOT/scripts/set-desktop-release-secrets.sh" "${secret_args[@]}"
fi

if git -C "$REPO_ROOT" rev-parse "$TAG" >/dev/null 2>&1; then
  echo "tag already exists locally: $TAG"
else
  if [[ "$WRITE" == true ]]; then
    git -C "$REPO_ROOT" tag "$TAG"
    echo "created local tag: $TAG"
  else
    echo "[dry-run] would create local tag: $TAG"
  fi
fi

if [[ "$WRITE" == true ]]; then
  git -C "$REPO_ROOT" push origin "$TAG"
  echo "pushed tag: $TAG"
else
  echo "[dry-run] would push tag: $TAG"
fi

if [[ "$WRITE" == true ]]; then
  echo "waiting 10s for workflow indexing..."
  sleep 10
  pnpm -C "$REPO_ROOT" run verify:desktop-release -- "$TAG"
else
  echo "[dry-run] would verify workflow/assets: pnpm run verify:desktop-release -- $TAG"
fi
