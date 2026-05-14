# Standard 04 — Quality Gates

**Status:** 🟩 Decided (2026-05-08)
**ADR:** [ADR-0005](../adr/0005-quality-gates.md)

The static-analysis layer that catches what tests can't see. Linting, formatting, type checking, security scanning, code commenting discipline, and the pre-commit / CI split.

## Summary

| Concern | Choice |
|---|---|
| Linter (Python) | Ruff with pragmatic-strict ruleset |
| Linter (TS) | ESLint + typescript-eslint:recommended-type-checked + plugins |
| Type checker (Python) | mypy `--strict` (default); Pyright per-project ADR allowed |
| Type checker (TS) | `strict: true` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `noImplicitOverride` |
| Formatter | Ruff format (Python), Prettier (TS) |
| Security scanning | Dependabot + Semgrep + gitleaks + tfsec/checkov + Trivy + Syft |
| Comment policy | Public APIs required; `why` not `what`; TODO has owner+date; no commented-out code |
| Pre-commit hooks | Fast checks locally (≤10s); full battery in CI |
| Complexity limits | Cyclomatic ≤ 10 / ≤ 15; function ≤ 50 / ≤ 100 lines |

## 1. Linting

### Python — Ruff pragmatic-strict

```toml
# pyproject.toml
[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = [
  "E",    # pycodestyle errors
  "W",    # pycodestyle warnings
  "F",    # pyflakes
  "I",    # isort
  "N",    # pep8-naming
  "UP",   # pyupgrade
  "B",    # flake8-bugbear
  "A",    # flake8-builtins
  "S",    # flake8-bandit (security)
  "C4",   # flake8-comprehensions
  "T20",  # flake8-print (no print() in production code)
  "RET",  # flake8-return
  "SIM",  # flake8-simplify
  "ARG",  # flake8-unused-arguments
  "PT",   # flake8-pytest-style
  "RSE",  # flake8-raise
  "ERA",  # eradicate (commented-out code)
  "PL",   # pylint subset
  "TRY",  # tryceratops (better exceptions)
  "FBT",  # flake8-boolean-trap
  "D",    # pydocstyle (public API docstrings — see comment policy)
]
ignore = [
  "D203",  # incorrect-blank-line-before-class (conflicts with D211)
  "D213",  # multi-line-summary-second-line (conflicts with D212)
  "S101",  # assert allowed in tests
  "PLR0913", # too-many-arguments — handled by code-reviewer agent qualitatively
]

[tool.ruff.lint.per-file-ignores]
"tests/**/*.py" = ["S", "D", "ARG", "PLR2004"]  # tests have different needs

[tool.ruff.lint.pydocstyle]
convention = "google"  # or "numpy" — choose at project scaffold time
```

### TypeScript — ESLint + typescript-eslint

```js
// eslint.config.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import unusedImports from 'eslint-plugin-unused-imports';
import promise from 'eslint-plugin-promise';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    plugins: { import: importPlugin, 'unused-imports': unusedImports, promise },
    rules: {
      'unused-imports/no-unused-imports': 'error',
      'import/order': ['error', { 'newlines-between': 'always' }],
      'promise/always-return': 'error',
      'promise/no-nesting': 'warn',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'warn',
    },
  },
);
```

## 2. Formatting

| Stack | Tool | Config |
|---|---|---|
| Python | **Ruff format** | line length 100; double quotes; line endings LF |
| TypeScript | **Prettier** | line length 100; single quotes (TS convention); trailing commas |
| Markdown | **Prettier** | preserve line breaks |
| YAML | **Prettier** | 2-space indent |
| JSON | Built-in (Python `json.dumps`, Prettier) | 2-space indent |
| Terraform | `terraform fmt` | default |

Format runs pre-commit (auto-fix); CI verifies (no auto-fix in CI — fail loudly).

## 3. Type checking

### Python — mypy `--strict`

```toml
# pyproject.toml
[tool.mypy]
strict = true
python_version = "3.12"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
disallow_incomplete_defs = true
check_untyped_defs = true
disallow_untyped_decorators = true
no_implicit_optional = true
warn_redundant_casts = true
warn_unused_ignores = true
warn_no_return = true
warn_unreachable = true
strict_equality = true
```

Per-module relaxation is allowed but requires a justification comment:

```toml
[[tool.mypy.overrides]]
module = "third_party_thing.*"
ignore_missing_imports = true  # third party doesn't ship types
```

