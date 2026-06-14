# As-Built

## 2026-06-13 - Remediation Gate + Run Report v0

Delivered scope:

- Run Report v0 now persists the mandatory `.badock/runs/<run-id>/` artifact bundle: `run.json`, `prompt.md`, `stdout.log`, `stderr.log`, `diff.patch`, `summary.md` and `traceability.md`.
- `run.json` now records `schemaVersion`, `runId`, `targetIssues`, issue metadata, agent runtime/provider/model metadata, Git branch/worktree/commit metadata, final status, changed files, cost availability and artifact names.
- `summary.md` uses the required source availability, target issues, agent, Git, changed files, validation, cost, decision and next action sections.
- `traceability.md` records target issues, coverage matrix, unresolved/risky items and final decision so runs cannot be marked complete without evidence.
- Run artifact paths are derived from the validated `runId` and known artifact names, and writes are constrained to `.badock/runs/<run-id>/`.
- Report text, logs and metadata are sanitized before persistence.
- Root scripts `runs:smoke` and `runs:validate` validate the report contract without new dependencies.

Design decisions:

- The existing `packages/core/src/run-store.ts` and CLI workflow integration were reused instead of introducing a parallel scripts directory.
- Runtime statuses still allow `planned` and `running` for in-progress records, while `runs:validate` requires a final report status: `completed`, `completed_with_warnings`, `failed` or `needs_user_decision`.
- Cost remains explicit and non-invented: tokens and amount stay `null` when unavailable, with report notes stating that cost is estimated or unavailable for the runtime.

Validation:

- Smoke coverage checks required artifacts, manifest fields, secret masking, path traversal blocking, invalid final status rejection, missing artifact detection and preservation of a pre-existing worktree file.

Known limitations:

- The validator checks the local artifact contract; it does not authenticate GitHub or fetch remote issue/PR bodies.
- Run Report v0 records cost availability, but exact provider token/cost metering remains future adapter work.

## 2026-06-13 - Core Operational Flow

Delivered scope:

- The project now has a real versioned `.badock/project.json` manifest for BadocK as a local-first ADOC.
- Root package scripts expose the operational flow: scan, local issue, plan, run, review, commit, push and PR.
- Markdown local issues live under `.badock/issues/` and can be created, listed, shown and validated without GitHub.
- The CLI can write deterministic project scan reports to `.badock/reports/project-scan.json`.
- Worktree metadata and creation are centralized in `packages/core/src/worktree-manager.ts`.
- Run evidence is centralized in `packages/core/src/run-store.ts` and written to `.badock/runs/<run-id>/`.
- `agents:run` creates or reuses an issue/agent worktree and captures run evidence. It does not commit, push or open PR.
- Codex CLI execution is opt-in with `--execute`; prompts are sent through stdin with `codex exec -`.
- Diff review is deterministic and writes `review.json` plus `review.md`.
- Commit, push and PR commands are separate and refuse main/master by default.
- Cost for Codex CLI runs is recorded as `not_available` rather than estimated or invented.
- GitHub Sync is partial and remains optional through gh CLI helpers.
- Doctor v2 produces console checks and `.badock/reports/doctor.json`.

Design decisions:

- The existing monorepo layout was preserved. The old prompt referenced `scripts/*.ts`, but the real repo uses `apps/cli` and `packages/*`, so the core was implemented there instead of adding a parallel scripts tree.
- `.badock/runs/**`, `.badock/reports/**` and `.agents/runs/**` are ignored because they are execution evidence, not product delivery.
- `.badock/issues/.gitkeep` is versioned so the local issue store exists without committing generated issue drafts by default.
- Agent selection is explicit. The previous free-text role inference was removed from `suggestAgentForIssue()`.
- The CLI `typecheck` builds workspace package declarations before checking because this repo imports packages through their `dist` exports.

Validation:

- `corepack pnpm typecheck`
- `corepack pnpm test`

Known limitations:

- `agents:run` without `--execute` intentionally stops at `needs_user_decision`.
- Real Codex CLI execution depends on `codex` being installed and allowed in the user's environment.
- GitHub issue/PR operations depend on gh CLI and authentication.
- Cost remains unavailable for Codex CLI unless a future adapter can report tokens/costs.

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
