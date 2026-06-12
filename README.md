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
pnpm install
pnpm check
pnpm test
pnpm build
pnpm --filter @badock/cli badock health
pnpm --filter @badock/cli badock manifest validate .badock/project.example.json
pnpm --filter @badock/cli badock storage init .badock/badock.sqlite
```

## MVP Non-Goals

- No UI, IDE integration or desktop app.
- No provider calls and no real agent execution.
- No cloud sync and no Postgres.
- No secrets in versioned project configuration.

## Operational Docs

- `docs/manifest.md`: versioned project manifest fields and secret policy.
- `docs/storage.md`: local SQLite schema, location and reset guidance.
- `docs/codex/context-request.md`: context-gathering prompt for Codex before implementation.

## Status

Repository initialized as the BadocK canonical project. `Environment` remains legacy/reference material only.
