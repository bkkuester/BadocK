import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  buildFindings,
  buildWorktreeMetadata,
  createLocalIssueFile,
  createStackProfile,
  createUnavailableCostRecord,
  evaluatePermission,
  formatProcessCommand,
  generateRunPlan,
  getBadockHealth,
  getRunArtifactPath,
  listLocalIssueFiles,
  MemoryProviderSecretStore,
  normalizeLocalIssueInput,
  ProviderGateway,
  ProviderGatewayError,
  readRunManifest,
  runLocalProcess,
  sanitizeForPublicOutput,
  sanitizeSensitiveText,
  selectAgentForRun,
  startRun,
  suggestAgentForIssue,
  scanProject,
  validateRunReportArtifacts,
  validateLocalIssueFile
} from "./index";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "badock-core-"));
  tempDirs.push(dir);
  return dir;
}

describe("getBadockHealth", () => {
  it("reports the CLI-first core as healthy", () => {
    assert.deepEqual(
      {
        name: getBadockHealth().name,
        status: getBadockHealth().status,
        mode: getBadockHealth().mode
      },
      {
        name: "BadocK",
        status: "ok",
        mode: "cli-first"
      }
    );
  });
});

describe("scanProject", () => {
  it("returns deterministic repository facts without running project scripts", async () => {
    const dir = tempDir();
    mkdirSync(join(dir, ".git"), { recursive: true });
    mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
    writeFileSync(join(dir, "README.md"), "# Example");
    writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'");
    writeFileSync(join(dir, "tsconfig.json"), "{}");
    writeFileSync(join(dir, ".github", "workflows", "ci.yml"), "name: CI");
    writeFileSync(
      join(dir, ".git", "config"),
      ['[remote "origin"]', "  url = https://github.com/example/project.git"].join("\n")
    );
    writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/main");
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        packageManager: "pnpm@11.5.2",
        scripts: {
          build: "tsc",
          test: "node --test",
          postinstall: "node scripts/side-effect.js"
        },
        devDependencies: {
          typescript: "5.8.3"
        }
      })
    );

    const scan = await scanProject(dir);

    assert.equal(scan.detectedFiles.packageJson, "package.json");
    assert.deepEqual(scan.detectedFiles.lockfiles, ["pnpm-lock.yaml"]);
    assert.deepEqual(scan.detectedFiles.tsconfigs, ["tsconfig.json"]);
    assert.deepEqual(scan.detectedFiles.readmes, ["README.md"]);
    assert.deepEqual(scan.detectedFiles.workflows, [".github/workflows/ci.yml"]);
    assert.equal(scan.packageScripts.build, "tsc");
    assert.equal(scan.packageScripts.postinstall, "node scripts/side-effect.js");
    assert.equal(scan.git.state, "github");
    assert.equal(scan.git.branch, "main");
  });

  it("differentiates incomplete projects and projects without Git", async () => {
    const dir = tempDir();

    const scan = await scanProject(dir);

    assert.equal(scan.detectedFiles.packageJson, null);
    assert.equal(scan.git.state, "none");
    assert.deepEqual(scan.packageScripts, {});
  });

  it("differentiates local Git repositories without GitHub remotes", async () => {
    const dir = tempDir();
    mkdirSync(join(dir, ".git"), { recursive: true });
    writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/feature/local");
    writeFileSync(join(dir, ".git", "config"), "[core]\n  repositoryformatversion = 0");

    const scan = await scanProject(dir);

    assert.equal(scan.git.hasGit, true);
    assert.equal(scan.git.state, "local");
    assert.equal(scan.git.remoteUrl, null);
    assert.equal(scan.git.branch, "feature/local");
  });

  it("fails clearly for missing project directories", async () => {
    await assert.rejects(() => scanProject(join(tempDir(), "missing")), /does not exist/);
  });
});

