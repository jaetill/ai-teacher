#!/usr/bin/env bash
# PostToolUse(Edit|Write) hook — run linter on the changed file; surface findings via stderr.
# Does NOT block; per Standard 10 §3 lint findings are warnings, not blockers.

set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

if [[ ! -f "$file_path" ]]; then
  exit 0
fi

ext="${file_path##*.}"
findings=""

case "$ext" in
  py)
    if command -v ruff &>/dev/null; then
      findings=$(ruff check "$file_path" 2>&1 || true)
    fi
    ;;
  ts|tsx|js|jsx)
    if command -v eslint &>/dev/null; then
      findings=$(eslint "$file_path" 2>&1 || true)
    elif command -v pnpm &>/dev/null && [[ -f "package.json" ]]; then
      findings=$(pnpm exec eslint "$file_path" 2>&1 || true)
    fi
    ;;
  tf|tfvars)
    if command -v tflint &>/dev/null; then
      findings=$(tflint "$file_path" 2>&1 || true)
    fi
    ;;
esac

# Only surface non-empty findings
if [[ -n "$findings" ]] && [[ "$findings" != *"All checks passed"* ]]; then
  echo "Lint findings on $file_path (warnings; not blocking):" >&2
  echo "$findings" >&2
fi

exit 0
