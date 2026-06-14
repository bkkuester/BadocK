import { randomBytes } from "node:crypto";
import { access, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { sanitizeForPublicOutput, sanitizeSensitiveText } from "./security";
import { git, gitChangedFiles, gitDiff, gitStatusShort } from "./worktree-manager";

export const finalRunReportStatuses = [
  "completed",
  "completed_with_warnings",
  "failed",
  "needs_user_decision"
] as const;

export type FinalRunReportStatus = (typeof finalRunReportStatuses)[number];

export const runStatuses = [
  "planned",
  "running",
  "completed",
  "completed_with_warnings",
  "paused_budget_limit",
  "failed",
  "needs_user_decision"
] as const;

export type RunStatus = (typeof runStatuses)[number];

export type RunIssueSource = "local" | "github" | "unknown";
export type RunAgentRuntime = "codex" | "shell" | "unknown";
export type RunSourceStatus = "available" | "unavailable";
export type RunTraceabilityStatus =
  | "completed"
  | "completed_with_warnings"
  | "partial"
  | "blocked"
  | "failed"
  | "needs_user_decision";
export type RunNextAction = "review_diff" | "fix_failure" | "approve_for_commit" | "discard_run" | "prepare_pr";

export type TargetIssueReport = {
  id: string;
  title: string | null;
  source: RunIssueSource | "inferred";
  declaredProblem: string;
  acceptanceCriteria: string[];
  previousImplementation: string | null;
  suspectedGap: string | null;
  files: string[];
  expectedValidations: string[];
};

export type SourceAvailability = {
  source: string;
  status: RunSourceStatus;
  notes: string;
};

export type TraceabilityMatrixRow = {
  issue: string;
  problem: string;
  acceptanceCriterion: string;
  stateBefore: "missing" | "partial" | "failing" | "unknown";
  changeMade: string;
  evidence: string;
  status: RunTraceabilityStatus;
  requirement?: string;
  implementationEvidence?: string;
  validationEvidence?: string;
};

export type RunReportCost = {
  estimated: boolean;
  currency: "USD" | string;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  amount: number | null;
  provider: string;
  model: string;
  notes: string;
  source: "not_available" | "estimated" | "reported_by_provider" | "manual";
  costUsd: number | null;
};

export type RunArtifactMap = {
  prompt: "prompt.md";
  stdout: "stdout.log";
  stderr: "stderr.log";
  diff: "diff.patch";
  summary: "summary.md";
  traceability: "traceability.md";
};

export type RunManifest = {
  schemaVersion: 1;
  id: string;
  runId: string;
  targetIssues: TargetIssueReport[];
  issue: {
    source: RunIssueSource;
    id: string;
    title: string | null;
    url?: string | null;
  };
  agent: {
    id: string;
    runtime: RunAgentRuntime;
    provider: string;
    model: string;
  };
  git: {
    baseBranch: string;
    branch: string;
    worktreePath: string;
    commitBefore: string | null;
    commitAfter: string | null;
  };
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number;
  filesChanged: string[];
  cost: RunReportCost;
  artifacts: RunArtifactMap;
  commands: string[];
  allowedFiles: string[];
  sourceAvailability: SourceAvailability[];
  traceability: TraceabilityMatrixRow[];
  nextAction: RunNextAction;
  unresolvedOrRiskyItems: string[];
  promptPath: string;
  stdoutLogPath: string;
  stderrLogPath: string;
  gitStatusPath: string;
  diffPath: string;
  summaryPath: string;
  traceabilityPath: string;
};

export type StartRunInput = {
  projectRoot: string;
  issueId: string;
  issueSource: RunIssueSource;
  issueTitle?: string | null;
  issueUrl?: string | null;
  targetIssues?: TargetIssueReport[];
  agent: string;
  agentRuntime?: RunAgentRuntime;
  branch: string;
  baseBranch?: string;
  worktreePath: string;
  prompt: string;
  allowedFiles?: string[];
  provider?: string | null;
  model?: string | null;
  cost?: Partial<RunReportCost>;
};

export type CompleteRunInput = {
  projectRoot: string;
  runId: string;
  status: FinalRunReportStatus;
  commands?: string[];
  stdout?: string;
  stderr?: string;
  summary?: string;
  sourceAvailability?: SourceAvailability[];
  targetIssues?: TargetIssueReport[];
  traceability?: TraceabilityMatrixRow[];
  validation?: {
    commandsExecuted: string[];
    results: string[];
  };
  nextAction?: RunNextAction;
  unresolvedOrRiskyItems?: string[];
};

export type RunReportValidation = {
  valid: boolean;
  runId: string | null;
  errors: string[];
  artifactsChecked: string[];
};

const runsDir = ".badock/runs";
const requiredRunArtifacts: RunArtifactMap = {
  prompt: "prompt.md",
  stdout: "stdout.log",
  stderr: "stderr.log",
  diff: "diff.patch",
  summary: "summary.md",
  traceability: "traceability.md"
};
const allowedRunArtifactNames = new Set([
  "run.json",
  "prompt.md",
  "stdout.log",
  "stderr.log",
  "diff.patch",
  "summary.md",
  "traceability.md",
  "git-status.txt",
  "review.json",
  "review.md"
]);

export async function startRun(input: StartRunInput): Promise<RunManifest> {
  const runId = createRunId();
  const root = resolve(input.projectRoot);
  const runDirectory = getRunDirectory(root, runId);
  await mkdir(runDirectory, { recursive: true });
  await assertSafeRunPath(root, runId);

  const provider = normalizeText(input.provider) ?? "unknown";
  const model = normalizeText(input.model) ?? "unknown";
  const issueTitle = normalizeNullableText(input.issueTitle);
  const commitBefore = await git(input.worktreePath, ["rev-parse", "HEAD"])
    .then((result) => normalizeNullableText(result.stdout))
    .catch(() => null);
  const targetIssues = normalizeTargetIssues(
    input.targetIssues,
    input.issueId,
    input.issueSource,
    issueTitle,
    input.allowedFiles ?? []
  );
  const now = new Date().toISOString();
  const manifest: RunManifest = {
    schemaVersion: 1,
    id: runId,
    runId,
    targetIssues,
    issue: {
      source: input.issueSource,
      id: normalizeText(input.issueId) ?? "unknown",
      title: issueTitle,
      url: input.issueUrl ?? null
    },
    agent: {
      id: normalizeText(input.agent) ?? "unknown",
      runtime: input.agentRuntime ?? runtimeFromProvider(provider),
      provider,
      model
    },
    git: {
      baseBranch: normalizeText(input.baseBranch) ?? "main",
      branch: normalizeText(input.branch) ?? "unknown",
      worktreePath: resolve(input.worktreePath),
      commitBefore,
      commitAfter: null
    },
    status: "running",
    startedAt: now,
    finishedAt: null,
    durationMs: 0,
    filesChanged: [],
    cost: normalizeCost(input.cost, provider, model),
    artifacts: requiredRunArtifacts,
    commands: [],
    allowedFiles: normalizeList(input.allowedFiles),
    sourceAvailability: defaultSourceAvailability(),
    traceability: defaultTraceability(targetIssues, "partial"),
    nextAction: "review_diff",
    unresolvedOrRiskyItems: [],
    promptPath: relativeRunPath(runId, "prompt.md"),
    stdoutLogPath: relativeRunPath(runId, "stdout.log"),
    stderrLogPath: relativeRunPath(runId, "stderr.log"),
    gitStatusPath: relativeRunPath(runId, "git-status.txt"),
    diffPath: relativeRunPath(runId, "diff.patch"),
    summaryPath: relativeRunPath(runId, "summary.md"),
    traceabilityPath: relativeRunPath(runId, "traceability.md")
  };

  await Promise.all([
    writeRunArtifact(root, runId, "prompt.md", input.prompt),
    writeRunArtifact(root, runId, "stdout.log", ""),
    writeRunArtifact(root, runId, "stderr.log", ""),
    writeRunArtifact(root, runId, "git-status.txt", ""),
    writeRunArtifact(root, runId, "diff.patch", ""),
    writeRunArtifact(root, runId, "summary.md", ""),
    writeRunArtifact(root, runId, "traceability.md", ""),
    writeRunManifest(root, manifest)
  ]);

  return manifest;
}

export async function completeRun(input: CompleteRunInput): Promise<RunManifest> {
  const root = resolve(input.projectRoot);
  const manifest = await readRunManifest(root, input.runId);
  const status = await gitStatusShort(manifest.git.worktreePath).catch((error) => `git status unavailable: ${String(error)}`);
  const diff = await gitDiff(manifest.git.worktreePath).catch((error) => `git diff unavailable: ${String(error)}`);
  const changedFiles = await gitChangedFiles(manifest.git.worktreePath).catch(() => []);
  const commitAfter = await git(manifest.git.worktreePath, ["rev-parse", "HEAD"])
    .then((result) => normalizeNullableText(result.stdout))
    .catch(() => null);
  const finishedAt = new Date().toISOString();
  const targetIssues = normalizeTargetIssues(
    input.targetIssues ?? manifest.targetIssues,
    manifest.issue.id,
    manifest.issue.source,
    manifest.issue.title,
    manifest.allowedFiles
  );
  const traceability = normalizeTraceability(
    input.traceability ?? defaultTraceability(targetIssues, statusToTraceability(input.status))
  );
  const completed: RunManifest = {
    ...manifest,
    targetIssues,
    status: input.status,
    finishedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(manifest.startedAt)),
    commands: normalizeList([...manifest.commands, ...(input.commands ?? [])]),
    filesChanged: changedFiles,
    cost: normalizeCost(manifest.cost, manifest.agent.provider, manifest.agent.model),
    git: {
      ...manifest.git,
      commitAfter
    },
    sourceAvailability: normalizeSourceAvailability(input.sourceAvailability ?? manifest.sourceAvailability),
    traceability,
    nextAction: input.nextAction ?? nextActionFromStatus(input.status),
    unresolvedOrRiskyItems: normalizeList(input.unresolvedOrRiskyItems)
  };

  await Promise.all([
    writeRunArtifact(root, completed.runId, "stdout.log", input.stdout ?? ""),
    writeRunArtifact(root, completed.runId, "stderr.log", input.stderr ?? ""),
    writeRunArtifact(root, completed.runId, "git-status.txt", status),
    writeRunArtifact(root, completed.runId, "diff.patch", diff),
    writeRunArtifact(root, completed.runId, "summary.md", buildRunSummary(completed, input)),
    writeRunArtifact(root, completed.runId, "traceability.md", buildTraceabilityMarkdown(completed)),
    writeRunManifest(root, completed)
  ]);

  return completed;
}

