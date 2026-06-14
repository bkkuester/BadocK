# Changelog

## 2026-06-13

### Added - Remediation Gate + Run Report v0

- Added Run Report v0 manifest fields for `schemaVersion`, `runId`, `targetIssues`, issue metadata, agent runtime/provider/model metadata, Git branch/worktree/commit metadata, final status, changed files, explicit cost availability and artifact map.
- Added mandatory `traceability.md` generation alongside `summary.md`, `prompt.md`, `stdout.log`, `stderr.log`, `diff.patch` and `run.json`.
- Added run artifact validation for required files, required manifest fields, final status checks, cost metadata, missing artifact detection and path traversal rejection.
- Added `runs:smoke` and `runs:validate` scripts without adding dependencies.

### Changed - Remediation Gate + Run Report v0

- Hardened run artifact writes so reports are derived from `runId` and known artifact names under `.badock/runs/<runId>/`.
- Expanded secret masking for common token/key/password assignments and GitHub/OpenAI-style token patterns before logs and reports are written.
- Updated workflow commands to pass issue title, target issue metadata, base branch and validation notes into run reports.

### Validation - Remediation Gate + Run Report v0

- Added deterministic smoke coverage for required artifacts, manifest fields, secret masking, path traversal rejection, missing artifact detection, invalid status rejection and preservation of pre-existing worktree files.

### Added - Core Operational Flow

- Added `.badock/project.json` as the versioned BadocK project manifest with ADOC identity, stack, VCS, GitHub, agents, permissions, runs and cost policy.
- Added root workflow scripts: `badock:scan`, `badock:issue:*`, `agents:doctor`, `agents:issue`, `agents:run`, `badock:review-run`, `badock:commit-run`, `badock:push-run` and `agents:pr`.
- Added markdown local issue storage under `.badock/issues/`.
- Added Worktree Manager primitives for deterministic issue/agent branch and worktree naming.
- Added run artifact store under `.badock/runs/<run-id>/` with `run.json`, prompt, stdout/stderr, git status, diff and summary files.
- Added deterministic Diff/Review Engine with forbidden artifact, env/secrets, workflow, lockfile, package manifest, scope and diff-size checks.
- Added explicit unavailable-cost records so Codex CLI cost is not invented when token/cost data is unavailable.
- Added partial GitHub helpers for gh availability, issue listing, issue publishing and PR creation from non-main branches.
- Added Doctor v2 CLI checks for manifest, scripts, gitignore, branch, gh availability and manifest agents.

### Changed - Core Operational Flow

- Agent suggestion no longer falls back to free-form issue text heuristics. Selection requires explicit issue-suggested agents or manual selection.
- `agents:run` prepares isolated worktree execution and evidence, but does not commit, push or open PR.
- Real Codex CLI execution is opt-in with `--execute` and uses `codex exec -` with prompt via stdin.
- `.badock/runs/**`, `.badock/reports/**` and `.agents/runs/**` are ignored by Git.
- README and AGENTS now document the safe `run -> review -> commit -> push -> PR` sequence.

### Validation - Core Operational Flow

- Added tests for operational manifest parsing, helper normalization and no-secret policy exceptions for permission fields.
- Added tests proving agent selection does not infer from free-form issue text.
- Added tests for markdown issue creation/list/validation.
- Added tests for deterministic worktree metadata, run manifest creation, unavailable cost records and review findings.
- Added CLI tests for scan reports and markdown issue workflow commands.

### Added - Fase 0 Foundation Gate

- Fase 0 foundation gate: added GitHub Actions CI for push and pull request to `main`, using pnpm, `pnpm install --frozen-lockfile` and `pnpm check`.
- Added canonical `RunStatus` storage contract: `planned`, `running`, `completed`, `completed_with_warnings`, `paused_budget_limit`, `failed` and `needs_user_decision`.
- Added versioned SQLite migration tracking through `schema_migration`.
- Expanded `cost_record` for future audit by project, issue, run, agent, provider, model, tokens, cost, currency, measurement type and measurement source.
- Added explicit CLI flow to persist StackProfile: `badock project profile save <db-path> <project-id> <project-path>`.

### Changed - Fase 0 Foundation Gate

- Updated Node engine floor to `>=22.5 <25` because the storage package uses `node:sqlite`.
- `plan create` is now covered by tests proving it consumes the latest persisted StackProfile validation scripts.
- Legacy run status `decision_required` is migrated to `needs_user_decision`.
- Legacy cost rows are retained and tagged with `measurement_source = migration:legacy-cost-record` when migrated.

### Validation - Fase 0 Foundation Gate

- Added tests for canonical run status acceptance/rejection.
- Added tests for idempotent migrations.
- Added tests for auditable CostRecord dimensions.
- Added tests for StackProfile save/retrieve and `plan create` consumption.
- Added path-with-spaces CLI coverage for saved StackProfile and RunPlan generation.

### Known Limitations - Fase 0 Foundation Gate

- Real agent execution, full Run Orchestrator lifecycle, Worktree Manager, UI and GitHub Sync remain out of scope for this phase.
- GitHub issue bodies were not fetched locally because `gh` returned HTTP 401 in this environment.

### Added - Issue #14

- Issue #14: added the generic `local-process` runtime adapter contract in `@badock/core`.
- Added permission-gated local process execution with structured `program` plus `args`, `shell: false`, cwd, stdin, timeout, output capture and sanitized result metadata.
- Added storage support for persisting sanitized adapter results as run logs.
- Added `docs/runtime-adapters.md` with adapter contract, stdin policy, permission behavior, environment policy and known limitations.

### Validation - Issue #14

- Added deterministic tests for success, non-zero exit, stderr, missing binary, timeout, partial output, permission `ask`, permission `deny`, secret sanitization, sensitive environment keys and cwd with spaces.

### Known Limitations - Issue #14

- No Codex CLI-specific adapter yet.
- No Worktree Manager or Run Orchestrator integration yet.
- No direct CLI command for arbitrary local process execution in this issue.
