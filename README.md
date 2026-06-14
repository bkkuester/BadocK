# BadocK

BadocK is a local-first ADOC (Agentic Development Operation Center) for development with agents.

Short definition: BadocK is a command center for multi-agent development.

BadocK is not an IDE in the MVP. The MVP is an operational command center that coordinates agents, models, permissions, issues, branches/worktrees, diffs, reviews, costs, context and local/cloud execution.

The current implementation starts CLI-first with TypeScript packages so the core can be validated before any IDE, desktop app or polished UI exists.

## Core Flow

```txt
Issue -> plano -> agente -> worktree -> diff -> review -> custo -> PR
```

## Agent Context

Before developing anything, agents must read:

- `AGENTS.md`
- `docs/agent-context/README.md`
- `docs/agent-context/canonical-context.md`
- `docs/agent-context/development-rules.md`
- `docs/agent-context/agent-runtime-reference.md`

## MVP

The MVP must prove:

```txt
abrir projeto -> detectar stack basica -> criar/melhorar issue -> selecionar agente/modelo/permissoes -> executar em branch/worktree isolado -> capturar logs/diff -> revisar -> registrar custo estimado -> preparar/criar PR
```

## Current Packages

- `apps/cli`: local CLI entrypoint.
- `packages/core`: version and health primitives.
- `packages/config`: BadocK project manifest schema and validation.
- `packages/storage`: local SQLite storage and typed access layer.

## Safe Core Flow Commands

```bash
corepack pnpm badock:scan
corepack pnpm badock:issue:new --title "..." --objective "..." --scope "..." --agent ci-agent --acceptance "..."
corepack pnpm badock:issue:list
corepack pnpm badock:issue:show <local-issue-id>
corepack pnpm badock:issue:validate <local-issue-id>
corepack pnpm agents:issue <local-issue-id>
corepack pnpm agents:run <agent> <local-issue-id>
corepack pnpm badock:review-run <run-id>
corepack pnpm badock:commit-run <run-id>
corepack pnpm badock:push-run <run-id>
corepack pnpm agents:pr <agent> <local-issue-id> --run <run-id>
```

`agents:run` creates or reuses an isolated worktree, writes a run manifest, saves the prompt and captures status/diff evidence. It does not commit, push or open a PR. Real Codex CLI execution is opt-in through `--execute`; without it, the run is prepared and ends as `needs_user_decision`.

Run Report v0 writes the required audit bundle under `.badock/runs/<run-id>/`:

- `run.json`
- `prompt.md`
- `stdout.log`
- `stderr.log`
- `diff.patch`
- `summary.md`
- `traceability.md`

`run.json` includes schema version, target issues, agent/runtime/provider/model, Git branch/worktree/commits, final status, changed files, explicit cost availability and artifact paths. Logs and report metadata are sanitized before persistence, and artifact writes are restricted to the run directory.

`badock:commit-run`, `badock:push-run` and `agents:pr` are separate human-triggered steps. They refuse `main`/`master` by default and `commit-run` refuses forbidden files such as `.badock/runs/**`, `.agents/runs/**` and `.env*`.

## Validation Commands

```bash
corepack pnpm agents:doctor
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm runs:smoke
corepack pnpm runs:validate
```

## Lower-Level CLI Commands

```bash
corepack pnpm --filter @badock/cli badock health
corepack pnpm --filter @badock/cli badock manifest validate .badock/project.json
corepack pnpm --filter @badock/cli badock project scan .
corepack pnpm --filter @badock/cli badock project profile .
corepack pnpm --filter @badock/cli badock storage init .badock/badock.sqlite
corepack pnpm --filter @badock/cli badock provider register .badock/badock.sqlite --project <project-id> --id mock --type mock --default-model mock-planner
corepack pnpm --filter @badock/cli badock agent register .badock/badock.sqlite --project <project-id> --id backend-agent --role backend --provider mock --model mock-planner --permission manual
corepack pnpm --filter @badock/cli badock issue create .badock/badock.sqlite --project <project-id> --title <title> --objective <objective> --scope <scope> --agent <agent-id> --acceptance <criterion>
corepack pnpm --filter @badock/cli badock plan create .badock/badock.sqlite <issue-id> --agent <agent-id>
```

`project scan`, `project profile` and `badock:scan` only read files and Git metadata. They do not execute project scripts.

`project profile save` persists the detected StackProfile into SQLite. `plan create` reads the latest persisted StackProfile for the issue project and includes its validation scripts in the generated RunPlan.

Local providers, agents, issues, stack profiles and run plans are stored in SQLite so the MVP can proceed without GitHub. Markdown issues under `.badock/issues/` provide a file-first local issue path for the operational flow. A generated run plan always requires manual review and does not authorize execution by itself.

Run records use the canonical `RunStatus` set: `planned`, `running`, `completed`, `completed_with_warnings`, `paused_budget_limit`, `failed` and `needs_user_decision`.

Cost records are prepared for future audit by project, issue, run, agent, provider, model, tokens, cost, currency, measurement type (`exact` or `estimated`) and measurement source.

GitHub Actions CI runs on push and pull request to `main`, installs with `pnpm install --frozen-lockfile` and executes `pnpm check` on Ubuntu and Windows.

Provider secrets are not stored in the manifest or local provider registry. Agents select providers through the Provider Gateway, which exposes only public provider/model metadata and sanitized errors.

The core now includes a generic local process runtime adapter and a Codex CLI execution path based on `codex exec -` with prompt via stdin. Runtime evidence is written under `.badock/runs/<run-id>/` and ignored by Git.

## Directory Structure

- `.badock/project.json`: versioned BadocK project manifest.
- `.badock/issues/`: local markdown issues and index.
- `.badock/runs/`: local run evidence, ignored by Git.
- `.badock/reports/`: scanner and doctor reports, ignored by Git.
- `apps/cli`: command entrypoint.
- `packages/core`: scanner, issue-file store, agent selection, permissions, runtime, worktree, run report store, review, cost and GitHub helpers.
- `packages/config`: manifest parser and validation.
- `packages/storage`: SQLite persistence primitives.

## MVP Non-Goals

- No UI, IDE integration or desktop app.
- No autonomous provider calls without explicit runtime permission.
- No cloud sync and no Postgres.
- No secrets in versioned project configuration.

## Operational Docs

- `docs/manifest.md`: versioned project manifest fields and secret policy.
- `docs/storage.md`: local SQLite schema, location and reset guidance.
- `docs/runtime-adapters.md`: generic local process adapter contract, permission gate and known limits.
- `docs/changelog.md`: source-controlled delivery log.
- `docs/as-built.md`: delivered implementation notes and limitations.
- `docs/codex/context-request.md`: context-gathering prompt for Codex before implementation.

## Status

Repository initialized as the BadocK canonical project. The CLI now includes deterministic project scanning, stack profile persistence, local BadocK issue management, provider/agent registry primitives, permission-aware run planning, isolated worktree creation, Run Report v0 artifacts, diff review, unavailable-cost recording and separated commit/push/PR commands. `Environment` remains legacy/reference material only.