describe("createStackProfile", () => {
  it("identifies TypeScript, Node.js and pnpm from scanner facts", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "pnpm-lock.yaml"), "");
    writeFileSync(join(dir, "tsconfig.json"), "{}");
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        scripts: {
          check: "tsc --noEmit",
          lint: "eslint .",
          test: "node --test"
        }
      })
    );

    const profile = createStackProfile(await scanProject(dir));

    assert.equal(profile.language, "typescript");
    assert.equal(profile.runtime, "node");
    assert.equal(profile.packageManager, "pnpm");
    assert.deepEqual(
      profile.validationScripts.map((script) => script.kind),
      ["check", "test", "lint"]
    );
  });

  it("identifies npm and JavaScript without a tsconfig", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "package-lock.json"), "{}");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { build: "vite build" } }));

    const profile = createStackProfile(await scanProject(dir));

    assert.equal(profile.language, "javascript");
    assert.equal(profile.packageManager, "npm");
    assert.deepEqual(profile.validationScripts.map((script) => script.kind), ["build"]);
  });

  it("returns unknown stack facts when no package manager is present", async () => {
    const profile = createStackProfile(await scanProject(tempDir()));

    assert.equal(profile.language, "unknown");
    assert.equal(profile.runtime, "unknown");
    assert.equal(profile.packageManager, "unknown");
  });
});

describe("local issue and run plan contracts", () => {
  it("normalizes the BadocK issue format", () => {
    const issue = normalizeLocalIssueInput({
      title: "  Add scanner  ",
      objective: "  Read project facts  ",
      scope: ["Read files", "Read files"],
      suggestedAgents: ["stack-agent"],
      acceptanceCriteria: ["Scanner is deterministic"],
      technicalNotes: "No AI",
      files: ["packages/core/src/project.ts"]
    });

    assert.deepEqual(issue, {
      title: "Add scanner",
      objective: "Read project facts",
      scope: ["Read files"],
      suggestedAgents: ["stack-agent"],
      acceptanceCriteria: ["Scanner is deterministic"],
      technicalNotes: "No AI",
      files: ["packages/core/src/project.ts"],
      state: "open"
    });
  });

  it("rejects invalid local issues before persistence", () => {
    assert.throws(
      () =>
        normalizeLocalIssueInput({
          title: "",
          objective: "Do work",
          scope: ["core"],
          suggestedAgents: ["backend-agent"],
          acceptanceCriteria: ["Valid"]
        }),
      /title is required/
    );
  });

  it("generates a deterministic RunPlan that does not authorize execution", () => {
    const issue = normalizeLocalIssueInput({
      title: "Add scanner",
      objective: "Read project facts",
      scope: ["Project Scanner"],
      suggestedAgents: ["stack-agent"],
      acceptanceCriteria: ["Scanner is deterministic"],
      files: ["packages/core/src/project.ts"]
    });

    const plan = generateRunPlan({
      projectId: "project-1",
      issueId: "issue-1",
      issue,
      stackProfile: {
        validationScripts: [{ kind: "test", name: "test", command: "node --test" }]
      }
    });

    assert.equal(plan.requiresManualReview, true);
    assert.equal(plan.executionAuthorized, false);
    assert.deepEqual(plan.acceptanceCriteria, ["Scanner is deterministic"]);
    assert.deepEqual(plan.candidateFiles, ["packages/core/src/project.ts"]);
    assert.match(plan.suggestedValidations.join("\n"), /Scanner is deterministic/);
    assert.match(plan.suggestedValidations.join("\n"), /test/);
  });

  it("records editable agent selection and provider metadata in RunPlan", () => {
    const issue = normalizeLocalIssueInput({
      title: "Implement provider gateway",
      objective: "Route model calls through a gateway",
      scope: ["Provider Gateway"],
      suggestedAgents: ["provider-agent"],
      acceptanceCriteria: ["Provider is selected"],
      files: ["packages/core/src/provider.ts"]
    });

    const plan = generateRunPlan({
      projectId: "project-1",
      issueId: "issue-1",
      issue,
      selectedAgentId: "provider-agent",
      agents: [
        {
          id: "provider-agent",
          role: "provider",
          providerId: "mock",
          model: "mock-planner",
          permissionMode: "manual",
          capabilities: ["plan"]
        }
      ],
      providers: [{ id: "mock", type: "mock", defaultModel: "mock-planner" }]
    });

    assert.equal(plan.agentSelection?.agentId, "provider-agent");
    assert.equal(plan.agentSelection?.source, "manual");
    assert.equal(plan.providerMetadata?.providerId, "mock");
    assert.equal(plan.providerMetadata?.costTrackingReady, true);
  });

  it("does not mark cost tracking ready when provider metadata is missing", () => {
    const issue = normalizeLocalIssueInput({
      title: "Suggest backend agent",
      objective: "Prepare a plan",
      scope: ["Run Orchestrator"],
      suggestedAgents: ["backend-agent"],
      acceptanceCriteria: ["Agent suggestion is editable"]
    });

    const plan = generateRunPlan({
      projectId: "project-1",
      issueId: "issue-1",
      issue,
      agents: [
        {
          id: "backend-agent",
          role: "backend",
          providerId: "missing",
          model: "mock-planner",
          permissionMode: "manual",
          capabilities: []
        }
      ]
    });

    assert.equal(plan.providerMetadata?.providerType, "unknown");
    assert.equal(plan.providerMetadata?.costTrackingReady, false);
  });

  it("does not infer agents from free-form issue text", () => {
    const issue = normalizeLocalIssueInput({
      title: "Fix CI and test scripts",
      objective: "This text mentions CI, but no explicit agent was selected",
      scope: ["Core"],
      suggestedAgents: ["missing-agent"],
      acceptanceCriteria: ["Selection remains explicit"]
    });

    const selection = suggestAgentForIssue({
      issue,
      agents: [
        {
          id: "ci-agent",
          role: "ci",
          providerId: "mock",
          model: "mock-planner",
          permissionMode: "manual",
          capabilities: []
        }
      ],
      providers: [{ id: "mock" }]
    });

    assert.equal(selection, null);
  });

  it("creates, lists and validates local markdown issue files", async () => {
    const dir = tempDir();
    const issue = await createLocalIssueFile(dir, {
      title: "Implement review",
      objective: "Review run diffs",
      scope: ["Diff Review"],
      suggestedAgents: ["ci-agent"],
      acceptanceCriteria: ["Review detects forbidden files"],
      files: ["packages/core/src/diff-review.ts"]
    });

    const list = await listLocalIssueFiles(dir);
    const validation = await validateLocalIssueFile(dir, issue.id);

    assert.equal(issue.id, "local-0001");
    assert.equal(list.length, 1);
    assert.equal(validation.valid, true);
    assert.equal(validation.issue?.title, "Implement review");
  });
});

