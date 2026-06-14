import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  formatManifestError,
  getManifestAgentProfiles,
  getManifestAllowedCommands,
  getManifestPermissionMode,
  loadProjectManifest,
  type ProjectManifest
} from "@badock/config";
import {
  buildWorktreeMetadata,
  completeRun,
  createLocalIssueFile,
  createStackProfile,
  detectGitHubCli,
  ensureIssueWorktree,
  formatLocalIssueMarkdown,
  formatProcessCommand,
  getCurrentGitBranch,
  getGitDefaultBranch,
  git,
  gitChangedFiles,
  gitDiff,
  gitStatusShort,
  listGitHubIssues,
  listLocalIssueFiles,
  openGitHubPullRequest,
  publishLocalIssueToGitHub,
  readLocalIssueFile,
  readRunManifest,
  reviewRunDiff,
  runLocalProcess,
  sanitizeSensitiveText,
  scanProject,
  startRun,
  validateIssueShape,
  validateLocalIssueFile
} from "@badock/core";

const execFileAsync = promisify(execFile);

export type WorkflowCommandResult = {
  exitCode: number;
  output?: string;
  error?: string;
};

type DoctorCheck = {
  status: "OK" | "WARN" | "FAIL";
  name: string;
  message: string;
};

export async function runWorkflowCli(argv: string[]): Promise<WorkflowCommandResult | null> {
  const [command, subcommand] = argv;

  if (command === "doctor") {
    return runDoctor(resolveCliPath(argv[1] ?? "."));
  }

  if (command === "project" && subcommand === "scan-report") {
    return runScanReport(resolveCliPath(argv[2] ?? "."), readFlag(argv, "--out"));
  }

  if (command === "issue-file") {
    return runIssueFileCommand(subcommand, argv.slice(2));
  }

  if (command === "agents") {
    return runAgentsCommand(subcommand, argv.slice(2));
  }

  if (command === "review-run") {
    const projectRoot = resolveCliPath(argv[1] ?? ".");
    const runId = argv[2];
    if (!runId) {
      return { exitCode: 1, error: "Usage: badock review-run <project-path> <run-id>" };
    }
    return runReviewRun(projectRoot, runId);
  }

  if (command === "commit-run") {
    const projectRoot = resolveCliPath(argv[1] ?? ".");
    const runId = argv[2];
    if (!runId) {
      return { exitCode: 1, error: "Usage: badock commit-run <project-path> <run-id>" };
    }
    return runCommitRun(projectRoot, runId);
  }

  if (command === "push-run") {
    const projectRoot = resolveCliPath(argv[1] ?? ".");
    const runId = argv[2];
    if (!runId) {
      return { exitCode: 1, error: "Usage: badock push-run <project-path> <run-id>" };
    }
    return runPushRun(projectRoot, runId);
  }

  if (command === "github" && subcommand === "issues") {
    const projectRoot = resolveCliPath(argv[2] ?? ".");
    return runGithubIssues(projectRoot);
  }

  if (command === "github" && subcommand === "publish-issue") {
    const projectRoot = resolveCliPath(argv[2] ?? ".");
    const issueId = argv[3];
    if (!issueId) {
      return { exitCode: 1, error: "Usage: badock github publish-issue <project-path> <local-issue-id>" };
    }
    return runGithubPublishIssue(projectRoot, issueId);
  }

  return null;
}