**Pyright** is an acceptable alternative on a per-project basis with an ADR. **ty** (Astral) is being watched — not yet stable enough as of 2026.

### TypeScript — strict mode + extras

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "useUnknownInCatchVariables": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": false
  }
}
```

`skipLibCheck: false` is opinionated — checks library `.d.ts` too. Default is `true` for speed; we choose `false` to catch real type bugs from dependencies. If a project's deps have broken types, we add narrow `skipLibCheck: true` overrides per dep, not globally.

## 4. Security scanning

| Concern | Tool | Where it runs |
|---|---|---|
| Dependency CVEs | **Dependabot** (config in `.github/dependabot.yml`) + `pip-audit` (Python CI) + `npm audit` (TS CI) | Daily for Dependabot; PR for `*-audit` |
| Static analysis (SAST) | **Semgrep** with `p/security-audit` + `p/secrets` + language rulesets (`p/python`, `p/typescript`) | PR |
| Secrets in source | **gitleaks** + GitHub's native secret scanning | Pre-commit + PR + scheduled |
| IaC misconfiguration | **tfsec** + **checkov** | PR (only when IaC paths changed) |
| Container scanning | **Trivy** | When Dockerfile or container build changes |
| SBOM generation | **Syft** | On release tag (uploaded as release artifact) |

Reusable workflow: `workflows/security-scan.yml`. Tool failures (high/critical findings) block merge unless an ADR exempts them.

## 5. Code comment policy

The principle: **comments document intent, not behavior**. Behavior should be obvious from code; intent often isn't.

### Required

- **Public API docstrings/JSDoc** on every function, class, and module exported from a package boundary.
  - Must include: purpose, params, returns, raises (Python) / throws (TS), ≥1 example for non-obvious uses.
  - Enforced via Ruff `D` rules (Python) and `eslint-plugin-jsdoc` (TS).
- **TODO comments** must follow `TODO(<owner>): <YYYY-MM-DD> <description>` format. Bare `TODO` is a lint warning. Owner can be `@me` for solo work; date is when the TODO was created.

### Encouraged

Comments explaining **why** are welcome. Examples worth commenting:
- Workarounds for external library bugs (link the bug)
- Non-obvious algorithms or data layouts
- Performance-driven choices that look weird ("this branch is hot; we measured")
- Regulatory or compliance constraints
- Time-sensitive logic ("this expires when X happens")

### Forbidden

- Comments explaining **what** the code does when the code already says that. (`# increment counter` next to `i += 1`.)
- Commented-out code (Ruff `ERA`).
- Bare `TODO` or `FIXME` without owner+date.
- "Helpful" comments that have rotted past the code they describe.

### Examples

✅ Good (explains *why*):
```python
# AWS API Gateway throttles to 10K req/s; batching here keeps us under the limit.
batches = chunked(events, 1000)
```

❌ Bad (explains *what*):
```python
# Loop over events
for event in events:
    process(event)
```

✅ Good (TODO with discipline):
```python
# TODO(@me): 2026-05-08 Replace with native deque rotate when Python 3.13 lands
```

❌ Bad (rot factory):
```python
# TODO: fix this later
```

## 6. What enforces code *quality* (not just style)

Code style and code *quality* are different things. Style is automatable; quality is partially automatable. This section documents what enforces what — so future-you knows where the gaps are.

| Aspect of "good code" | Enforced by | Notes |
|---|---|---|
| Consistent formatting | Formatter (Ruff format / Prettier) | Fully automated |
| Modern syntax usage | Linter (`UP` rules) | Fully automated |
| No unused vars/imports | Linter | Fully automated |
| Naming conventions (case, length) | Linter (`N` rules) | Style-level enforcement; doesn't judge whether name is *meaningful* |
| No magic numbers | Linter (`PLR2004`) | Forces use of named constants |
| No mutable default args | Linter (`B006`) | Catches a real bug class |
| No boolean parameter traps | Linter (`FBT`) | Style nudge toward keyword args |
| No commented-out code | Linter (`ERA`) | Fully automated |
| Functions not too long / complex | Linter (cyclomatic ≤ 10/15; lines ≤ 50/100) | Catches obvious-bad; doesn't catch "short but dense" |
| Type-correct contracts | Type checker (mypy strict / TS strict) | Catches whole bug classes; doesn't judge whether types are *good* |
| No security smells (eval, shell injection, hardcoded creds) | Linter (`S` rules) + Semgrep + gitleaks | Catches known patterns |
| No security CVEs in deps | Dependabot + audit tools | Catches known CVEs only |
| Documented public APIs | Linter (`D` rules / `jsdoc`) | Forces presence; doesn't judge content quality |
| Tests exist for new code | Coverage threshold (Standard 03) | Forces presence; doesn't judge test quality |
| Tests actually catch bugs | Mutation testing (Standard 03, critical paths) | Real signal |
| **Code is *clear* to read** | **`code-reviewer` subagent** | **Judgment-based** |
| **Abstractions match the problem** | **`architect` subagent** | **Judgment-based** |
| **Naming is *meaningful*** | **`code-reviewer` subagent** | **No tool can do this** |
| **Functions are well-decomposed** | **`code-reviewer` subagent + complexity limits as floor** | **Tool catches obvious; agent catches subtle** |

