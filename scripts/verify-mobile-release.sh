#!/usr/bin/env bash
set -euo pipefail

REPO_SLUG="${REPO_SLUG:-caelum0x/recoder.xyz}"
WORKFLOW_FILE="${WORKFLOW_FILE:-mobile-ci.yml}"
REF_FILTER="${1:-}"
EXPECT_EAS_BUILD="${EXPECT_EAS_BUILD:-auto}"

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; ((PASS+=1)); }
fail() { echo "  FAIL: $1"; ((FAIL+=1)); }

echo "== Verify Mobile Release CI =="
echo "repo: $REPO_SLUG"
echo "workflow: $WORKFLOW_FILE"
echo "ref filter: ${REF_FILTER:-<latest run>}"
echo "expect eas-build: $EXPECT_EAS_BUILD"
echo

if ! command -v gh >/dev/null 2>&1; then
  fail "GitHub CLI (gh) not installed"
fi

if ! gh api user >/dev/null 2>&1; then
  fail "gh auth invalid/expired or missing API scope (run: gh auth login -h github.com -w -s repo,workflow,read:org,gist)"
fi

if ! command -v jq >/dev/null 2>&1; then
  fail "jq not installed"
fi

if [[ "$FAIL" -gt 0 ]]; then
  echo
  echo "verification aborted due to prerequisites"
  exit 1
fi

if ! gh workflow view "$WORKFLOW_FILE" --repo "$REPO_SLUG" >/dev/null 2>&1; then
  fail "workflow $WORKFLOW_FILE not found on $REPO_SLUG default branch"
  echo "hint: push .github/workflows/$WORKFLOW_FILE to main before running release verification"
  echo
  echo "========================================="
  echo "  PASS: $PASS  |  FAIL: $FAIL"
  echo "========================================="
  exit 1
fi

if [[ -n "$REF_FILTER" ]]; then
  run_id="$(gh run list --repo "$REPO_SLUG" --workflow "$WORKFLOW_FILE" --limit 50 --json databaseId,headBranch,displayTitle --jq ".[] | select(.headBranch == \"$REF_FILTER\") | .databaseId" | head -n 1)"
else
  run_id="$(gh run list --repo "$REPO_SLUG" --workflow "$WORKFLOW_FILE" --limit 1 --json databaseId --jq '.[0].databaseId')"
fi

if [[ -z "$run_id" || "$run_id" == "null" ]]; then
  fail "no matching mobile workflow run found"
  echo
  echo "========================================="
  echo "  PASS: $PASS  |  FAIL: $FAIL"
  echo "========================================="
  exit 1
fi
pass "workflow run found: $run_id"

status="$(gh run view "$run_id" --repo "$REPO_SLUG" --json status --jq '.status')"
conclusion="$(gh run view "$run_id" --repo "$REPO_SLUG" --json conclusion --jq '.conclusion')"
if [[ "$status" != "completed" ]]; then
  fail "workflow not completed yet (status=$status)"
elif [[ "$conclusion" != "success" ]]; then
  fail "workflow completed but not successful (conclusion=$conclusion)"
else
  pass "workflow succeeded"
fi

jobs_json="$(gh run view "$run_id" --repo "$REPO_SLUG" --json jobs)"
has_job() {
  local job_name="$1"
  echo "$jobs_json" | jq -e --arg n "$job_name" '.jobs[] | select(.name == $n)' >/dev/null
}
job_success() {
  local job_name="$1"
  echo "$jobs_json" | jq -e --arg n "$job_name" '.jobs[] | select(.name == $n and .conclusion == "success")' >/dev/null
}

for required in "Version Consistency" "TypeScript Check" "Lint" "Tests"; do
  if has_job "$required"; then
    if job_success "$required"; then
      pass "$required job succeeded"
    else
      fail "$required job did not succeed"
    fi
  else
    fail "missing expected job: $required"
  fi
done

if [[ "$EXPECT_EAS_BUILD" == "auto" ]]; then
  if [[ -n "$REF_FILTER" && "$REF_FILTER" == mobile-v* ]]; then
    EXPECT_EAS_BUILD="true"
  else
    EXPECT_EAS_BUILD="false"
  fi
fi

if [[ "$EXPECT_EAS_BUILD" == "true" ]]; then
  if has_job "EAS Build (Production)"; then
    if job_success "EAS Build (Production)"; then
      pass "EAS Build (Production) job succeeded"
    else
      fail "EAS Build (Production) job did not succeed"
    fi
  else
    fail "expected EAS Build (Production) job but it was not present"
  fi
else
  if has_job "EAS Build (Production)"; then
    pass "EAS Build (Production) job present"
  else
    pass "EAS Build (Production) job correctly absent for non-tag run"
  fi
fi

echo
echo "========================================="
echo "  PASS: $PASS  |  FAIL: $FAIL"
echo "========================================="

if [[ "$FAIL" -gt 0 ]]; then
  echo
  echo "mobile release verification: FAIL"
  exit 1
fi

echo
echo "mobile release verification: PASS"
