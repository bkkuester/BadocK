# As-Built

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
