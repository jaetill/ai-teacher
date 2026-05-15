# Runbooks

Operational playbooks. One file per recurring operation: how to deploy, how to roll back, how to rotate a secret, how to respond to a specific class of alert, etc.

## Format

Each runbook should answer:

1. **When to use this** — the trigger condition.
2. **Prerequisites** — what you need open / installed / authenticated.
3. **Steps** — numbered, copy-pasteable, idempotent where possible.
4. **Verification** — how to confirm success.
5. **Rollback** — how to undo if it went wrong.
6. **Escalation** — who/what to notify if stuck.

The format will be locked in as part of the **documentation standard** (Task #8).