async function runScanReport(projectRoot: string, explicitOut: string | null): Promise<WorkflowCommandResult> {
  try {
    const scan = await scanProject(projectRoot);
    const profile = createStackProfile(scan);
    const manifest = await loadOptionalManifest(projectRoot);
    const report = {
      scannedAt: new Date().toISOString(),
      root: scan.rootPath,
      git: {
        isRepo: scan.git.hasGit,
        currentBranch: scan.git.branch,
        defaultBranch: await getGitDefaultBranch(projectRoot).catch(() => null),
        origin: scan.git.remoteUrl
      },
      package: {
        manager: profile.packageManager,
        node: process.versions.node,
        scripts: scan.packageScripts
      },
      stack: {
        languages: profile.language === "unknown" ? [] : [profile.language],
        frameworks: [],
        tools: scan.devDependencies
      },
      badock: {
        manifestFound: await fileExists(join(projectRoot, ".badock", "project.json")),
        agentsConfigFound:
          (await fileExists(join(projectRoot, ".agents", "agents.yml"))) ||
          (manifest ? getManifestAgentProfiles(manifest).length > 0 : false)
      },
      warnings: scan.warnings
    };
    const outPath = explicitOut ? resolveCliPath(explicitOut) : join(projectRoot, ".badock", "reports", "project-scan.json");
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return { exitCode: 0, output: jsonOutput(report) };
  } catch (error) {
    return { exitCode: 1, error: safeErrorMessage(error) };
  }
}

async function runIssueFileCommand(
  subcommand: string | undefined,
  args: string[]
): Promise<WorkflowCommandResult> {
  const projectRoot = resolveCliPath(args[0] ?? ".");
  try {
    if (subcommand === "new") {
      const issue = await createLocalIssueFile(projectRoot, {
        title: readFlag(args, "--title") ?? undefined,
        objective: readFlag(args, "--objective") ?? undefined,
        scope: readRepeatedFlag(args, "--scope"),
        suggestedAgents: readRepeatedFlag(args, "--agent"),
        acceptanceCriteria: readRepeatedFlag(args, "--acceptance"),
        technicalNotes: readFlag(args, "--notes") ?? undefined,
        files: readRepeatedFlag(args, "--file")
      });
      return { exitCode: 0, output: jsonOutput(issue) };
    }

    if (subcommand === "list") {
      return { exitCode: 0, output: jsonOutput(await listLocalIssueFiles(projectRoot)) };
    }

    if (subcommand === "show") {
      const issueId = args[1];
      if (!issueId) {
        return { exitCode: 1, error: "Usage: badock issue-file show <project-path> <local-issue-id>" };
      }
      return { exitCode: 0, output: jsonOutput(await readLocalIssueFile(projectRoot, issueId)) };
    }

    if (subcommand === "validate") {
      const issueId = args[1];
      if (!issueId) {
        return { exitCode: 1, error: "Usage: badock issue-file validate <project-path> <local-issue-id>" };
      }
      const validation = await validateLocalIssueFile(projectRoot, issueId);
      return {
        exitCode: validation.valid ? 0 : 1,
        output: validation.valid ? jsonOutput(validation) : undefined,
        error: validation.valid ? undefined : validation.errors.join("\n")
      };
    }

    return { exitCode: 1, error: "Usage: badock issue-file <new|list|show|validate> <project-path> ..." };
  } catch (error) {
    return { exitCode: 1, error: safeErrorMessage(error) };
  }
}

async function runAgentsCommand(
  subcommand: string | undefined,
  args: string[]
): Promise<WorkflowCommandResult> {
  const projectRoot = resolveCliPath(args[0] ?? ".");

  if (subcommand === "issue") {
    const issueId = args[1];
    if (!issueId) {
      return { exitCode: 1, error: "Usage: badock agents issue <project-path> <local-issue-id>" };
    }
    return runPlanLocalIssue(projectRoot, issueId);
  }

  if (subcommand === "run") {
    const agentName = args[1];
    const issueId = args[2];
    if (!agentName || !issueId) {
      return { exitCode: 1, error: "Usage: badock agents run <project-path> <agent> <local-issue-id> [--execute]" };
    }
    return runAgent(projectRoot, agentName, issueId, args.includes("--execute"));
  }

  if (subcommand === "pr") {
    const agentName = args[1];
    const issueId = args[2];
    if (!agentName || !issueId) {
      return { exitCode: 1, error: "Usage: badock agents pr <project-path> <agent> <local-issue-id> [--run <run-id>]" };
    }
    return runOpenPr(projectRoot, agentName, issueId, readFlag(args, "--run"));
  }

  return { exitCode: 1, error: "Usage: badock agents <issue|run|pr> <project-path> ..." };
}

