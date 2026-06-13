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

## Commands

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm --filter @badock/cli badock health
pnpm --filter @badock/cli badock project scan .
pnpm --filter @badock/cli badock project profile .
pnpm --filter @badock/cli badock project profile save .badock/badock.sqlite <project-id> .
pnpm --filter @badock/cli badock manifest validate .badock/project.example.json
pnpm --filter @badock/cli badock storage init .badock/badock.sqlite
pnpm --filter @badock/cli badock provider register .badock/badock.sqlite --project <project-id> --id mock --type mock --default-model mock-planner
pnpm --filter @badock/cli badock provider list .badock/badock.sqlite --project <project-id>
pnpm --filter @badock/cli badock agent register .badock/badock.sqlite --project <project-id> --id backend-agent --role backend --provider mock --model mock-planner --permission manual
pnpm --filter @badock/cli badock agent list .badock/badock.sqlite --project <project-id>
pnpm --filter @badock/cli badock issue create .badock/badock.sqlite --project <project-id> --title <title> --objective <objective> --scope <scope> --agent <agent-id> --acceptance <criterion>
pnpm --filter @badock/cli badock issue list .badock/badock.sqlite
pnpm --filter @badock/cli badock issue view .badock/badock.sqlite <issue-id>
pnpm --filter @badock/cli badock issue update .badock/badock.sqlite <issue-id> --state planned
pnpm --filter @badock/cli badock plan create .badock/badock.sqlite <issue-id> --agent <agent-id>
```

`project scan` and `project profile` only read files and Git metadata. They do not execute project scripts.

`project profile save` persists the detected StackProfile into SQLite. `plan create` reads the latest persisted StackProfile for the issue project and includes its validation scripts in the generated RunPlan.

Local providers, agents, issues, stack profiles and run plans are stored in SQLite so the MVP can proceed without GitHub. A generated run plan always requires manual review and does not authorize execution by itself.

Run records use the canonical `RunStatus` set: `planned`, `running`, `completed`, `completed_with_warnings`, `paused_budget_limit`, `failed` and `needs_user_decision`.

Cost records are prepared for future audit by project, issue, run, agent, provider, model, tokens, cost, currency, measurement type (`exact` or `estimated`) and measurement source.

GitHub Actions CI runs on push and pull request to `main`, installs with `pnpm install --frozen-lockfile` and executes `pnpm check` on Ubuntu and Windows.

Provider secrets are not stored in the manifest or local provider registry. Agents select providers through the Provider Gateway, which exposes only public provider/model metadata and sanitized errors.

The core now includes a generic local process runtime adapter. It executes only structured `program` plus `args` commands after Permission Engine approval, captures sanitized stdout/stderr/errors and supports stdin and timeout handling. It is not exposed as a direct arbitrary-process CLI command yet; Run Orchestrator and Worktree Manager integration remain required before real run execution.

## MVP Non-Goals

- No UI, IDE integration or desktop app.
- No provider calls and no real agent execution.
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

Repository initialized as the BadocK canonical project. The CLI now includes deterministic project scanning, stack profile persistence, local BadocK issue management, provider/agent registry primitives, permission-aware run planning and persisted run-plan generation. Core primitives now include a permission-gated generic local process runtime adapter for future run execution. `Environment` remains legacy/reference material only.
