# Changelog

## 2026-06-13

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