async function runPlanLocalIssue(projectRoot: string, issueId: string): Promise<WorkflowCommandResult> {
  try {
    const issue = await readLocalIssueFile(projectRoot, issueId);
    const validationErrors = validateIssueShape(issue);
    if (validationErrors.length > 0) {
      return { exitCode: 1, error: validationErrors.join("\n") };
    }

    const manifest = await loadOptionalManifest(projectRoot);
    const agents = manifest ? getManifestAgentProfiles(manifest) : [];
    const selected = issue.suggestedAgents.find((agent) => agents.some((candidate) => candidate.id === agent)) ?? null;
    const plan = {
      issueId,
      title: issue.title,
      selectedAgent: selected,
      selectionReason: selected ? "explicit issue suggested agent" : "no explicit matching agent found",
      acceptanceCriteria: issue.acceptanceCriteria,
      scope: issue.scope,
      files: issue.files,
      executionAuthorized: false,
      requiresManualReview: true
    };
    const reportPath = join(projectRoot, ".badock", "reports", `issue-${issueId}-plan.json`);
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    return { exitCode: 0, output: jsonOutput(plan) };
  } catch (error) {
    return { exitCode: 1, error: safeErrorMessage(error) };
  }
}

async function runAgent(
  projectRoot: string,
  agentName: string,
  issueId: string,
  execute: boolean
): Promise<WorkflowCommandResult> {
  try {
    const manifest = await loadOptionalManifest(projectRoot);
    const issue = await readLocalIssueFile(projectRoot, issueId);
    const validationErrors = validateIssueShape(issue);
    if (validationErrors.length > 0) {
      return { exitCode: 1, error: validationErrors.join("\n") };
    }

    const agent = findManifestAgent(manifest, agentName);
    const worktree = await ensureIssueWorktree({
      repoRoot: projectRoot,
      issueId,
      agentName,
      baseBranch: manifest?.vcs.defaultBranch ?? "main",
      worktreeBaseDir: manifest?.vcs.worktreeBaseDir ?? "../worktrees",
      allowMainExecution: manifest?.vcs.allowMainExecution ?? false
    });
    const prompt = buildAgentPrompt(issueId, issue, agentName);
    const issueFiles = issue.files ?? [];
    const run = await startRun({
      projectRoot,
      issueId,
      issueSource: "local",
      issueTitle: issue.title,
      targetIssues: [
        {
          id: issueId,
          title: issue.title,
          source: "local",
          declaredProblem: issue.objective,
          acceptanceCriteria: issue.acceptanceCriteria,
          previousImplementation: null,
          suspectedGap: null,
          files: issueFiles,
          expectedValidations: ["badock review-run", "project validation commands selected by the issue"]
        }
      ],
      agent: agentName,
      agentRuntime: "codex",
      baseBranch: worktree.baseBranch,
      branch: worktree.branch,
      worktreePath: worktree.worktreePath,
      prompt,
      allowedFiles: issueFiles,
      provider: agent?.provider ?? "codex-cli",
      model: agent?.model ?? "unknown"
    });

    if (!execute) {
      const completed = await completeRun({
        projectRoot,
        runId: run.id,
        status: "needs_user_decision",
        commands: ["codex exec - (not executed; rerun with --execute after approval)"],
        stdout: "Agent runtime was prepared but not executed because --execute was not provided.",
        summary: "Run prepared. External agent execution requires explicit --execute.",
        validation: {
          commandsExecuted: ["badock agents run"],
          results: ["Run report artifacts were generated; agent execution was intentionally not started."]
        },
        unresolvedOrRiskyItems: ["External agent execution still requires explicit --execute approval."]
      });
      return { exitCode: 0, output: jsonOutput(completed) };
    }

    const codexArgs = ["exec", "-"];
    const command = formatProcessCommand("codex", codexArgs);
    const result = await runLocalProcess({
      program: "codex",
      args: codexArgs,
      cwd: worktree.worktreePath,
      stdin: prompt,
      permission: {
        projectConfig: {
          mode: "supervised",
          allowCommands: [command, ...manifestAllowedCommands(manifest)]
        },
        currentBranch: worktree.branch
      }
    });
    const completed = await completeRun({
      projectRoot,
      runId: run.id,
      status: result.status === "completed" ? "completed" : result.status === "needs_user_decision" ? "needs_user_decision" : "failed",
      commands: [command],
      stdout: result.stdout,
      stderr: result.stderr || result.error || "",
      summary: `Codex CLI adapter finished with status ${result.status}.`,
      validation: {
        commandsExecuted: [command],
        results: [`Codex CLI adapter finished with status ${result.status}.`]
      }
    });
    return { exitCode: result.status === "completed" ? 0 : 1, output: jsonOutput(completed) };
  } catch (error) {
    return { exitCode: 1, error: safeErrorMessage(error) };
  }
}

