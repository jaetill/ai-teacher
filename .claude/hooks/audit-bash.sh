#!/usr/bin/env bash
# PostToolUse(Bash) hook — append every bash invocation to .claude/audit.log.
# Auditable trail per Standard 10 §3.

set -euo pipefail

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')
exit_code=$(echo "$input" | jq -r '.tool_response.exit_code // "n/a"')

log_dir=".claude"
log_file="$log_dir/audit.log"
mkdir -p "$log_dir"

timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# One line per bash call; tab-separated
printf '%s\tBASH\texit=%s\tcommand=%s\n' "$timestamp" "$exit_code" "$command" >> "$log_file"

exit 0