describe("sensitive data protection", () => {
  it("masks common secret values in text and structured output", () => {
    const text = sanitizeSensitiveText("apiKey=sk-secret123456789 and Authorization: Bearer abcdef123456");
    const output = sanitizeForPublicOutput({
      provider: "mock",
      token: "ghp_supersecret1234567890",
      nested: { message: "password=hunter2" }
    });

    assert.doesNotMatch(text, /sk-secret/);
    assert.doesNotMatch(text, /abcdef123456/);
    assert.deepEqual(output, {
      provider: "mock",
      token: "[REDACTED]",
      nested: { message: "password=[REDACTED]" }
    });
  });
});

describe("ProviderGateway", () => {
  it("registers providers without exposing configured secrets", () => {
    const secretStore = new MemoryProviderSecretStore({ mock: "sk-secret123456789" });
    const gateway = new ProviderGateway({ secretStore });
    const provider = gateway.registerProvider({ id: "mock", type: "mock", defaultModel: "mock-planner" });

    assert.equal(provider.secretConfigured, true);
    assert.equal(JSON.stringify(gateway.listProviders()).includes("sk-secret"), false);
  });

  it("returns deterministic mock model results with cost metadata", async () => {
    const gateway = new ProviderGateway({
      providers: [{ id: "mock", type: "mock", defaultModel: "mock-planner" }]
    });

    const result = await gateway.callModel({
      providerId: "mock",
      purpose: "plan",
      prompt: "Create a plan"
    });

    assert.match(result.output, /mock plan response/);
    assert.equal(result.metadata.providerId, "mock");
    assert.equal(result.metadata.model, "mock-planner");
    assert.equal(result.metadata.estimated, true);
  });

  it("returns structured errors for missing and invalid providers", async () => {
    const gateway = new ProviderGateway();

    await assert.rejects(
      () => gateway.callModel({ providerId: "missing", purpose: "plan", prompt: "hello" }),
      (error) => error instanceof ProviderGatewayError && error.code === "provider_not_found"
    );

    assert.throws(
      () => gateway.registerProvider({ id: "bad", type: "mock", apiKey: "sk-secret123456" } as never),
      /sensitive field/
    );
  });
});

