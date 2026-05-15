---
description: Generate or run tests for specific files
---

Generate or run tests for: $ARGUMENTS.

## Routing

Decide which agent to invoke based on the request:

- **"Generate unit tests for X"** → invoke `test-writer` (Sonnet). Authors unit + integration tests with factory data.
- **"Run integration tests on X"** → invoke `functional-tester` (Haiku Tier 1; escalates to Sonnet for novel authoring).
- **"Run e2e tests on X"** → invoke `e2e-tester` (Haiku Tier 1; escalates for novel UI flows).
- **"Run the full test suite"** → invoke all three in parallel against their respective scopes.

If the request is ambiguous, default to `test-writer` for "generate" and `functional-tester` for "run."

## Process

The invoked agent follows its system prompt. The result includes:

- For generation: the test file written, the cases covered, coverage delta, flake-check status.
- For running: pass/fail counts, classification of any failures (real bug / test bug / environment / flake), recommended action.

## Tier-aware scope

Per ADR-0004's tiered coverage:

- Critical paths: 90% line / 80% branch + mutation testing required
- Default code: 80% line / 70% branch
- Utility code: 60% line / 50% branch acceptable

The test-writer agent will use the project's coverage config to determine the tier of the file(s) being tested.
