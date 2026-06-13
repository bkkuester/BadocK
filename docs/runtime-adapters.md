# BadocK Runtime Adapters

Runtime adapters are the boundary between a BadocK run and an external agent or local tool.

The MVP adapter contract is intentionally process-oriented and provider-neutral. It exists to support:

```txt
Issue -> plano -> agente -> worktree -> diff -> review -> custo -> PR
```

## Generic Local Process Adapter

The first runtime adapter is `local-process`.

It executes a configured local process only after the Permission Engine returns `allow` for the exact runtime command.

The command contract is structured:

```ts
{
  program: string;
  args: string[];
  cwd: string;
  stdin?: string;
  timeoutMs?: number;
  envAllowlist?: string[];
}
```

BadocK never executes a concatenated shell command string for this adapter. The implementation uses `spawn(program, args, { shell: false })`.

## Permission Gate

Before spawning a process, the adapter evaluates:

- action: `run_command`;
- formatted command: `program` plus `args`;
- target path: resolved `cwd`;
- project/run permission config;
- current branch when available.

Outcomes:

- `allow`: execute the process.
- `ask`: do not execute; return `needs_user_decision`.
- `deny`: do not execute; return `blocked`.

Execution on `main` remains blocked by default through the Permission Engine.

## Stdin Policy

Adapters should prefer stdin for prompts and large context bundles.

Reason:

- avoids Windows command-line length and quoting fragility;
- keeps prompts out of command allowlists;
- prepares the future Codex CLI adapter to use `codex exec -`.

Arguments are still supported for deterministic process flags, but large prompts must not be passed as positional arguments.

## Captured Result

The adapter returns a sanitized structured result:

- adapter id;
- status;
- permission decision;
- command metadata;
- cwd;
- stdout;
- stderr;
- exit code;
- signal;
- error summary;
- started/finished timestamps;
- duration;
- output truncation flags.

Statuses:

- `completed`;
- `failed`;
- `timed_out`;
- `cancelled`;
- `spawn_error`;
- `needs_user_decision`;
- `blocked`.

## Logs And Persistence

The storage layer can persist adapter evidence through `recordAgentRuntimeResult()`.

It writes a `run_log` entry with sanitized runtime result metadata. The raw process output is never stored without sanitization.

This is a temporary MVP persistence shape until the Run Orchestrator owns full runtime lifecycle and report generation.

## Environment Policy

The adapter passes only allowlisted environment keys.

Default allowlist is limited to operating-system process basics needed for local execution:

- `PATH`;
- `PATHEXT`;
- `SYSTEMROOT`;
- `WINDIR`;
- `COMSPEC`.

Secret-like environment keys such as `API_KEY`, `TOKEN`, `PASSWORD` or `SECRET` are blocked before spawn.

## Known Limitations

- No Codex-specific adapter yet. That belongs to issue #15.
- No Worktree Manager integration yet. That belongs to issue #16.
- No Run Orchestrator integration yet. That belongs to issue #17.
- No direct CLI command executes arbitrary local processes in this issue.
- Output truncation is character-based and intended as a safety guard, not a full log archival system.