export async function readRunManifest(projectRoot: string, runId: string): Promise<RunManifest> {
  const root = resolve(projectRoot);
  const normalizedRunId = normalizeRunId(runId);
  const raw = await readFile(getRunArtifactPath(root, normalizedRunId, "run.json"), "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const errors = validateRunManifestShape(parsed, { requireFinalStatus: false, expectedRunId: normalizedRunId });
  if (errors.length > 0) {
    throw new Error(`Invalid run manifest ${normalizedRunId}: ${errors.join("; ")}`);
  }
  return parsed as RunManifest;
}

export async function validateRunReportArtifacts(projectRoot: string, runId: string): Promise<RunReportValidation> {
  const errors: string[] = [];
  const artifactsChecked: string[] = [];
  let normalizedRunId: string;
  let manifest: RunManifest | null = null;

  try {
    normalizedRunId = normalizeRunId(runId);
  } catch (error) {
    return {
      valid: false,
      runId: null,
      errors: [error instanceof Error ? error.message : String(error)],
      artifactsChecked
    };
  }

  const root = resolve(projectRoot);

  try {
    const raw = await readFile(getRunArtifactPath(root, normalizedRunId, "run.json"), "utf8");
    artifactsChecked.push("run.json");
    const parsed = JSON.parse(raw) as unknown;
    const manifestErrors = validateRunManifestShape(parsed, {
      requireFinalStatus: true,
      expectedRunId: normalizedRunId
    });
    if (manifestErrors.length > 0) {
      errors.push(...manifestErrors);
    } else {
      manifest = parsed as RunManifest;
    }
  } catch (error) {
    errors.push(`run.json is missing or unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }

  const artifactMap = manifest?.artifacts ?? requiredRunArtifacts;
  for (const [artifactKey, expectedName] of Object.entries(requiredRunArtifacts)) {
    const actualName = artifactMap[artifactKey as keyof RunArtifactMap];
    if (actualName !== expectedName) {
      errors.push(`artifact ${artifactKey} must be ${expectedName}`);
      continue;
    }
    try {
      const path = getRunArtifactPath(root, normalizedRunId, actualName);
      await access(path);
      artifactsChecked.push(actualName);
    } catch (error) {
      errors.push(`${actualName} is missing or unsafe: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    valid: errors.length === 0,
    runId: normalizedRunId,
    errors,
    artifactsChecked: Array.from(new Set(artifactsChecked)).sort(compareStable)
  };
}

export async function validateAllRunReports(projectRoot: string): Promise<RunReportValidation[]> {
  const root = resolve(projectRoot);
  const directory = join(root, runsDir);
  const entries = await readdir(directory).catch(() => []);
  const validations: RunReportValidation[] = [];

  for (const entry of entries.sort(compareStable)) {
    if (entry.startsWith("run-")) {
      validations.push(await validateRunReportArtifacts(root, entry));
    }
  }

  return validations;
}

export function getRunDirectory(projectRoot: string, runId: string): string {
  const root = resolve(projectRoot);
  const runsRoot = resolve(root, runsDir);
  const runDirectory = resolve(runsRoot, normalizeRunId(runId));
  assertPathInside(runDirectory, runsRoot, `Run directory escaped ${runsDir}`);
  return runDirectory;
}

export function getRunArtifactPath(projectRoot: string, runId: string, fileName: string): string {
  const runDirectory = getRunDirectory(projectRoot, runId);
  const artifactName = normalizeRunArtifactName(fileName);
  const target = resolve(runDirectory, artifactName);
  assertPathInside(target, runDirectory, "Run artifact path escaped its run directory");
  return target;
}

export function createRunId(): string {
  const timestamp = new Date().toISOString().replace(/[-:.]/g, "").replace("T", "-").replace("Z", "");
  return `run-${timestamp}-${randomBytes(3).toString("hex")}`;
}

export function normalizeRunId(runId: string): string {
  const normalized = runId.trim();
  if (!/^run-[A-Za-z0-9._-]+$/.test(normalized) || normalized.includes("..")) {
    throw new Error(`Invalid run id: ${runId}`);
  }
  return normalized;
}

async function writeRunManifest(projectRoot: string, manifest: RunManifest): Promise<void> {
  await writeRunArtifact(projectRoot, manifest.runId, "run.json", `${JSON.stringify(sanitizeForPublicOutput(manifest), null, 2)}\n`);
}

async function writeRunArtifact(projectRoot: string, runId: string, fileName: string, content: string): Promise<void> {
  const root = resolve(projectRoot);
  const normalizedRunId = normalizeRunId(runId);
  const runDirectory = getRunDirectory(root, normalizedRunId);
  await mkdir(runDirectory, { recursive: true });
  await assertSafeRunPath(root, normalizedRunId, fileName);
  const target = getRunArtifactPath(root, normalizedRunId, fileName);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, sanitizeSensitiveText(content), "utf8");
}

async function assertSafeRunPath(projectRoot: string, runId: string, fileName?: string): Promise<void> {
  const root = resolve(projectRoot);
  const segments = [join(root, ".badock"), join(root, ".badock", "runs"), getRunDirectory(root, runId)];
  if (fileName) {
    segments.push(getRunArtifactPath(root, runId, fileName));
  }

  for (const segment of segments) {
    const info = await lstat(segment).catch(() => null);
    if (info?.isSymbolicLink()) {
      throw new Error(`Refusing to use symlinked run path: ${segment}`);
    }
  }
}

function validateRunManifestShape(
  value: unknown,
  options: { requireFinalStatus: boolean; expectedRunId: string }
): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return ["run.json must contain an object"];
  }

  const manifest = value as Partial<RunManifest>;
  if (manifest.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1");
  }
  if (manifest.runId !== options.expectedRunId) {
    errors.push(`runId must match directory ${options.expectedRunId}`);
  }
  if (!Array.isArray(manifest.targetIssues)) {
    errors.push("targetIssues must be an array");
  }
  if (!manifest.issue || typeof manifest.issue !== "object") {
    errors.push("issue object is required");
  }
  if (!manifest.agent || typeof manifest.agent !== "object") {
    errors.push("agent object is required");
  }
  if (!manifest.git || typeof manifest.git !== "object") {
    errors.push("git object is required");
  }
  if (!manifest.artifacts || typeof manifest.artifacts !== "object") {
    errors.push("artifacts object is required");
  }
  if (!Array.isArray(manifest.filesChanged)) {
    errors.push("filesChanged must be an array");
  }
  if (!manifest.cost || typeof manifest.cost.estimated !== "boolean") {
    errors.push("cost.estimated must be present");
  } else {
    for (const field of ["inputTokens", "outputTokens", "reasoningTokens", "totalTokens", "amount"] as const) {
      const value = manifest.cost[field];
      if (value !== null && typeof value !== "number") {
        errors.push(`cost.${field} must be a number or null`);
      }
    }
  }
  if (!manifest.status || !runStatuses.includes(manifest.status)) {
    errors.push(`status is invalid: ${String(manifest.status)}`);
  }
  if (options.requireFinalStatus && (!manifest.status || !finalRunReportStatuses.includes(manifest.status as FinalRunReportStatus))) {
    errors.push(`status must be final: ${String(manifest.status)}`);
  }
  if (typeof manifest.startedAt !== "string") {
    errors.push("startedAt is required");
  }
  if (typeof manifest.durationMs !== "number") {
    errors.push("durationMs must be a number");
  }

  return errors;
}

