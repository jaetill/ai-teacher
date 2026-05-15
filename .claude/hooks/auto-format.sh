#!/usr/bin/env bash
# PostToolUse(Edit|Write) hook — auto-format the changed file per its stack.
# Format changes are quiet successes; lint findings are surfaced via the lint-warn hook.

set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

# Skip if file doesn't exist
if [[ ! -f "$file_path" ]]; then
  exit 0
fi

# Pick the formatter by file extension
ext="${file_path##*.}"

case "$ext" in
  py)
    if command -v ruff &>/dev/null; then
      ruff format "$file_path" 2>/dev/null || true
    fi
    ;;
  ts|tsx|js|jsx|mjs|cjs)
    if command -v prettier &>/dev/null; then
      prettier --write "$file_path" 2>/dev/null || true
    fi
    ;;
  json|yaml|yml|md)
    if command -v prettier &>/dev/null; then
      prettier --write "$file_path" 2>/dev/null || true
    fi
    ;;
  tf|tfvars)
    if command -v tofu &>/dev/null; then
      tofu fmt "$file_path" 2>/dev/null || true
    elif command -v terraform &>/dev/null; then
      terraform fmt "$file_path" 2>/dev/null || true
    fi
    ;;
  *)
    # Unknown extension; skip silently
    ;;
esac

exit 0
