# BadocK Notion Sync Log

Last consolidated: 2026-06-11

## Hub

Main Notion hub:

- BadocK — Documentation Hub

The hub currently contains pages for:

- Product Definition;
- MVP Scope;
- Technical Architecture;
- Development Governance;
- Backlog and Initial Issues;
- Changelog;
- As-Built;
- Decision Log;
- Security and Permissions;
- Stack Recommendation;
- README Source;
- License Reference;
- Codex Cloud Environment e Context Request;
- Predictive Risk Register;
- Reference Intelligence.

## Documentation rule

Every relevant development action must be mirrored into Notion with:

- objective;
- scope;
- decision;
- rationale;
- acceptance criteria;
- risks;
- validations;
- impact on MVP;
- issue/branch/PR/run reference when available.

## GitHub vs Notion roles

GitHub repo docs:

- operational context for agents;
- source-controlled instructions;
- agent runtime references;
- implementation-adjacent rules.

Notion:

- product knowledge hub;
- decision log;
- backlog context;
- as-built records;
- run history summaries;
- cross-reference between issues, PRs and decisions.

## Current export

This export created the repository-side agent context pack under:

```txt
docs/agent-context/
```

The intended Notion mirror page is:

```txt
14 — Agent Context Pack
```

## Maintenance rule

Whenever these repo docs change, update Notion with a short sync note:

```txt
Date:
Changed files:
Why:
Impact on agents:
Related issue/PR:
```

## Repo-side sync notes

### 2026-06-13 - Fase 0 foundation gate

Changed files:

- `AGENTS.md`
- `.github/workflows/ci.yml`
- `package.json`
- `README.md`
- `docs/storage.md`
- `docs/changelog.md`
- `docs/as-built.md`
- `docs/agent-context/development-rules.md`
- `docs/agent-context/agent-runtime-reference.md`

Why:

- Aligned Fase 0 foundation contracts before real agent execution: CI, canonical run statuses, SQLite schema versioning, auditable costs and persisted StackProfile flow.

Impact on agents:

- Agents must use the canonical `RunStatus` set, treat CostRecord as audit metadata and save StackProfile before expecting `plan create` to infer stack validations.

Related issue/PR:

- GitHub issues #4, #6, #17, #22, #26 and #27.

### 2026-06-13

Changed files:

- `docs/runtime-adapters.md`
- `docs/changelog.md`
- `docs/as-built.md`
- `docs/storage.md`
- `docs/agent-context/agent-runtime-reference.md`
- `README.md`

Why:

- Documented issue #14 delivery: generic local process runtime adapter, permission gate, stdin policy, sanitized runtime result persistence and known limitations.

Impact on agents:

- Agents can rely on a provider-neutral local process adapter primitive, but must not treat it as full run execution before Worktree Manager and Run Orchestrator are implemented.

Related issue/PR:

- GitHub issue #14.