function buildRunSummary(manifest: RunManifest, input: CompleteRunInput): string {
  const validation = input.validation ?? {
    commandsExecuted: manifest.commands,
    results: [`Run report artifacts written for ${manifest.runId}.`]
  };
  return [
    "# Run Summary",
    "",
    "## Status",
    "",
    manifest.status,
    "",
    "## Source availability",
    "",
    "| Source | Status | Notes |",
    "|---|---|---|",
    ...manifest.sourceAvailability.map((source) => `| ${source.source} | ${source.status} | ${source.notes} |`),
    "",
    "## Target issues",
    "",
    formatTargetIssues(manifest.targetIssues),
    "",
    "## Agent",
    "",
    `- ID: ${manifest.agent.id}`,
    `- Runtime: ${manifest.agent.runtime}`,
    `- Provider: ${manifest.agent.provider}`,
    `- Model: ${manifest.agent.model}`,
    "",
    "## Git",
    "",
    `- Base branch: ${manifest.git.baseBranch}`,
    `- Current branch: ${manifest.git.branch}`,
    `- Worktree: ${manifest.git.worktreePath}`,
    `- Commit before: ${manifest.git.commitBefore ?? "unknown"}`,
    `- Commit after: ${manifest.git.commitAfter ?? "unknown"}`,
    "",
    "## Changed files",
    "",
    formatList(manifest.filesChanged),
    "",
    "## Validation",
    "",
    "- Commands executed:",
    indentList(validation.commandsExecuted),
    "- Results:",
    indentList(validation.results),
    "",
    "## Cost",
    "",
    `- Estimated: ${manifest.cost.estimated}`,
    `- Provider: ${manifest.cost.provider}`,
    `- Model: ${manifest.cost.model}`,
    `- Input tokens: ${formatNullableNumber(manifest.cost.inputTokens)}`,
    `- Output tokens: ${formatNullableNumber(manifest.cost.outputTokens)}`,
    `- Reasoning tokens: ${formatNullableNumber(manifest.cost.reasoningTokens)}`,
    `- Total tokens: ${formatNullableNumber(manifest.cost.totalTokens)}`,
    `- Amount: ${formatNullableNumber(manifest.cost.amount)}`,
    `- Notes: ${manifest.cost.notes}`,
    "",
    "## Decision",
    "",
    `- ${manifest.status}`,
    "",
    "## Next action",
    "",
    `- ${manifest.nextAction}`,
    "",
    "## Notes",
    "",
    sanitizeSensitiveText(input.summary?.trim() || "Run evidence captured.")
  ].join("\n");
}

