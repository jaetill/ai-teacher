#!/usr/bin/env bash
# PreToolUse(Bash) hook — block destructive bash patterns per Standard 10 §3.
# Reads the tool input from stdin (JSON); exit 0 to allow, exit 1+ to block.
# Block message goes to stderr; Claude relays it to the user.

set -euo pipefail

# Read the tool input — a JSON object with `command` field
input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

# Patterns that are always blocked (no agent should issue these without explicit user confirm)
declare -a destructive_patterns=(
  'rm -rf /'
  'rm -rf /*'
  '\bsudo rm\b'
  'git push --force.*\bmain\b'
  'git push -f.*\bmain\b'
  'DROP TABLE'
  'TRUNCATE TABLE'
  'DELETE FROM .* WHERE 1=1'
  'DELETE FROM .* WHERE true'
  ':(){ :|:& };:'                  # fork bomb
  '\bmkfs\b'
  '\bdd\b.*of=/dev/'
  'chmod -R 777 /'
)

for pattern in "${destructive_patterns[@]}"; do
  if echo "$command" | grep -qE "$pattern"; then
    echo "BLOCKED: destructive bash pattern detected: '$pattern'" >&2
    echo "Per Standard 10 (AI Workflows) §3, destructive bash requires explicit user confirmation." >&2
    echo "If this is genuinely intended, the user must provide explicit confirmation in chat." >&2
    exit 1
  fi
done

exit 0
