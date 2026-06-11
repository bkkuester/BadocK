# BadocK Development Rules

Last consolidated: 2026-06-11

## Non-negotiable development spine

Every implementation must reinforce:

```txt
Issue → plano → agente → worktree → diff → review → custo → PR
```

## Scope discipline

BadocK is an ADOC in the MVP, not an IDE.

A change is acceptable only if it:

- improves agent coordination;
- preserves traceability;
- supports issue/run/worktree flow;
- respects permissions;
- does not expose secrets;
- can be validated objectively;
- can be implemented incrementally.

## Required issue format

```md
Título(feature):
Objetivo:
Escopo:
Agente(s) sugerido(s):
Critérios de aceite:
Observações técnicas:
Arquivos: somente se realmente necessário
```

## Issue quality criteria

A good issue must have:

- clear objective;
- limited scope;
- verifiable acceptance criteria;
- suggested agents;
- useful technical notes;
- objective validation.

Do not combine multiple large features in one issue unless the coupling is unavoidable and documented.

## Definition of Done

An issue is done when:

1. acceptance criteria are satisfied;
2. required tests/validations passed;
3. review-agent did not block;
4. security-agent did not block when applicable;
5. diff was approved by the user or by explicit rule;
6. PR was created or branch is ready.

## Permission modes

### Manual

- read files: allowed;
- edit files: ask;
- run commands: ask;
- commit: ask;
- push: ask;
- open PR: ask.

### Supervised

- read files: allowed;
- edit files inside scope: allowed;
- run tests: allowed;
- install dependencies: ask;
- alter `.env`, config or secrets: ask;
- commit: ask;
- push: ask;
- PR: ask.

### Autonomous

- read: allowed;
- edit: allowed;
- allowlisted commands: allowed;
- commit/push/PR only if explicitly enabled.

## Sensitive actions

Always require confirmation or explicit permission for:

- installing dependencies;
- changing critical configs;
- modifying secrets;
- destructive commands;
- push;
- opening PR;
- changing `main`;
- changing CI/CD;
- auth/security changes.

## Branch and worktree rule

Default execution is isolated by issue/run.

Expected shape:

```txt
issue/{issue-id}-{slug}
run/{run-id}
worktree per run
```

Execution on `main` requires explicit user request.

## Secrets policy

Do not store API keys in a versioned manifest.

Do not expose complete API keys to agents, prompts, logs, reports or Notion.

Preferred flow:

```txt
OS Secret Store / local secret store
↓
Provider Gateway
↓
Agent runtime receives scoped access, not raw key
```

Logs must mask secrets.

## Cost and budget policy

Track usage by project, run, issue, agent, provider and model.

When exact tokens/cost are unavailable, mark the value as estimated.

Budget rule:

```txt
Do not start if estimated budget is insufficient.
If the limit is hit during execution, finish the current step and stop safely.
```

Useful run states:

- `completed`;
- `completed_with_warnings`;
- `paused_budget_limit`;
- `failed`;
- `needs_user_decision`.

## Required run report

Every run should produce a final report with:

- issue reference;
- agent;
- provider/model;
- permission mode;
- branch/worktree;
- files touched;
- commands executed;
- validations executed;
- diff summary;
- cost/tokens, or estimated status;
- outcome state;
- blockers/risks;
- PR URL or branch-ready status.

## Documentation rule

Document everything relevant in Notion:

- objective;
- scope;
- decision;
- rationale;
- acceptance criteria;
- risks;
- validations;
- impact on MVP;
- issue/branch/PR/run reference when available.

GitHub documentation is for agent consumption inside the repo. Notion is the project knowledge base and decision log.
