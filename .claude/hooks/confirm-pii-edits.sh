#!/usr/bin/env bash
# PreToolUse(Edit|Write) hook — log access to files containing PII tags per ADR-0006.
# This is an audit hook; it doesn't block, but it does record PII-tagged file access.
# A `confirm` mechanism in Claude Code's hook spec can be used here to require explicit
# user confirmation; for now this records the access in the audit log.

set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

# Skip if file doesn't exist (Write to new file)
if [[ ! -f "$file_path" ]]; then
  exit 0
fi

# Check whether the file's content includes PII tags (per ADR-0006 schema-level annotation)
# Tags are stack-specific:
# - Python: `info={"pii": True}` in SQLAlchemy/Pydantic schemas
# - TypeScript: `.describe('PII')` in Zod schemas
# - Generic: `# pii:true` or `// pii:true` annotation comments
if grep -qE 'info=\{"pii":\s*True\}|\.describe\(.PII.\)|(#|//)\s*pii:\s*true' "$file_path" 2>/dev/null; then
  # Log the access
  log_dir=".claude"
  log_file="$log_dir/audit.log"
  mkdir -p "$log_dir"
  timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  echo "$timestamp PII_FILE_ACCESS file=$file_path" >> "$log_file"
fi

exit 0
