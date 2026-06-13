import { spawn } from "node:child_process";
import { resolve } from "node:path";
import {
  evaluatePermission,
  type PermissionConfigInput,
  type PermissionDecisionRecord
} from "./permissions";
import { isSensitiveKey, sanitizeForPublicOutput, sanitizeSensitiveText } from "./security";

export const agentRuntimeStatuses = [
  "completed",
  "failed",
  "timed_out",
  "cancelled",
  "spawn_error",
  "needs_user_decision",
  "blocked"
] as const;

export type AgentRuntimeStatus = (typeof agentRuntimeStatuses)[number];

export type AgentRuntimeAdapter = {
  id: string;
  type: "local-process";
  run(request: LocalProcessRunRequest): Promise<AgentRuntimeResult>;
};

export type LocalProcessRunRequest = {
  program: string;
  args?: string[];
  cwd: string;
  stdin?: string;
  timeoutMs?: number;
  maxOutputCharacters?: number;
  env?: Record<string, string | number | boolean | undefined>;
  envAllowlist?: string[];
  abortSignal?: AbortSignal;
  permission: AgentRuntimePermissionContext;
};

export type AgentRuntimePermissionContext = {
  projectConfig?: PermissionConfigInput;
  runConfig?: PermissionConfigInput;
  currentBranch?: string | null;
  isTestCommand?: boolean;
};

export type AgentRuntimeCommand = {
  program: string;
  args: string[];
  cwd: string;
  command: string;
  stdin: "none" | "provided";
  envAllowlist: string[];
};

export type AgentRuntimeResult = {
  adapterId: string;
  status: AgentRuntimeStatus;
  didExecute: boolean;
  permission: PermissionDecisionRecord | null;
  command: AgentRuntimeCommand;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  exitCode: number | null;
  signal: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
};

type NormalizedLocalProcessRunRequest = Required<
  Pick<LocalProcessRunRequest, "program" | "args" | "cwd" | "timeoutMs" | "maxOutputCharacters" | "envAllowlist">
> &
  Pick<LocalProcessRunRequest, "stdin" | "abortSignal" | "permission" | "env">;

const localProcessAdapterId = "local-process";
const defaultTimeoutMs = 30_000;
const defaultMaxOutputCharacters = 64_000;
const minimumTimeoutMs = 1;
const maximumTimeoutMs = 10 * 60 * 1000;
const defaultEnvAllowlist = ["PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC"];

export function createLocalProcessAdapter(): AgentRuntimeAdapter {
  return {
    id: localProcessAdapterId,
    type: "local-process",
    run(request) {
      return runLocalProcess(request);
    }
  };
}

export async function runLocalProcess(request: LocalProcessRunRequest): Promise<AgentRuntimeResult> {
  const started = createTimestamp();
  const startedAtMs = Date.now();
  let normalized: NormalizedLocalProcessRunRequest;

  try {
    normalized = normalizeRequest(request);
  } catch (error) {
    const command = buildCommandForInvalidRequest(request);
    return buildResult({
      command,
      status: "blocked",
      didExecute: false,
      permission: null,
      started,
      startedAtMs,
      error: safeErrorMessage(error)
    });
  }

  const command = buildCommand(normalized);
  const envValidationError = validateEnvAllowlist(normalized.envAllowlist);
  if (envValidationError) {
    return buildResult({
      command,
      status: "blocked",
      didExecute: false,
      permission: null,
      started,
      startedAtMs,
      error: envValidationError
    });
  }

  const permission = evaluatePermission({
    action: "run_command",
    command: command.command,
    targetPath: normalized.cwd,
    projectConfig: normalized.permission.projectConfig,
    runConfig: normalized.permission.runConfig,
    currentBranch: normalized.permission.currentBranch,
    isTestCommand: normalized.permission.isTestCommand
  });

  if (permission.decision === "ask") {
    return buildResult({
      command,
      status: "needs_user_decision",
      didExecute: false,
      permission,
      started,
      startedAtMs,
      error: permission.reason
    });
  }

  if (permission.decision === "deny") {
    return buildResult({
      command,
      status: "blocked",
      didExecute: false,
      permission,
      started,
      startedAtMs,
      error: permission.reason
    });
  }

  return executeLocalProcess(normalized, command, permission, started, startedAtMs);
}

