# BadocK Canonical Context

Last consolidated: 2026-06-11
Repository: `bkkuester/BadocK`

## Official naming

The project is named **BadocK**.

`Environment` is a legacy name. Historical docs may use Environment; agents must normalize the intent to BadocK unless explicitly analyzing legacy code or old references.

## Central definition

BadocK is a local-first ADOC — Agentic Development Operation Center — for development with agents.

It coordinates:

- agents;
- models;
- permissions;
- issues;
- branches;
- PRs;
- costs;
- context;
- local/cloud execution.

BadocK is not born as a complete IDE. The MVP must be an operational command center. Later it may evolve into desktop app, workbench and IDE.

## Product thesis

BadocK must make this workflow more reliable than doing it manually with Codex, Claude, GitHub and terminal:

```txt
Issue → plano → agente → worktree → diff → review → custo → PR
```

This is the non-negotiable product spine.

## What BadocK should enable

BadocK should allow the user to:

1. open projects/repositories;
2. detect stack;
3. suggest and configure agents;
4. turn conversations into issues;
5. execute tasks in isolated branches/worktrees;
6. review diffs;
7. create PRs;
8. measure cost by agent/model/provider.

AI may suggest stack, agents, criteria and validations, but relevant decisions must become explicit configuration. The user may approve, edit or delegate decisions according to permissions.

## GitHub and local projects

GitHub matters for issues, PRs and remotes, but BadocK must not depend entirely on GitHub.

- local projects are valid;
- Git is recommended;
- GitHub must not block all usage;
- local issues are valid;
- GitHub Issues are valid;
- local issues may later sync to GitHub.

Useful issue sync states:

- `local_only`;
- `github_only`;
- `synced`;
- `modified_locally`;
- `modified_remotely`;
- `conflict`.

## Adapter layer principle

BadocK must prefer adapters over closed integration with one provider.

Potential adapters:

- Codex CLI Adapter;
- Claude Code Adapter;
- Generic Shell Agent Adapter;
- Ollama Adapter;
- OpenAI-compatible API Adapter;
- Anthropic API Adapter;
- Gemini Adapter;
- DeepSeek Adapter.

MVP should not implement every provider. It must prove the adapter layer with a minimal useful runtime.

Preferred MVP adapter path:

1. Codex CLI adapter;
2. Generic shell agent adapter;
3. basic Ollama adapter;
4. OpenAI-compatible API adapter.

Generic shell adapter matters because it allows external tools without deep integration.

Example shell runtime contract:

```json
{
  "agentRuntime": "shell",
  "command": "codex exec -",
  "stdin": true
}
```

Avoid passing large prompts as positional CLI arguments. Prefer stdin.

## MVP objective

Allow the user to open a repository, create/improve an issue with AI, select an agent/model/permissions, execute the task in an isolated worktree, view logs/diff/cost and create a PR.

## MVP modules

- Project Scanner básico;
- Stack Profiler básico;
- Issue Manager local;
- Agent Runtime Adapter inicial;
- Worktree Manager;
- Run Orchestrator;
- Diff/Review básico;
- GitHub Sync parcial;
- Cost Tracker básico;
- logs e relatório final.

## Non-MVP

Do not spend MVP capacity on:

- full IDE;
- advanced embedded editor;
- complex parallel multi-agent execution;
- all providers;
- model marketplace;
- perfect hardware telemetry;
- automatic merge;
- enterprise permissions;
- plugin system;
- sophisticated local LLM management;
- polished UI before core works.

## Development priority

1. Core operacional;
2. Manifesto de projeto;
3. Scanner de stack;
4. Issue Manager;
5. Agent Runtime Adapter;
6. Execução isolada;
7. Logs, diff e relatório;
8. GitHub Sync parcial;
9. Cost Tracker;
10. UI simples;
11. Desktop app;
12. IDE/workbench completa.

## Core modules

```txt
BadocK Core
├─ Project Scanner
├─ Stack Profiler
├─ Agent Team Builder
├─ Provider Gateway
├─ Permission Engine
├─ Issue Manager
├─ Run Orchestrator
├─ Worktree Manager
├─ Diff/Review Engine
├─ GitHub Sync
├─ Cost Tracker
├─ Local Telemetry
└─ Memory/Context Store
```

## Main risk

The main risk is scope explosion. BadocK can die by trying to become all of these at once:

- IDE;
- GitHub client;
- autonomous agent;
- cost dashboard;
- local model manager;
- security system;
- PR tool;
- orchestrator;
- AI evaluator;
- editor;
- terminal;
- CI manager.

The viable version is:

> A local-first ADOC that turns project + issue + model + agent into traceable, reviewable and measurable execution.

## Mandatory rule for agents

Before implementing anything, read:

1. `AGENTS.md`;
2. `docs/agent-context/README.md`;
3. `docs/agent-context/canonical-context.md`;
4. `docs/agent-context/development-rules.md`;
5. the relevant GitHub issue;
6. the relevant Notion page or decision log when applicable.

Do not invent repository state. Inspect files first.