async function runReviewRun(projectRoot: string, runId: string): Promise<WorkflowCommandResult> {
  try {
    const review = await reviewRunDiff({ projectRoot, runId });
    return { exitCode: review.status === "blocked" ? 1 : 0, output: jsonOutput(review) };
  } catch (error) {
    return { exitCode: 1, error: safeErrorMessage(error) };
  }
}

async function runCommitRun(projectRoot: string, runId: string): Promise<WorkflowCommandResult> {
  try {
    const manifest = await readRunManifest(projectRoot, runId);
    const branch = await getCurrentGitBranch(manifest.git.worktreePath);
    if (branch === "main" || branch === "master") {
      return { exitCode: 1, error: "Refusing to commit on main/master" };
    }
    const changedFiles = await gitChangedFiles(manifest.git.worktreePath);
    if (changedFiles.length === 0) {
      return { exitCode: 1, error: "No changes to commit" };
    }
    const blocked = changedFiles.filter((file) => isForbiddenCommitPath(file));
    if (blocked.length > 0) {
      return { exitCode: 1, error: `Refusing to commit forbidden files:\n${blocked.join("\n")}` };
    }
    await git(manifest.git.worktreePath, ["add", "--all"]);
    const message = `BadocK run ${manifest.id}: ${manifest.issue.id} via ${manifest.agent.id}`;
    await git(manifest.git.worktreePath, ["commit", "-m", message]);
    return {
      exitCode: 0,
      output: jsonOutput({
        runId,
        branch,
        committedFiles: changedFiles,
        message
      })
    };
  } catch (error) {
    return { exitCode: 1, error: safeErrorMessage(error) };
  }
}

async function runPushRun(projectRoot: string, runId: string): Promise<WorkflowCommandResult> {
  try {
    const manifest = await readRunManifest(projectRoot, runId);
    const branch = await getCurrentGitBranch(manifest.git.worktreePath);
    if (!branch || branch === "main" || branch === "master") {
      return { exitCode: 1, error: "Refusing to push main/master or detached HEAD" };
    }
    await git(manifest.git.worktreePath, ["push", "-u", "origin", branch]);
    return { exitCode: 0, output: jsonOutput({ runId, branch, pushed: true }) };
  } catch (error) {
    return { exitCode: 1, error: safeErrorMessage(error) };
  }
}

async function runOpenPr(
  projectRoot: string,
  agentName: string,
  issueId: string,
  explicitRunId: string | null
): Promise<WorkflowCommandResult> {
  try {
    const runId = explicitRunId ?? (await findLatestRunId(projectRoot, issueId, agentName));
    if (!runId) {
      return { exitCode: 1, error: `No run found for ${issueId}/${agentName}. Pass --run <run-id>.` };
    }
    const run = await readRunManifest(projectRoot, runId);
    const manifest = await loadOptionalManifest(projectRoot);
    const prUrl = await openGitHubPullRequest({
      repoRoot: run.git.worktreePath,
      baseBranch: manifest?.vcs.defaultBranch ?? "main",
      title: `BadocK ${run.issue.id}: ${run.agent.id}`,
      body: `Run: ${run.id}\nIssue: ${run.issue.source}:${run.issue.id}\nStatus: ${run.status}\nSummary: ${run.summaryPath}`
    });
    return { exitCode: 0, output: jsonOutput({ runId, prUrl }) };
  } catch (error) {
    return { exitCode: 1, error: safeErrorMessage(error) };
  }
}

