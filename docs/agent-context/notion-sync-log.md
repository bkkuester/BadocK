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
