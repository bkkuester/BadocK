# AGENTS.md - BadocK Agent Operating Context

This file is mandatory reading for every agent before planning, editing, reviewing, or creating issues/PRs in BadocK.

BadocK is the official project name. `Environment` is legacy terminology and must be treated only as historical reference.

## Product Identity

BadocK means:

- B = Brayan;
- ADOC = Agentic Development Operation Center;
- K = Kuester.

BadocK is a local-first ADOC for agentic development. It coordinates agents, models, permissions, issues, branches, worktrees, diffs, reviews, costs, context and local/cloud execution in real projects.

Short definition: BadocK is a command center for multi-agent development.

BadocK is not an IDE in the MVP. The MVP must behave as an operational command center. A desktop app, workbench and IDE can exist later.

## Mandatory Core Flow

Every feature, workflow, issue, run, test, report and PR must preserve this flow:

```txt
Issue -> plano -> agente -> worktree -> diff -> review -> custo -> PR
```

If a proposal does not strengthen this flow, it does not belong in the MVP.

## Repository And Documentation Sources

Primary documentation pack:

- `AGENTS.md`
- `docs/agent-context/README.md`
- `docs/agent-context/canonical-context.md`
- `docs/agent-context/development-rules.md`
- `docs/agent-context/agent-runtime-reference.md`
- `docs/agent-context/notion-sync-log.md`
- `docs/agent-context/legacy-reference.md`

Notion is the project documentation hub. Every relevant decision, issue, architecture change, risk, run summary and as-built record must be documented there as well.

## MVP Scope

The MVP must prove the smallest useful vertical flow:

```txt
abrir projeto -> detectar stack basica -> criar/melhorar issue -> selecionar agente/modelo/permissoes -> executar em branch/worktree isolado -> capturar logs/diff -> revisar -> registrar custo estimado -> preparar/criar PR
```

MVP modules:

- Project Scanner basico;
- Stack Profiler basico;
- Issue Manager local;
- Agent Runtime Adapter inicial;
- Worktree Manager;
- Run Orchestrator;
- Diff/Review basico;
- GitHub Sync parcial;
- Cost Tracker basico;
- logs e relatorio final.

Out of MVP:

- IDE completa ou editor avancado;
- execucao paralela complexa;
- suporte completo a todos os providers;
- marketplace de modelos;
- telemetria perfeita por agente;
- merge automatico;
- permissoes enterprise;
- plugin system;
- gerenciamento sofisticado de LLMs locais;
- UI polida antes do core funcionar.

The current repository implementation is CLI-first and includes only the foundational TypeScript packages, manifest validation and local SQLite storage.

## Development Order

Do not invert this order without a strong reason documented in Notion:

1. Core operacional;
2. Manifesto de projeto;
3. Scanner de stack;
4. Issue Manager;
5. Agent Runtime Adapter;
6. Execucao isolada;
7. Logs, diff e relatorio;
8. GitHub Sync parcial;
9. Cost Tracker;
10. UI simples;
11. Desktop app;
12. IDE/workbench completa.

## Core Conceptual Modules

BadocK evolves around:

- Project Scanner;
- Stack Profiler;
- Agent Team Builder;
- Provider Gateway;
- Permission Engine;
- Issue Manager;
- Run Orchestrator;
- Worktree Manager;
- Diff/Review Engine;
- GitHub Sync;
- Cost Tracker;
- Local Telemetry;
- Memory/Context Store.

## Permission Model

Permissions are central product behavior, not a detail.

### Manual Mode

- read files: allowed;
- edit files: ask;
- run commands: ask;
- commit: ask;
- push: ask;
- open PR: ask.

### Supervised Mode

- read files: allowed;
- edit files inside scope: allowed;
- run tests: allowed;
- install dependencies: ask;
- alter `.env`, config or secrets: ask;
- commit, push, PR: ask.

### Autonomous Mode

- read files: allowed;
- edit files: allowed;
- allowlisted commands: allowed;
- commit, push and PR only when explicitly enabled.

Execution on `main` must only happen by explicit user request. Default execution is branch/worktree isolated by issue/run.

## Sensitive Actions

The following actions require confirmation or explicit permission:

- installing dependencies;
- altering critical configs;
- modifying secrets;
- destructive commands;
- push;
- PR creation;
- changing `main`;
- changing CI/CD;
- changing auth/security.

## Secrets

Never store API keys in a versioned manifest. Never expose full keys in logs or agent prompts. Prefer OS secret storage or equivalent local secret store. Agents should receive provider access through Provider Gateway, not raw keys.

Logs must mask secrets.

## Cost And Telemetry

BadocK must register usage by project, run, issue, agent, provider and model.

Tokens and cost may be estimated when precise values are unavailable, but this must be declared.

Budget rule:

- do not start a task if estimated budget is insufficient;
- if a limit is reached during execution, finish the current step and stop in a safe state.

Useful states:

- `completed`;
- `completed_with_warnings`;
- `paused_budget_limit`;
- `failed`;
- `needs_user_decision`.

## Memory/Context Separation

Do not collapse all context into one blob. Use:

- Project Memory: stack, architecture, commands, conventions, technical decisions;
- Agent Memory: role-specific rules and learnings;
- Run Memory: issue, prompt, model, files, commands, logs, cost, result;
- Decision Log: relevant technical decisions and rationale.

Do not invent repository state. If files, logs, changelog or command outputs exist, inspect them before proposing changes.

## Issue Format

Use this standard:

```md
Titulo(feature):
Objetivo:
Escopo:
Agente(s) sugerido(s):
Criterios de aceite:
Observacoes tecnicas:
Arquivos: somente se realmente necessario
```

A good issue has clear objective, limited scope, verifiable acceptance criteria, suggested agents, useful technical notes and objective validation.

Do not mix multiple large features without need.

## Codex Context Rule

Before implementation, collect repository context, current branch, dirty worktree state and relevant docs. A context request must not authorize implementation before that repo survey is complete.

## Definition Of Done

An issue is solved when:

- acceptance criteria are satisfied;
- required tests/validations passed;
- review-agent did not block;
- security-agent did not block when applicable;
- diff was approved by the user or by explicit rule;
- PR was created or branch is ready.

## Implementation Gate

Every technical suggestion must directly help BadocK as an ADOC, avoid unnecessary scope, preserve traceability, protect secrets, respect permissions, and include verifiable acceptance criteria.

Final gate:

> Does this help BadocK coordinate agents better than using Codex, Claude, GitHub and terminal manually?

If no, do not implement now.
