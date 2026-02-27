#!/usr/bin/env bash
set -euo pipefail

REPO_SLUG="${REPO_SLUG:-caelum0x/recoder.xyz}"
WORKFLOW_FILE="${WORKFLOW_FILE:-desktop-release.yml}"
TAG="${1:-}"
if [[ "$TAG" == "--" ]]; then
  TAG="${2:-}"
fi

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; ((PASS+=1)); }
fail() { echo "  FAIL: $1"; ((FAIL+=1)); }

echo "== Verify Desktop Release =="
echo "repo: $REPO_SLUG"
echo "workflow: $WORKFLOW_FILE"
echo "tag: ${TAG:-<latest tagged run>}"
echo

if ! command -v gh >/dev/null 2>&1; then
  fail "GitHub CLI (gh) not installed"
fi

if ! gh api user >/dev/null 2>&1; then
  fail "gh auth invalid/expired or missing API scope (run: gh auth login -h github.com -w -s repo,workflow,read:org,gist)"
fi

if [[ "$FAIL" -gt 0 ]]; then
  echo
  echo "verification aborted due to prerequisites"
  exit 1
fi

if [[ -n "$TAG" ]]; then
  run_id="$(gh run list --repo "$REPO_SLUG" --workflow "$WORKFLOW_FILE" --limit 30 --json databaseId,headBranch,displayTitle,event,status,conclusion --jq ".[] | select(.headBranch == \"$TAG\") | .databaseId" | head -n 1)"
else
  run_id="$(gh run list --repo "$REPO_SLUG" --workflow "$WORKFLOW_FILE" --limit 1 --json databaseId --jq '.[0].databaseId')"
fi

if [[ -z "$run_id" || "$run_id" == "null" ]]; then
  fail "no matching workflow run found"
else
  pass "workflow run found: $run_id"
fi

if [[ "$FAIL" -eq 0 ]]; then
  conclusion="$(gh run view "$run_id" --repo "$REPO_SLUG" --json conclusion,status --jq '.conclusion')"
  status="$(gh run view "$run_id" --repo "$REPO_SLUG" --json conclusion,status --jq '.status')"
  if [[ "$status" != "completed" ]]; then
    fail "workflow not completed yet (status=$status)"
  elif [[ "$conclusion" != "success" ]]; then
    fail "workflow completed but not successful (conclusion=$conclusion)"
  else
    pass "workflow succeeded"
  fi
fi

if [[ "$FAIL" -eq 0 ]]; then
  release_tag="${TAG}"
  if [[ -z "$release_tag" ]]; then
    release_tag="$(gh run view "$run_id" --repo "$REPO_SLUG" --json headBranch --jq '.headBranch')"
  fi
  assets="$(gh release view "$release_tag" --repo "$REPO_SLUG" --json assets --jq '.assets[].name' 2>/dev/null || true)"
  if [[ -z "$assets" ]]; then
    fail "release not found or no assets for tag: $release_tag"
  else
    pass "release assets found for $release_tag"
    if echo "$assets" | grep -qiE '\.dmg|\.zip|\.pkg'; then
      pass "mac release asset present"
    else
      fail "no mac release asset found"
    fi
    if echo "$assets" | grep -qiE '\.exe|\.msi'; then
      pass "windows release asset present"
    else
      fail "no windows release asset found"
    fi
    if echo "$assets" | grep -qiE '\.AppImage|\.deb|\.rpm|\.snap'; then
      pass "linux release asset present"
    else
      fail "no linux release asset found"
    fi
    echo
    echo "assets:"
    echo "$assets" | sed 's/^/  - /'
  fi
fi

echo
echo "========================================="
echo "  PASS: $PASS  |  FAIL: $FAIL"
echo "========================================="

if [[ "$FAIL" -gt 0 ]]; then
  echo
  echo "desktop release verification: FAIL"
  exit 1
fi

echo
echo "desktop release verification: PASS"
