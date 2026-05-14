#!/usr/bin/env bash
# PreToolUse(Edit|Write) hook — block writes to paths that should never be agent-modified.
# Examples: terraform state, .env files containing real values, sensitive system paths.

set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

# Paths that should never be edited by agents
declare -a protected_patterns=(
  '\.tfstate$'
  '\.tfstate\.backup$'
  '\.terraform/.*'                                          # Terraform internal cache
  '/\.env$'                                                 # The .env file (gitignored, real values)
  '/\.env\.local$'                                          # Local env real values
  '/\.env\.production$'                                     # Production env real values
  '/\.ssh/'                                                 # Any SSH keys
  '/\.aws/credentials$'                                     # AWS creds file
  '/\.gnupg/'                                               # GPG keyring
  '/etc/'                                                   # System config
  '~/\.config/op/'                                          # 1Password CLI config
)

for pattern in "${protected_patterns[@]}"; do
  if echo "$file_path" | grep -qE "$pattern"; then
    echo "BLOCKED: $file_path matches protected path pattern '$pattern'." >&2
    echo "Per Standard 10 §3, this path should never be modified by an agent." >&2
    echo "If this is genuinely intended (rare), the user must perform the edit themselves." >&2
    exit 1
  fi
done

exit 0
