# BadocK Agent Runtime Reference

Last consolidated: 2026-06-11

## Purpose

This document tells implementation agents how to think about BadocK's agent runtime layer.

BadocK must coordinate different agent/model/provider tools without becoming hardwired to one provider.

## Adapter-first architecture

BadocK should use a runtime adapter layer.

Expected adapter families:

- shell CLI adapters;
- hosted API adapters;
- local model adapters;
- OpenAI-compatible endpoint adapters.

## MVP adapter priorities

1. Codex CLI Adapter;
2. Generic Shell Agent Adapter;
3. basic Ollama Adapter;
4. OpenAI-compatible API Adapter.

Do not implement all provider integrations in the MVP.

Agents must not receive raw provider credentials. They select a provider/model alias, and runtime access goes through the Provider Gateway. Public provider configuration may include alias, type, endpoint, default model and non-secret parameters. Secrets stay outside the versioned manifest and outside run logs.

The first provider adapter is deterministic and mock-backed so planning, diff review and report flows can be tested without external network calls. Real provider calls must remain behind the same gateway contract.

## Generic shell contract

Minimum adapter shape:

```json
{
  "id": "codex-cli",
  "type": "shell",
  "command": "codex",
  "args": ["exec", "-"],
  "stdin": true,
  "cwdPolicy": "worktree",
  "captures": ["stdout", "stderr", "exitCode"],
  "permissionMode": "supervised"
}
```

## Current local process adapter

The MVP now includes a generic `local-process` adapter primitive.

Current guarantees:

- commands are represented as `program` plus `args`;
- the adapter uses process spawn with `shell: false`;
- prompt/context can be sent through stdin;
- Permission Engine is evaluated before spawn;
- permission `ask` returns `needs_user_decision` without execution;
- permission `deny` returns `blocked` without execution;
- stdout, stderr, exit code, spawn error, timeout, cancellation, cwd and duration are captured;
- public output and persisted result metadata are sanitized;
- secret-like environment keys are blocked from the env allowlist.

Current limits:

- it is not Codex-specific;
- it is not exposed as a direct arbitrary-process CLI command;
- it is not yet connected to Worktree Manager or Run Orchestrator;
- it does not replace the future Codex CLI adapter.

See `docs/runtime-adapters.md` for the versioned contract.

## Prompt transport

Avoid large prompt as command-line argument.

Prefer:

```txt
codex exec -
```

and send the task prompt via stdin.

Reason: positional prompts can break on Windows due to command-line length and quoting fragility.

## Runtime lifecycle

Expected lifecycle:

1. load issue;
2. load project manifest;
3. load agent profile;
4. estimate budget;
5. create branch/worktree;
6. build prompt/context bundle;
7. execute adapter;
8. capture logs;
9. collect diff;
10. run review/security gates;
11. write run report;
12. prepare PR or mark branch ready.

Run report output now follows Run Report v0. A final run report must write `run.json`, `prompt.md`, `stdout.log`, `stderr.log`, `diff.patch`, `summary.md` and `traceability.md` under `.badock/runs/<run-id>/`, with secrets masked and artifact paths constrained to that run directory.

## Agent profile concept

A profile should eventually include:

```json
{
  "id": "implementation-agent",
  "role": "implementation",
  "runtime": "codex-cli",
  "provider": "openai",
  "model": "configured-by-user",
  "permissionMode": "supervised",
  "scope": ["src/**", "tests/**", "docs/**"],
  "forbiddenPaths": [".env", "**/secrets/**"],
  "allowedCommands": ["pnpm test", "pnpm check", "pnpm build"]
}
```

## Provider Gateway

Provider Gateway should isolate provider credentials from agents.

Agents should not receive raw keys. They receive scoped runtime access through the gateway.

## Review agents

Review agents must inspect:

- acceptance criteria;
- diff coherence;
- test/validation results;
- architecture impact;
- security-sensitive changes;
- unnecessary scope expansion;
- docs/changelog requirements.

## Security agents

Security review is mandatory for:

- auth;
- secrets;
- provider gateway;
- command execution;
- path/file operations;
- GitHub write actions;
- CI/CD changes;
- permission engine.

## Cost model

Each runtime call should log:

- project id;
- issue id;
- run id;
- agent id;
- provider;
- model;
- token usage;
- cost;
- currency;
- measurement type: `exact` or `estimated`;
- measurement source;
- command/runtime exit status.

## Failure behavior

Failure must leave a useful state.

Examples:

- `planned` before execution is authorized;
- `running` while execution is active;
- `completed` when the run satisfies acceptance criteria;
- `failed` with logs and error;
- `paused_budget_limit` with partial report;
- `needs_user_decision` with exact blocking decision;
- `completed_with_warnings` when result is usable but imperfect.
