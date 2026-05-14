#!/usr/bin/env bash
# PreToolUse(Bash) hook — block bash commands that expose credentials per ADR-0006.
# Detects patterns like exporting AWS keys, echoing passwords, etc.

set -euo pipefail

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

# Patterns that suggest credential exposure
declare -a credential_patterns=(
  'AWS_SECRET_ACCESS_KEY=[A-Za-z0-9+/]'                    # Exporting actual AWS secret key
  'AWS_SESSION_TOKEN=[A-Za-z0-9+/]'                        # Exporting session token literal
  'GITHUB_TOKEN=ghp_[A-Za-z0-9]'                           # Exporting GitHub PAT literal
  'GITHUB_TOKEN=github_pat_[A-Za-z0-9]'                    # Exporting GitHub fine-grained PAT
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'                     # Echoing a private key
  'echo .*password.*=.*[a-zA-Z0-9]{12,}'                   # Echo with literal-looking password
  'curl .*-u [^:]+:[A-Za-z0-9_-]{8,}'                      # Basic auth literal in curl
)

for pattern in "${credential_patterns[@]}"; do
  if echo "$command" | grep -qE "$pattern"; then
    echo "BLOCKED: command appears to expose credentials per ADR-0006." >&2
    echo "Detected pattern: $pattern" >&2
    echo "Use the secrets vault references (op://, AWS Secrets Manager) instead of literal values." >&2
    exit 1
  fi
done

exit 0
