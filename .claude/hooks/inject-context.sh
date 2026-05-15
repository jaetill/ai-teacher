#!/usr/bin/env bash
# UserPromptSubmit hook — inject current branch + uncommitted state + last 3 commits.
# Output goes to stdout; Claude prepends it to the user's prompt as system context.

set -euo pipefail

# Only inject if we're in a git repo
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  exit 0
fi

branch=$(git branch --show-current 2>/dev/null || echo "(detached)")
status_summary=$(git status --short 2>/dev/null | head -5)
recent_commits=$(git log --oneline -3 2>/dev/null)

# Only inject if there's something useful to say
if [[ -z "$branch" ]] && [[ -z "$status_summary" ]] && [[ -z "$recent_commits" ]]; then
  exit 0
fi

cat <<EOF
## Repo state

- Branch: \`$branch\`
$(if [[ -n "$status_summary" ]]; then
  echo "- Uncommitted changes:"
  echo '```'
  echo "$status_summary"
  echo '```'
else
  echo "- Working tree: clean"
fi)
- Recent commits:
\`\`\`
$recent_commits
\`\`\`

EOF

exit 0
