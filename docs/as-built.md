# As-Built

## 2026-06-13 - Fase 0 Foundation Gate

Related issues: #4, #6, #17, #22, #26, #27.

Delivered scope:

- GitHub Actions CI now runs on push and pull request to `main`.
- CI uses pnpm, installs with `pnpm install --frozen-lockfile` and runs `pnpm check`.
- Root `engines.node` now requires `>=22.5 <25` to match the `node:sqlite` dependency.
- Storage exports the canonical `RunStatus` contract: `planned`, `running`, `completed`, `completed_with_warnings`, `paused_budget_limit`, `failed`, `needs_user_decision`.
- SQLite migration history is tracked in `schema_migration`.
- The `run` table is migrated to the canonical status CHECK constraint.
- Legacy `decision_required` run rows are migrated to `needs_user_decision`.
- `cost_record` now stores project, issue, run, agent, provider, model, token, cost, currency, measurement type and measurement source dimensions.
- Legacy cost rows are migrated without deletion and marked with `migration:legacy-cost-record` when old rows lack measurement source.
- CLI now supports `badock project profile save <db-path> <project-id> <project-path>`.
- `plan create` is covered by tests proving it consumes the latest persisted StackProfile.

Design decisions:

- The phase remains storage/contract/CLI-only. No real adapter execution, Worktree Manager, UI or GitHub Sync was introduced.
- `CostRecord` creation validates that `projectId`, `issueId` and `runId` match the persisted run before insertion.
- Migration rows are inserted with `INSERT OR IGNORE` so repeated opens are idempotent.
- Legacy cost `agent_id` defaults to `unknown` because the old schema did not store that dimension.
- Cost `currency` is normalized to uppercase at write time.

Validation:

- Storage tests cover canonical RunStatus acceptance/rejection.
- Storage tests cover auditable CostRecord dimensions.
- Storage tests cover idempotent migrations.
- Storage tests cover migration from legacy run status and legacy cost schema.
- CLI tests cover StackProfile persistence and `plan create` consumption.
- CLI tests include a project path with spaces.

Known limitations:

- GitHub issue bodies could not be fetched with local `gh` because the CLI returned HTTP 401.
- Cost values remain caller-provided; exact provider metering is not implemented in this phase.
- Run lifecycle transitions are not implemented yet.
- No real agent execution, advanced worktree management, UI or PR creation was added.

## 2026-06-13 - Issue #14 Local Process Runtime Adapter

Issue: #14 `feature: implementar adapter generico de processo local`

Delivered scope:

- `@badock/core` now exposes `runLocalProcess()`, `createLocalProcessAdapter()` and `formatProcessCommand()`.
- Runtime commands are represented as `program` plus `args`; the adapter does not execute shell-concatenated command strings.
- Permission Engine evaluation happens before process spawn.
- Permission `ask` returns `needs_user_decision` without execution.
- Permission `deny` returns `blocked` without execution.
- Process results capture stdout, stderr, exit code, signal, spawn errors, timeout, cancellation, cwd and duration.
- Public result data is sanitized before returning or persisting.
- `@badock/storage` can persist sanitized adapter evidence with `recordAgentRuntimeResult()`.

Design decisions:

- No CLI command was added for direct local process execution. The runtime adapter remains a core primitive until Run Orchestrator and Worktree Manager are implemented.
- Adapter output is persisted through `run_log.metadata_json` instead of a new runtime-result table to keep the MVP schema narrow.
- Environment variables are allowlisted, and secret-like environment keys are blocked before spawn.

Validation:

- Unit tests cover the runtime adapter matrix required by issue #14.
- Storage tests cover sanitized runtime result persistence.

Known limitations:

- Adapter is not yet connected to a full run lifecycle.
- Worktree authorization is not enforced by this adapter alone; it relies on future Worktree Manager and Run Orchestrator integration.
- Cost tracking is not attached to local process execution yet.
- Output truncation is character-based.
