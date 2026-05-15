#!/usr/bin/env bash
# SessionStart hook — inject project standards summary, recent ADRs, open issues.
# Cold-start orientation per Standard 10 §3.

set -euo pipefail

# Only inject if we're in a project that has the platform's standards inheritance
# (look for docs/standards/ or for a CLAUDE.md that references the platform)
if [[ ! -d "docs/adr" ]] && [[ ! -f "CLAUDE.md" ]]; then
  exit 0
fi

cat <<'HEADER'
## Session context

You are working in a project that inherits from the Agentic Dev Environment platform.
Key standards (full docs at the platform repo's `docs/standards/`):

- Source control (ADR-0002): GitHub Flow + Conventional Commits + SSH signing + squash merge + strict branch protection
- CI/CD (ADR-0003): AI shipping authority + 5 ADR-gated change categories
- Testing (ADR-0004): Per-stack shapes + tiered coverage (90/80/60) + immediate flake fix-or-remove
- Quality gates (ADR-0005): Pragmatic-strict linters + mypy strict / TS strict + full security stack
- Documentation (ADR-0008): MADR 4.x ADRs + tight 6-section runbooks + MkDocs Material site
- Observability (ADR-0009): JSON structured logs + CloudWatch + Sentry + Grafana + AWS X-Ray
- Secrets (ADR-0006): 1Password CLI + AWS Secrets Manager + AWS OIDC (no static keys)
- IaC (ADR-0007): OpenTofu + S3+DynamoDB state + directory-per-env + drift detection
- Releases (ADR-0010): release-please + auto-merge release PRs + emergency override
- AI workflows (ADR-0011): Head agent + 12 specialist subagents + tiered models

HEADER

# Recent ADRs (last 5)
if [[ -d "docs/adr" ]]; then
  echo ""
  echo "### Recent ADRs"
  ls docs/adr/[0-9]*.md 2>/dev/null | sort -r | head -5 | while read -r adr_file; do
    title=$(head -1 "$adr_file" | sed 's/^# //')
    echo "- $title"
  done
fi

# Last 3 commits
if git rev-parse --is-inside-work-tree &>/dev/null; then
  recent_commits=$(git log --oneline -3 2>/dev/null)
  if [[ -n "$recent_commits" ]]; then
    echo ""
    echo "### Recent commits"
    echo '```'
    echo "$recent_commits"
    echo '```'
  fi
fi

echo ""

exit 0