export function formatProcessCommand(program: string, args: string[] = []): string {
  return [program, ...args].map(quoteCommandPart).join(" ");
}

function executeLocalProcess(
  request: NormalizedLocalProcessRunRequest,
  command: AgentRuntimeCommand,
  permission: PermissionDecisionRecord,
  started: string,
  startedAtMs: number
): Promise<AgentRuntimeResult> {
  return new Promise((resolveResult) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let cancelled = false;

    const child = spawn(request.program, request.args, {
      cwd: request.cwd,
      env: buildChildEnv(request),
      shell: false,
      windowsHide: true
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, request.timeoutMs);

    const abortHandler = () => {
      cancelled = true;
      child.kill();
    };

    request.abortSignal?.addEventListener("abort", abortHandler, { once: true });

    child.stdout.on("data", (chunk: Buffer) => {
      const appended = appendOutput(stdout, chunk, request.maxOutputCharacters);
      stdout = appended.output;
      stdoutTruncated = stdoutTruncated || appended.truncated;
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const appended = appendOutput(stderr, chunk, request.maxOutputCharacters);
      stderr = appended.output;
      stderrTruncated = stderrTruncated || appended.truncated;
    });

    child.once("error", (error) => {
      finish({
        status: "spawn_error",
        didExecute: false,
        exitCode: null,
        signal: null,
        error: error.message
      });
    });

    child.once("close", (exitCode, signal) => {
      const status = timedOut
        ? "timed_out"
        : cancelled
          ? "cancelled"
          : exitCode === 0
            ? "completed"
            : "failed";

      finish({
        status,
        didExecute: true,
        exitCode,
        signal,
        error: status === "completed" ? null : status
      });
    });

    try {
      child.stdin.end(request.stdin ?? "");
    } catch (error) {
      finish({
        status: "failed",
        didExecute: true,
        exitCode: null,
        signal: null,
        error: safeErrorMessage(error)
      });
    }

    function finish(input: {
      status: AgentRuntimeStatus;
      didExecute: boolean;
      exitCode: number | null;
      signal: NodeJS.Signals | null;
      error: string | null;
    }): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      request.abortSignal?.removeEventListener("abort", abortHandler);
      resolveResult(
        buildResult({
          command,
          status: input.status,
          didExecute: input.didExecute,
          permission,
          started,
          startedAtMs,
          stdout,
          stderr,
          stdoutTruncated,
          stderrTruncated,
          exitCode: input.exitCode,
          signal: input.signal,
          error: input.error
        })
      );
    }
  });
}

function normalizeRequest(request: LocalProcessRunRequest): NormalizedLocalProcessRunRequest {
  const program = normalizeRequiredText(request.program, "program");
  const cwd = resolve(normalizeRequiredText(request.cwd, "cwd"));
  const args = (request.args ?? []).map((arg) => String(arg));
  const timeoutMs = normalizeNumber(request.timeoutMs ?? defaultTimeoutMs, "timeoutMs");
  const maxOutputCharacters = normalizeNumber(
    request.maxOutputCharacters ?? defaultMaxOutputCharacters,
    "maxOutputCharacters"
  );

  if (timeoutMs < minimumTimeoutMs || timeoutMs > maximumTimeoutMs) {
    throw new Error(`timeoutMs must be between ${minimumTimeoutMs} and ${maximumTimeoutMs}`);
  }

  if (maxOutputCharacters < 1) {
    throw new Error("maxOutputCharacters must be greater than zero");
  }

  return {
    program,
    args,
    cwd,
    stdin: request.stdin,
    timeoutMs,
    maxOutputCharacters,
    env: request.env,
    envAllowlist: normalizeEnvAllowlist(request.envAllowlist),
    abortSignal: request.abortSignal,
    permission: request.permission
  };
}

