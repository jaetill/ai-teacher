#!/usr/bin/env bash
# Stop hook — warn if tests are failing or working tree is dirty when the agent tries to stop.
# This is a "did you actually finish?" check per Standard 10 §3.
# Returns non-zero to warn (not block; the user can choose to proceed).

set -euo pipefail

# Only check if we're in a git repo
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  exit 0
fi

# Check for dirty working tree
status_summary=$(git status --short 2>/dev/null)
if [[ -n "$status_summary" ]]; then
  echo "WARNING: working tree is not clean. Uncommitted changes:" >&2
  echo "$status_summary" >&2
  echo "" >&2
  echo "Are you sure you want to stop? Per Standard 10 §3, ending a session with uncommitted changes is a smell." >&2
  # Don't actually block; this is a warning per the Mixed strictness policy
fi

# Check for failing tests if a test command is documented in the project
# (look for `test` script in package.json, `pytest` config in pyproject.toml, etc.)
# This is best-effort; don't run the full suite (too expensive); just check the latest test result if recorded.

# A project may have .claude/last-test-result with "pass" or "fail"
last_test_result_file=".claude/last-test-result"
if [[ -f "$last_test_result_file" ]]; then
  result=$(cat "$last_test_result_file" 2>/dev/null || echo "unknown")
  if [[ "$result" == "fail" ]]; then
    echo "WARNING: last recorded test run was a FAILURE." >&2
    echo "Per Standard 10 §3, ending a session with failing tests is a smell." >&2
  fi
fi

# Always exit 0 — these are warnings, not blocks (Mixed strictness)
exit 0