describe("Permission Engine", () => {
  it("asks before edits and commands in manual mode", () => {
    assert.equal(
      evaluatePermission({ action: "edit_files", projectConfig: { mode: "manual" } }).decision,
      "ask"
    );
    assert.equal(
      evaluatePermission({ action: "run_command", projectConfig: { mode: "manual" } }).decision,
      "ask"
    );
  });

  it("allows scoped supervised edits and tests but denies out-of-scope edits", () => {
    assert.equal(
      evaluatePermission({
        action: "edit_files",
        targetPath: "packages/core/src/provider.ts",
        projectConfig: { mode: "supervised", scopedPaths: ["packages/core"] }
      }).decision,
      "allow"
    );
    assert.equal(
      evaluatePermission({
        action: "edit_files",
        targetPath: "apps/cli/src/index.ts",
        projectConfig: { mode: "supervised", scopedPaths: ["packages/core"] }
      }).decision,
      "deny"
    );
    assert.equal(evaluatePermission({ action: "run_test", projectConfig: { mode: "supervised" } }).decision, "allow");
  });

  it("requires allowlists and explicit flags in autonomous mode", () => {
    assert.equal(
      evaluatePermission({
        action: "run_command",
        command: "pnpm test",
        projectConfig: { mode: "autonomous", allowCommands: ["pnpm test"] }
      }).decision,
      "allow"
    );
    assert.equal(
      evaluatePermission({ action: "push", projectConfig: { mode: "autonomous" } }).decision,
      "deny"
    );
    assert.equal(
      evaluatePermission({
        action: "run_test",
        currentBranch: "main",
        projectConfig: { mode: "autonomous", allowCommands: ["pnpm test"] }
      }).decision,
      "deny"
    );
  });
});