function buildCommand(request: NormalizedLocalProcessRunRequest): AgentRuntimeCommand {
  return {
    program: sanitizeSensitiveText(request.program),
    args: request.args.map(sanitizeSensitiveText),
    cwd: sanitizeSensitiveText(request.cwd),
    command: formatProcessCommand(request.program, request.args),
    stdin: request.stdin === undefined ? "none" : "provided",
    envAllowlist: request.envAllowlist
  };
}

function buildCommandForInvalidRequest(request: Partial<LocalProcessRunRequest>): AgentRuntimeCommand {
  const program = sanitizeSensitiveText(String(request.program ?? ""));
  const args = Array.isArray(request.args) ? request.args.map((arg) => sanitizeSensitiveText(String(arg))) : [];
  const cwd = sanitizeSensitiveText(String(request.cwd ?? ""));

  return {
    program,
    args,
    cwd,
    command: formatProcessCommand(program, args),
    stdin: request.stdin === undefined ? "none" : "provided",
    envAllowlist: normalizeEnvAllowlist(request.envAllowlist)
  };
}

function buildResult(input: {
  command: AgentRuntimeCommand;
  status: AgentRuntimeStatus;
  didExecute: boolean;
  permission: PermissionDecisionRecord | null;
  started: string;
  startedAtMs: number;
  stdout?: string;
  stderr?: string;
  stdoutTruncated?: boolean;
  stderrTruncated?: boolean;
  exitCode?: number | null;
  signal?: NodeJS.Signals | string | null;
  error?: string | null;
}): AgentRuntimeResult {
  const finishedAtMs = Date.now();
  const result = {
    adapterId: localProcessAdapterId,
    status: input.status,
    didExecute: input.didExecute,
    permission: input.permission,
    command: sanitizeForPublicOutput(input.command) as AgentRuntimeCommand,
    stdout: sanitizeSensitiveText(input.stdout ?? ""),
    stderr: sanitizeSensitiveText(input.stderr ?? ""),
    stdoutTruncated: input.stdoutTruncated ?? false,
    stderrTruncated: input.stderrTruncated ?? false,
    exitCode: input.exitCode ?? null,
    signal: input.signal ? String(input.signal) : null,
    error: input.error ? sanitizeSensitiveText(input.error) : null,
    startedAt: input.started,
    finishedAt: createTimestamp(),
    durationMs: Math.max(0, finishedAtMs - input.startedAtMs)
  };

  return sanitizeForPublicOutput(result) as AgentRuntimeResult;
}

function buildChildEnv(request: NormalizedLocalProcessRunRequest): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  const requestedEnv = request.env ?? {};

  for (const key of request.envAllowlist) {
    const requestedValue = requestedEnv[key];
    const value = requestedValue === undefined ? process.env[key] : String(requestedValue);
    if (value !== undefined) {
      env[key] = value;
    }
  }

  return env;
}

function normalizeEnvAllowlist(envAllowlist: string[] | undefined): string[] {
  return Array.from(
    new Set(
      [...defaultEnvAllowlist, ...(envAllowlist ?? [])]
        .map((key) => key.trim())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right, "en"));
}

function validateEnvAllowlist(envAllowlist: string[]): string | null {
  const sensitiveKey = envAllowlist.find((key) => isSensitiveKey(key));
  return sensitiveKey ? `Environment key is not allowed because it looks sensitive: ${sensitiveKey}` : null;
}

function appendOutput(
  current: string,
  chunk: Buffer,
  maxOutputCharacters: number
): { output: string; truncated: boolean } {
  if (current.length >= maxOutputCharacters) {
    return { output: current, truncated: true };
  }

  const next = `${current}${chunk.toString("utf8")}`;
  if (next.length <= maxOutputCharacters) {
    return { output: next, truncated: false };
  }

  return {
    output: `${next.slice(0, maxOutputCharacters)}\n[TRUNCATED]`,
    truncated: true
  };
}

function quoteCommandPart(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

function normalizeRequiredText(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function normalizeNumber(value: number, fieldName: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${fieldName} must be finite`);
  }
  return Math.trunc(value);
}

function safeErrorMessage(error: unknown): string {
  return sanitizeSensitiveText(error instanceof Error ? error.message : String(error));
}

function createTimestamp(): string {
  return new Date().toISOString();
}
