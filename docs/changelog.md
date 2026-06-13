# Changelog

## 2026-06-13

### Added

- Issue #14: added the generic `local-process` runtime adapter contract in `@badock/core`.
- Added permission-gated local process execution with structured `program` plus `args`, `shell: false`, cwd, stdin, timeout, output capture and sanitized result metadata.
- Added storage support for persisting sanitized adapter results as run logs.
- Added `docs/runtime-adapters.md` with adapter contract, stdin policy, permission behavior, environment policy and known limitations.

### Validation

- Added deterministic tests for success, non-zero exit, stderr, missing binary, timeout, partial output, permission `ask`, permission `deny`, secret sanitization, sensitive environment keys and cwd with spaces.

### Known Limitations

- No Codex CLI-specific adapter yet.
- No Worktree Manager or Run Orchestrator integration yet.
- No direct CLI command for arbitrary local process execution in this issue.