describe("Local Process Runtime Adapter", () => {
  it("executes an allowlisted process with stdout and stdin", async () => {
    const dir = tempDir();
    const args = ["-e", "process.stdin.on('data', (chunk) => process.stdout.write(`echo:${chunk}`));"];
    const command = formatProcessCommand(process.execPath, args);

    const result = await runLocalProcess({
      program: process.execPath,
      args,
      cwd: dir,
      stdin: "hello",
      permission: allowRuntimeCommand(command)
    });

    assert.equal(result.status, "completed");
    assert.equal(result.didExecute, true);
    assert.equal(result.exitCode, 0);
    assert.equal(result.command.stdin, "provided");
    assert.equal(result.stdout, "echo:hello");
  });

  it("captures stderr without marking a zero exit as failed", async () => {
    const dir = tempDir();
    const args = ["-e", "console.error('warning on stderr');"];
    const command = formatProcessCommand(process.execPath, args);

    const result = await runLocalProcess({
      program: process.execPath,
      args,
      cwd: dir,
      permission: allowRuntimeCommand(command)
    });

    assert.equal(result.status, "completed");
    assert.equal(result.exitCode, 0);
    assert.match(result.stderr, /warning on stderr/);
  });

  it("preserves stdout and stderr when the process exits non-zero", async () => {
    const dir = tempDir();
    const args = ["-e", "console.log('before failure'); console.error('failure detail'); process.exit(7);"];
    const command = formatProcessCommand(process.execPath, args);

    const result = await runLocalProcess({
      program: process.execPath,
      args,
      cwd: dir,
      permission: allowRuntimeCommand(command)
    });

    assert.equal(result.status, "failed");
    assert.equal(result.exitCode, 7);
    assert.match(result.stdout, /before failure/);
    assert.match(result.stderr, /failure detail/);
  });

  it("returns a structured spawn error for a missing binary", async () => {
    const dir = tempDir();
    const program = join(dir, "missing-runtime.exe");
    const command = formatProcessCommand(program, []);

    const result = await runLocalProcess({
      program,
      cwd: dir,
      permission: allowRuntimeCommand(command)
    });

    assert.equal(result.status, "spawn_error");
    assert.equal(result.didExecute, false);
    assert.match(result.error ?? "", /ENOENT|spawn/i);
  });

  it("times out with partial output preserved", async () => {
    const dir = tempDir();
    const args = [
      "-e",
      "process.stdout.write('partial output'); setTimeout(() => console.log('late output'), 1000);"
    ];
    const command = formatProcessCommand(process.execPath, args);

    const result = await runLocalProcess({
      program: process.execPath,
      args,
      cwd: dir,
      timeoutMs: 250,
      permission: allowRuntimeCommand(command)
    });

    assert.equal(result.status, "timed_out");
    assert.match(result.stdout, /partial output/);
  });

  it("does not execute when permission requires a user decision", async () => {
    const dir = tempDir();
    const args = ["-e", "console.log('should not run');"];

    const result = await runLocalProcess({
      program: process.execPath,
      args,
      cwd: dir,
      permission: { projectConfig: { mode: "manual" }, currentBranch: "feature/runtime" }
    });

    assert.equal(result.status, "needs_user_decision");
    assert.equal(result.didExecute, false);
    assert.equal(result.permission?.decision, "ask");
    assert.equal(result.stdout, "");
  });

  it("blocks execution when permission denies the command", async () => {
    const dir = tempDir();
    const args = ["-e", "console.log('should not run');"];

    const result = await runLocalProcess({
      program: process.execPath,
      args,
      cwd: dir,
      permission: { projectConfig: { mode: "autonomous", allowCommands: [] }, currentBranch: "feature/runtime" }
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.didExecute, false);
    assert.equal(result.permission?.decision, "deny");
    assert.equal(result.stdout, "");
  });

  it("sanitizes secrets from stdout, stderr and errors", async () => {
    const dir = tempDir();
    const args = [
      "-e",
      "console.log('apiKey=sk-secret123456789'); console.error('Authorization: Bearer abcdef123456'); process.exit(2);"
    ];
    const command = formatProcessCommand(process.execPath, args);

    const result = await runLocalProcess({
      program: process.execPath,
      args,
      cwd: dir,
      permission: allowRuntimeCommand(command)
    });

    assert.equal(result.status, "failed");
    assert.doesNotMatch(result.stdout, /sk-secret123456789/);
    assert.doesNotMatch(result.stderr, /abcdef123456/);
    assert.match(result.stdout, /apiKey=\[REDACTED\]/);
    assert.match(result.stderr, /\[REDACTED\]/);
  });

  it("runs with a cwd containing spaces", async () => {
    const dir = join(tempDir(), "path with space");
    mkdirSync(dir, { recursive: true });
    const args = ["-e", "console.log(process.cwd());"];
    const command = formatProcessCommand(process.execPath, args);

    const result = await runLocalProcess({
      program: process.execPath,
      args,
      cwd: dir,
      permission: allowRuntimeCommand(command)
    });

    assert.equal(result.status, "completed");
    assert.match(result.stdout.replace(/\\/g, "/"), /path with space/);
  });

  it("blocks sensitive environment allowlist keys before spawning", async () => {
    const dir = tempDir();
    const args = ["-e", "console.log('should not run');"];
    const command = formatProcessCommand(process.execPath, args);

    const result = await runLocalProcess({
      program: process.execPath,
      args,
      cwd: dir,
      envAllowlist: ["API_KEY"],
      permission: allowRuntimeCommand(command)
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.didExecute, false);
    assert.match(result.error ?? "", /sensitive/i);
  });
});

describe("Agent Registry", () => {
  it("selects an existing agent with a configured provider", () => {
    const selection = selectAgentForRun({
      agentId: "backend-agent",
      agents: [
        {
          id: "backend-agent",
          role: "backend",
          providerId: "mock",
          model: "mock-planner",
          permissionMode: "manual",
          capabilities: []
        }
      ],
      providers: [{ id: "mock" }]
    });

    assert.equal(selection.agentId, "backend-agent");
    assert.equal(selection.editable, true);
  });

  it("rejects missing agents and agents without configured providers", () => {
    assert.throws(
      () => selectAgentForRun({ agentId: "missing", agents: [], providers: [{ id: "mock" }] }),
      /Agent not found/
    );
    assert.throws(
      () =>
        selectAgentForRun({
          agentId: "backend-agent",
          agents: [
            {
              id: "backend-agent",
              role: "backend",
              providerId: "missing",
              model: "mock-planner",
              permissionMode: "manual",
              capabilities: []
            }
          ],
          providers: [{ id: "mock" }]
        }),
      /unconfigured provider/
    );
  });
});

describe("BadocK run, worktree and review primitives", () => {
  it("builds deterministic branch and worktree metadata", () => {
    const metadata = buildWorktreeMetadata({
      repoRoot: "C:/repo",
      issueId: "local-0001",
      agentName: "ci-agent",
      baseBranch: "main"
    });

    assert.equal(metadata.branch, "agent/local-0001/ci-agent");
    assert.match(metadata.worktreePath.replace(/\\/g, "/"), /worktrees\/issue-local-0001-ci-agent$/);
    assert.equal(metadata.created, false);
  });

  it("creates run manifests with cost marked unavailable instead of invented", async () => {
    const dir = tempDir();
    const run = await startRun({
      projectRoot: dir,
      issueId: "local-0001",
      issueSource: "local",
      agent: "ci-agent",
      branch: "agent/local-0001/ci-agent",
      worktreePath: dir,
      prompt: "Do work",
      allowedFiles: ["packages/core/src/index.ts"]
    });
    const manifest = await readRunManifest(dir, run.id);

    assert.equal(manifest.status, "running");
    assert.equal(manifest.cost.source, "not_available");
    assert.equal(manifest.cost.costUsd, null);
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.runId, run.id);
    assert.equal(Array.isArray(manifest.targetIssues), true);
    assert.equal(Array.isArray(manifest.filesChanged), true);
    assert.equal(typeof manifest.cost.estimated, "boolean");
    assert.equal(manifest.artifacts.traceability, "traceability.md");
    assert.throws(() => getRunArtifactPath(dir, "run-../escape", "run.json"), /Invalid run id/);
    assert.throws(() => getRunArtifactPath(dir, run.id, "../run.json"), /Invalid run artifact name/);

    const validation = await validateRunReportArtifacts(dir, run.id);
    assert.equal(validation.valid, false);
    assert.match(validation.errors.join("\n"), /status must be final/);
  });

  it("detects forbidden run artifacts and out-of-scope files in review findings", () => {
    const findings = buildFindings(
      {
        id: "run-1",
        summaryPath: ".badock/runs/run-1/summary.md",
        allowedFiles: ["packages/core/src/index.ts"]
      },
      [".badock/runs/run-1/run.json", ".env", "README.md"],
      "diff --git a/.env b/.env"
    );

    assert.match(findings.map((finding) => finding.code).join("\n"), /run_artifact_in_diff/);
    assert.match(findings.map((finding) => finding.code).join("\n"), /sensitive_file_changed/);
    assert.match(findings.map((finding) => finding.code).join("\n"), /file_out_of_scope/);
  });

  it("represents unavailable Codex CLI cost explicitly", () => {
    assert.deepEqual(
      createUnavailableCostRecord({
        agent: "ci-agent",
        issueId: "local-0001",
        runId: "run-1",
        provider: "codex-cli",
        model: "unknown"
      }),
      {
        provider: "codex-cli",
        model: "unknown",
        agent: "ci-agent",
        issueId: "local-0001",
        runId: "run-1",
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        estimated: false,
        source: "not_available"
      }
    );
  });
});

function allowRuntimeCommand(command: string) {
  return {
    projectConfig: { mode: "supervised" as const, allowCommands: [command] },
    currentBranch: "feature/runtime"
  };
}