function buildTraceabilityMarkdown(manifest: RunManifest): string {
  return [
    "# Issue Traceability",
    "",
    "## Target issues",
    "",
    formatTargetIssues(manifest.targetIssues),
    "",
    "## Coverage matrix",
    "",
    "| Issue | Requirement | Implementation evidence | Validation evidence | Status |",
    "|---|---|---|---|---|",
    ...manifest.traceability.map(
      (row) =>
        `| ${row.issue} | ${row.requirement ?? row.acceptanceCriterion} | ${row.implementationEvidence ?? row.changeMade} | ${row.validationEvidence ?? row.evidence} | ${row.status} |`
    ),
    "",
    "## Issue Traceability Matrix",
    "",
    "| Issue | Problema | Criterio de aceite | Estado antes | Alteracao feita | Evidencia | Status |",
    "|---|---|---|---|---|---|---|",
    ...manifest.traceability.map(
      (row) =>
        `| ${row.issue} | ${row.problem} | ${row.acceptanceCriterion} | ${row.stateBefore} | ${row.changeMade} | ${row.evidence} | ${row.status} |`
    ),
    "",
    "## Unresolved or risky items",
    "",
    formatList(manifest.unresolvedOrRiskyItems),
    "",
    "## Final decision",
    "",
    manifest.status,
    ""
  ].join("\n");
}

