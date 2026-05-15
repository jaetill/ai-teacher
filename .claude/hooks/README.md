# Hooks

Lifecycle hook scripts implementing the platform's Mixed-strictness hook policy per [Standard 10 §3](../../../docs/standards/10-ai-workflows.md) and [ADR-0011](../../../docs/adr/0011-ai-workflows.md).

## Layout

| File | Lifecycle event | Action |
|---|---|---|
| `block-destructive-bash.sh` | `PreToolUse(Bash)` | **Block** if command matches destructive patterns (rm -rf /, DROP TABLE, etc.) |
| `block-credential-exposure.sh` | `PreToolUse(Bash)` | **Block** if command exposes literal credentials (AWS keys, GitHub PATs, private keys) |
| `block-protected-paths.sh` | `PreToolUse(Edit\|Write)` | **Block** edits to .tfstate, .env, .ssh/, /etc/, etc. |
| `confirm-pii-edits.sh` | `PreToolUse(Edit\|Write)` | **Audit** edits to files containing PII tags |
| `auto-format.sh` | `PostToolUse(Edit\|Write)` | Run formatter (Ruff format / Prettier / tofu fmt) on changed file |
| `lint-warn.sh` | `PostToolUse(Edit\|Write)` | Run linter; surface findings via stderr (warning, not block) |
| `audit-bash.sh` | `PostToolUse(Bash)` | Append every bash invocation to `.claude/audit.log` |
| `inject-context.sh` | `UserPromptSubmit` | Prepend branch state + uncommitted changes + recent commits |
| `inject-session-context.sh` | `SessionStart` | Inject standards summary + recent ADRs + recent commits |
| `check-clean-stop.sh` | `Stop` | Warn (not block) if working tree dirty or last test run failed |

## Cross-platform notes

- Scripts are bash; on Windows they run via Git Bash (which Claude Code typically uses).
- Required tools: `jq` (parse JSON tool input), `git`, plus stack-specific formatters/linters (`ruff`, `prettier`, `tofu`).
- If a tool is not installed, the hook script silently skips that step — does not block.

## Customization

Per-project tuning happens via `.claude/settings.json` overrides, not by editing the canonical hook scripts here. Significant changes to hook policy require an ADR per ADR-0001's source-of-truth hierarchy.

## Audit log

`.claude/audit.log` accumulates bash invocations and PII file accesses. Format: tab-separated `<timestamp>\t<event>\t<key=value>...`. The log is gitignored. Retention is local-disk hygiene; no automatic purge for now.
