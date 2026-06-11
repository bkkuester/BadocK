# BadocK Agent Context Pack

Last consolidated: 2026-06-11
Repository: `bkkuester/BadocK`

This folder contains the operational knowledge pack that agents must read before developing BadocK.

## Mandatory reading order

1. `../../AGENTS.md`
2. `canonical-context.md`
3. `development-rules.md`
4. `agent-runtime-reference.md`
5. `notion-sync-log.md`
6. `legacy-reference.md` only when legacy context is needed.

## What this pack is for

This pack exists so Codex, Claude Code, local agents, review agents and future BadocK agents can start with the same project knowledge as the product owner and architecture discussions.

Agents must not begin implementation from a blank repo assumption.

## Current canonical summary

BadocK is a local-first ADOC, not an IDE in the MVP.

Core flow:

```txt
Issue → plano → agente → worktree → diff → review → custo → PR
```

MVP target:

```txt
open project → detect basic stack → create/improve issue → select agent/model/permissions → execute in isolated branch/worktree → capture logs/diff → review → estimate cost → prepare/create PR
```

## Source types

This pack consolidates:

- project instructions;
- prior architecture discussions;
- Notion hub structure;
- uploaded legacy consultation file;
- BadocK naming decision;
- development governance;
- security, permissions and cost rules.

## Important warning

Do not treat this folder as a substitute for reading the current repository state.

Before modifying files, inspect:

- existing code;
- existing docs;
- changelog;
- issues;
- relevant Notion records;
- current branch/diff.