The judgment-based row is the gap that no linter fills. The AI code-reviewer subagent (defined in ADR-0011 / Standard 10 — AI workflows) is the qualitative gate. Its system prompt explicitly directs it to flag:

- Misleading or vague names (`data`, `info`, `helper` etc.)
- Functions doing more than one thing
- Premature abstraction or premature optimization
- Inconsistent abstractions across sibling code
- Cleverness that obscures intent (dense one-liners; non-obvious operator overloading)
- Comments explaining *what* instead of *why*
- TODOs without owner/date
- Inconsistent error handling across similar paths

These are the things humans catch and tools don't. Acknowledging the gap explicitly — instead of pretending tools cover everything — is what keeps the standard honest.

## 7. Pre-commit hooks

Tool: **[pre-commit framework](https://pre-commit.com/)**.

**Local (pre-commit):**

| Hook | Tool | Budget |
|---|---|---|
| Format | Ruff format / Prettier | <2s |
| Lint (changed files only) | Ruff / ESLint | <3s |
| Secrets scan | gitleaks | <2s |
| Commit message format | commitlint | <1s |
| Whitespace / EOL | pre-commit's built-in | <1s |

Total budget: **≤10s** on a typical commit. If pre-commit is slower than that, it gets disabled in practice — so we hold the budget.

**CI (full battery):**

- All pre-commit hooks (re-verified)
- Type check
- All tests with coverage
- Security scan (full Semgrep + audits)
- Build / package verification
- AI review (code-reviewer + security-reviewer + destructive-change-detector)

## 8. Complexity limits

| Metric | Warn | Block |
|---|---|---|
| Cyclomatic complexity (per function) | 10 | 15 |
| Function length (lines) | 50 | 100 |
| File length (lines) | 500 | n/a (warn only) |
| Parameter count | 5 | 8 |
| Cognitive complexity (per function) | 15 | n/a (report only) |

Cognitive complexity (more meaningful than cyclomatic) is reported via Semgrep but not blocking — too noisy to gate on.

## 9. Setup checklist

When bootstrapping a new project, the `new-project.sh` script will:

- [ ] Configure Ruff / ESLint with the pragmatic-strict ruleset
- [ ] Configure mypy strict / TS strict
- [ ] Install `pre-commit` framework with hooks (format, lint, secrets, commit-msg)
- [ ] Add `.github/dependabot.yml` for the stack
- [ ] Wire `security-scan.yml` workflow
- [ ] Configure coverage tier paths (cross-cutting with Standard 03)
- [ ] Add `.editorconfig` for cross-editor consistency
- [ ] Add `CONTRIBUTING.md` summarizing the local dev setup

## 10. Anti-patterns to avoid

- ❌ **`# noqa` / `eslint-disable` without justification.** A naked silenced lint is a code smell. Either fix the code or comment why the rule doesn't apply: `# noqa: E501  # URL doesn't break cleanly`.
- ❌ **`type: ignore` (Python) / `@ts-ignore` (TS) without justification.** Same rule; prefer `# type: ignore[specific-error]  # reason`.
- ❌ **Skipping pre-commit with `--no-verify`.** Defeats the gate. Acceptable only with same-line ADR-grade reason.
- ❌ **Adding `select = "ALL"` to Ruff.** Will cause a flood of bikeshedding on stylistic rules; keep the curated set.
- ❌ **Disabling `strict` mode in TS for a "quick fix."** Re-enable before merge or write an ADR.
- ❌ **Commented-out code.** Use git history.