async function runGithubIssues(projectRoot: string): Promise<WorkflowCommandResult> {
  try {
    const availability = await detectGitHubCli();
    if (!availability.authenticated) {
      return { exitCode: 0, output: jsonOutput(availability) };
    }
    return { exitCode: 0, output: await listGitHubIssues(projectRoot) };
  } catch (error) {
    return { exitCode: 1, error: safeErrorMessage(error) };
  }
}

async function runGithubPublishIssue(projectRoot: string, issueId: string): Promise<WorkflowCommandResult> {
  try {
    const issue = await readLocalIssueFile(projectRoot, issueId);
    const url = await publishLocalIssueToGitHub({
      repoRoot: projectRoot,
      title: issue.title,
      body: formatLocalIssueMarkdown(issue)
    });
    return { exitCode: 0, output: jsonOutput({ issueId, url }) };
  } catch (error) {
    return { exitCode: 1, error: safeErrorMessage(error) };
  }
}

async function runDoctor(projectRoot: string): Promise<WorkflowCommandResult> {
  const checks: DoctorCheck[] = [];
  checks.push(ok("node", `Node ${process.versions.node}`));
  checks.push(await commandCheck("corepack", [["corepack", ["--version"]], ["corepack.cmd", ["--version"]]]));
  checks.push(
    await commandCheck("pnpm", [
      ["pnpm", ["--version"]],
      ["pnpm.cmd", ["--version"]],
      ["corepack", ["pnpm", "--version"]],
      ["corepack.cmd", ["pnpm", "--version"]]
    ])
  );
  checks.push(await commandCheck("git", [["git", ["--version"]]]));

  const manifest = await loadOptionalManifest(projectRoot);
  if (manifest) {
    checks.push(ok("manifest", ".badock/project.json is valid"));
  } else {
    checks.push(fail("manifest", ".badock/project.json is missing or invalid"));
  }

  const packageJson = await readJson(join(projectRoot, "package.json"));
  const scripts = readStringRecord((packageJson as { scripts?: unknown } | null)?.scripts);
  for (const script of ["agents:doctor", "agents:run", "badock:review-run", "badock:commit-run", "badock:push-run", "agents:pr"]) {
    checks.push(scripts[script] ? ok(`script:${script}`, "present") : fail(`script:${script}`, "missing"));
  }

  const gitignore = await readFile(join(projectRoot, ".gitignore"), "utf8").catch(() => "");
  checks.push(
    gitignore.includes(".badock/runs/") && gitignore.includes(".agents/runs/")
      ? ok("gitignore", "run artifacts are ignored")
      : fail("gitignore", "run artifacts must be ignored")
  );

  const branch = await getCurrentGitBranch(projectRoot).catch(() => null);
  checks.push(branch ? ok("branch", branch) : warn("branch", "not a Git repository or detached HEAD"));
  if (branch === "main" || branch === "master") {
    checks.push(warn("main-execution", "current branch is main/master; run execution will be blocked by default"));
  }

  const gh = await detectGitHubCli();
  checks.push(gh.authenticated ? ok("gh", "authenticated") : warn("gh", gh.warning ?? "GitHub sync unavailable"));

  const agents = manifest ? getManifestAgentProfiles(manifest) : [];
  checks.push(agents.length > 0 ? ok("agents", `${agents.length} manifest agents`) : warn("agents", "no manifest agents configured"));

  const report = {
    checkedAt: new Date().toISOString(),
    checks
  };
  await mkdir(join(projectRoot, ".badock", "reports"), { recursive: true });
  await writeFile(join(projectRoot, ".badock", "reports", "doctor.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const output = checks.map((check) => `[${check.status}] ${check.name} ${check.message}`).join("\n");
  return { exitCode: checks.some((check) => check.status === "FAIL") ? 1 : 0, output };
}

async function loadOptionalManifest(projectRoot: string): Promise<ProjectManifest | null> {
  try {
    return await loadProjectManifest(join(projectRoot, ".badock", "project.json"));
  } catch {
    return null;
  }
}

function findManifestAgent(manifest: ProjectManifest | null, agentName: string) {
  if (!manifest) {
    return null;
  }
  return getManifestAgentProfiles(manifest).find((agent) => agent.id === agentName) ?? null;
}

function manifestAllowedCommands(manifest: ProjectManifest | null): string[] {
  return manifest ? getManifestAllowedCommands(manifest) : [];
}

function buildAgentPrompt(issueId: string, issue: Awaited<ReturnType<typeof readLocalIssueFile>>, agentName: string): string {
  return [
    "# BadocK Agent Run",
    "",
    `Issue: ${issueId}`,
    `Agent: ${agentName}`,
    "",
    "Follow the BadocK core flow: Issue -> plano -> agente -> worktree -> diff -> review -> custo -> PR.",
    "Do not commit, push or open PR from this run.",
    "",
    formatLocalIssueMarkdown(issue)
  ].join("\n");
}

async function findLatestRunId(projectRoot: string, issueId: string, agentName: string): Promise<string | null> {
  const directory = join(projectRoot, ".badock", "runs");
  const entries = await readdir(directory).catch(() => []);
  const matches: Array<{ id: string; startedAt: string }> = [];
  for (const entry of entries) {
    if (!entry.startsWith("run-")) {
      continue;
    }
    const manifest = await readRunManifest(projectRoot, entry).catch(() => null);
    if (manifest?.issue.id === issueId && manifest.agent.id === agentName) {
      matches.push({ id: manifest.id, startedAt: manifest.startedAt });
    }
  }
  matches.sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  return matches[0]?.id ?? null;
}

function isForbiddenCommitPath(file: string): boolean {
  const normalized = file.replace(/\\/g, "/").toLowerCase();
  return (
    normalized.startsWith(".badock/runs/") ||
    normalized.startsWith(".agents/runs/") ||
    normalized === ".env" ||
    normalized.startsWith(".env.") ||
    normalized.includes("/.env.")
  );
}

async function commandCheck(name: string, candidates: Array<[program: string, args: string[]]>): Promise<DoctorCheck> {
  for (const [program, args] of candidates) {
    try {
      const result = await execFileAsync(program, args, { windowsHide: true });
      return ok(name, result.stdout.toString().split(/\r?\n/)[0]?.trim() || "found");
    } catch {
      continue;
    }
  }
  if ((name === "corepack" || name === "pnpm") && process.env.npm_lifecycle_event) {
    return ok(name, `available through pnpm lifecycle ${process.env.npm_lifecycle_event}`);
  }
  return fail(name, "not found");
}

async function fileExists(path: string): Promise<boolean> {
  return (await readFile(path).catch(() => null)) !== null;
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function readFlag(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function readRepeatedFlag(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name) {
      const value = args[index + 1];
      if (value && !value.startsWith("--")) {
        values.push(value);
      }
    }
  }
  return values;
}

function ok(name: string, message: string): DoctorCheck {
  return { status: "OK", name, message };
}

function warn(name: string, message: string): DoctorCheck {
  return { status: "WARN", name, message };
}

function fail(name: string, message: string): DoctorCheck {
  return { status: "FAIL", name, message };
}

function jsonOutput(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === "ZodError") {
    return sanitizeSensitiveText(formatManifestError(error));
  }
  return sanitizeSensitiveText(error instanceof Error ? error.message : String(error));
}

function resolveCliPath(inputPath: string): string {
  if (isAbsolute(inputPath)) {
    return inputPath;
  }
  return resolve(process.env.INIT_CWD ?? process.cwd(), inputPath);
}
