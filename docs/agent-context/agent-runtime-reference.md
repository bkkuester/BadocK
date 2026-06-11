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

- provider;
- model;
- agent id;
- issue id;
- run id;
- start/end time;
- token usage when available;
- estimated cost when exact cost is unavailable;
- command/runtime exit status.

## Failure behavior

Failure must leave a useful state.

Examples:

- `failed` with logs and error;
- `paused_budget_limit` with partial report;
- `needs_user_decision` with exact blocking decision;
- `completed_with_warnings` when result is usable but imperfect.