function relativeRunPath(runId: string, fileName: string): string {
  return `${runsDir}/${normalizeRunId(runId)}/${normalizeRunArtifactName(fileName)}`;
}

function normalizeRunArtifactName(fileName: string): string {
  const normalized = fileName.trim().replace(/\\/g, "/");
  if (
    !normalized ||
    normalized.includes("/") ||
    normalized.includes("..") ||
    isAbsolute(normalized) ||
    !allowedRunArtifactNames.has(normalized)
  ) {
    throw new Error(`Invalid run artifact name: ${fileName}`);
  }
  return normalized;
}

function assertPathInside(path: string, parent: string, message: string): void {
  const normalizedPath = resolve(path);
  const normalizedParent = resolve(parent);
  const pathLower = normalizedPath.toLowerCase();
  const parentLower = normalizedParent.toLowerCase();
  if (pathLower !== parentLower && !pathLower.startsWith(`${parentLower}${sep}`)) {
    throw new Error(message);
  }
}

function normalizeCost(input: Partial<RunReportCost> | undefined, provider: string, model: string): RunReportCost {
  const inputTokens = numberOrNull(input?.inputTokens);
  const outputTokens = numberOrNull(input?.outputTokens);
  const reasoningTokens = numberOrNull(input?.reasoningTokens);
  const totalTokens = numberOrNull(input?.totalTokens) ?? sumNullable(inputTokens, outputTokens, reasoningTokens);
  const amount = numberOrNull(input?.amount) ?? numberOrNull(input?.costUsd);
  return {
    estimated: input?.estimated ?? true,
    currency: input?.currency ?? "USD",
    inputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
    amount,
    provider: normalizeText(input?.provider) ?? provider,
    model: normalizeText(input?.model) ?? model,
    notes: normalizeText(input?.notes) ?? "Cost is estimated or unavailable for this runtime.",
    source: input?.source ?? "not_available",
    costUsd: numberOrNull(input?.costUsd) ?? amount
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sumNullable(...values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => typeof value === "number");
  return present.length > 0 ? present.reduce((total, value) => total + value, 0) : null;
}

function normalizeTargetIssues(
  targetIssues: TargetIssueReport[] | undefined,
  issueId: string,
  issueSource: RunIssueSource,
  issueTitle: string | null,
  files: string[]
): TargetIssueReport[] {
  const normalized = (targetIssues ?? []).map((issue) => ({
    id: normalizeText(issue.id) ?? issueId,
    title: normalizeNullableText(issue.title),
    source: issue.source,
    declaredProblem: normalizeText(issue.declaredProblem) ?? "Not provided.",
    acceptanceCriteria: normalizeList(issue.acceptanceCriteria),
    previousImplementation: normalizeNullableText(issue.previousImplementation),
    suspectedGap: normalizeNullableText(issue.suspectedGap),
    files: normalizeList(issue.files),
    expectedValidations: normalizeList(issue.expectedValidations)
  }));

  if (normalized.length > 0) {
    return normalized;
  }

  return [
    {
      id: normalizeText(issueId) ?? "unknown",
      title: issueTitle,
      source: issueSource,
      declaredProblem: "Run report was requested without a separately persisted issue body.",
      acceptanceCriteria: ["Required run artifacts are generated and validated."],
      previousImplementation: null,
      suspectedGap: null,
      files: normalizeList(files),
      expectedValidations: ["Run report smoke and validation checks pass."]
    }
  ];
}

function normalizeSourceAvailability(input: SourceAvailability[]): SourceAvailability[] {
  return input.map((source) => ({
    source: normalizeText(source.source) ?? "Unknown source",
    status: source.status === "available" ? "available" : "unavailable",
    notes: normalizeText(source.notes) ?? ""
  }));
}

function normalizeTraceability(input: TraceabilityMatrixRow[]): TraceabilityMatrixRow[] {
  return input.map((row) => ({
    issue: normalizeText(row.issue) ?? "unknown",
    problem: normalizeText(row.problem) ?? "Not provided.",
    acceptanceCriterion: normalizeText(row.acceptanceCriterion) ?? "Not provided.",
    stateBefore: row.stateBefore ?? "unknown",
    changeMade: normalizeText(row.changeMade) ?? "Not provided.",
    evidence: normalizeText(row.evidence) ?? "Not provided.",
    status: row.status,
    requirement: normalizeNullableText(row.requirement) ?? undefined,
    implementationEvidence: normalizeNullableText(row.implementationEvidence) ?? undefined,
    validationEvidence: normalizeNullableText(row.validationEvidence) ?? undefined
  }));
}

function defaultTraceability(targetIssues: TargetIssueReport[], status: RunTraceabilityStatus): TraceabilityMatrixRow[] {
  return targetIssues.map((issue) => ({
    issue: issue.id,
    problem: issue.declaredProblem,
    acceptanceCriterion: issue.acceptanceCriteria.join("; ") || "Required run report artifacts exist.",
    stateBefore: "partial",
    changeMade: "Run Report v0 artifacts were generated.",
    evidence: "run.json, summary.md, traceability.md and validation command output.",
    status,
    requirement: issue.acceptanceCriteria.join("; ") || "Required run report artifacts exist.",
    implementationEvidence: ".badock/runs/<runId>/run.json and companion artifacts",
    validationEvidence: "runs:validate"
  }));
}

function defaultSourceAvailability(): SourceAvailability[] {
  return [
    { source: "Repository", status: "available", notes: "Project root was available to the run report writer." },
    { source: "Local docs", status: "unavailable", notes: "Source audit was not supplied to this run report." },
    { source: "GitHub issues", status: "unavailable", notes: "GitHub issue context was not supplied to this run report." },
    { source: "GitHub PRs", status: "unavailable", notes: "GitHub PR context was not supplied to this run report." },
    { source: "Previous runs", status: "unavailable", notes: "No previous run context was supplied to this run report." }
  ];
}

function runtimeFromProvider(provider: string): RunAgentRuntime {
  if (provider === "codex-cli") {
    return "codex";
  }
  if (provider === "local-process") {
    return "shell";
  }
  return "unknown";
}

function nextActionFromStatus(status: FinalRunReportStatus): RunNextAction {
  if (status === "failed") {
    return "fix_failure";
  }
  if (status === "needs_user_decision") {
    return "review_diff";
  }
  return "review_diff";
}

function statusToTraceability(status: FinalRunReportStatus): RunTraceabilityStatus {
  if (status === "completed") {
    return "completed";
  }
  if (status === "completed_with_warnings") {
    return "completed_with_warnings";
  }
  if (status === "needs_user_decision") {
    return "needs_user_decision";
  }
  return "failed";
}

function formatTargetIssues(targetIssues: TargetIssueReport[]): string {
  return targetIssues.length > 0
    ? targetIssues.map((issue) => `- ${issue.source}:${issue.id}${issue.title ? ` - ${issue.title}` : ""}`).join("\n")
    : "- No target remediation issues were available in the execution context.";
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- none";
}

function indentList(values: string[]): string {
  return values.length > 0 ? values.map((value) => `  - ${value}`).join("\n") : "  - none";
}

function normalizeList(value: string[] | undefined): string[] {
  return Array.from(new Set((value ?? []).map((item) => sanitizeSensitiveText(item).trim()).filter(Boolean))).sort(compareStable);
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = sanitizeSensitiveText(value ?? "").trim();
  return normalized ? normalized : null;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  return normalizeText(value);
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "null" : String(value);
}

function compareStable(left: string, right: string): number {
  return left.localeCompare(right, "en");
}
