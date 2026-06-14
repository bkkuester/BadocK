import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  completeRun,
  getRunArtifactPath,
  readRunManifest,
  startRun,
  validateRunReportArtifacts
} from "./index";

async function main(): Promise<void> {
  const first = await createCompletedSmokeRun();
  const runJsonPath = getRunArtifactPath(first.projectRoot, first.runId, "run.json");
  const manifest = JSON.parse(readFileSync(runJsonPath, "utf8"));

  for (const artifactName of ["run.json", "prompt.md", "stdout.log", "stderr.log", "diff.patch", "summary.md", "traceability.md"]) {
    assert.equal(existsSync(getRunArtifactPath(first.projectRoot, first.runId, artifactName)), true, `${artifactName} exists`);
  }

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(Array.isArray(manifest.targetIssues), true);
  assert.equal(Array.isArray(manifest.filesChanged), true);
  assert.equal(typeof manifest.cost.estimated, "boolean");
  assert.doesNotMatch(readFileSync(getRunArtifactPath(first.projectRoot, first.runId, "prompt.md"), "utf8"), /sk-smoke/i);
  assert.doesNotMatch(readFileSync(getRunArtifactPath(first.projectRoot, first.runId, "stdout.log"), "utf8"), /ghp_smokesecret/i);
  assert.doesNotMatch(readFileSync(getRunArtifactPath(first.projectRoot, first.runId, "stderr.log"), "utf8"), /github_pat_smokesecret/i);
  assert.equal(readFileSync(join(first.projectRoot, "preexisting.txt"), "utf8"), "keep me");

  const valid = await validateRunReportArtifacts(first.projectRoot, first.runId);
  assert.equal(valid.valid, true, valid.errors.join("\n"));

  assert.throws(() => getRunArtifactPath(first.projectRoot, "run-../escape", "run.json"), /Invalid run id/);
  assert.throws(() => getRunArtifactPath(first.projectRoot, first.runId, "../run.json"), /Invalid run artifact name/);

  const invalidStatus = { ...manifest, status: "invalid_status" };
  writeFileSync(runJsonPath, `${JSON.stringify(invalidStatus, null, 2)}\n`);
  const invalid = await validateRunReportArtifacts(first.projectRoot, first.runId);
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join("\n"), /status is invalid/);

  const second = await createCompletedSmokeRun();
  rmSync(getRunArtifactPath(second.projectRoot, second.runId, "stderr.log"));
  const missing = await validateRunReportArtifacts(second.projectRoot, second.runId);
  assert.equal(missing.valid, false);
  assert.match(missing.errors.join("\n"), /stderr\.log/);

  console.log(`Run Report smoke passed: ${first.runId}, ${second.runId}`);
}

async function createCompletedSmokeRun(): Promise<{ projectRoot: string; runId: string }> {
  const projectRoot = mkdtempSync(join(tmpdir(), "badock-run-report-"));
  execFileSync("git", ["init"], { cwd: projectRoot, stdio: "ignore", windowsHide: true });
  writeFileSync(join(projectRoot, "preexisting.txt"), "keep me");

  const run = await startRun({
    projectRoot,
    issueId: "local-0001",
    issueSource: "local",
    issueTitle: "Run Report smoke",
    targetIssues: [
      {
        id: "local-0001",
        title: "Run Report smoke",
        source: "local",
        declaredProblem: "Run reports must be auditable.",
        acceptanceCriteria: ["Required artifacts exist", "Secrets are masked", "Path traversal is blocked"],
        previousImplementation: "Partial run evidence existed.",
        suspectedGap: "Traceability and validation were incomplete.",
        files: ["packages/core/src/run-store.ts"],
        expectedValidations: ["runs:smoke", "runs:validate"]
      }
    ],
    agent: "ci-agent",
    agentRuntime: "codex",
    baseBranch: "main",
    branch: "agent/local-0001/ci-agent",
    worktreePath: projectRoot,
    prompt: "OPENAI_API_KEY=sk-smoke123456789",
    allowedFiles: ["packages/core/src/run-store.ts"],
    provider: "codex-cli",
    model: "unknown"
  });

  await completeRun({
    projectRoot,
    runId: run.runId,
    status: "completed_with_warnings",
    commands: ["smoke command"],
    stdout: "TOKEN=ghp_smokesecret1234567890",
    stderr: "GITHUB_TOKEN=github_pat_smokesecret1234567890",
    summary: "Smoke report generated.",
    sourceAvailability: [
      { source: "Repository", status: "available", notes: "Temporary repository initialized for smoke coverage." },
      { source: "Local docs", status: "unavailable", notes: "Not needed for smoke fixture." },
      { source: "GitHub issues", status: "unavailable", notes: "Not needed for smoke fixture." },
      { source: "GitHub PRs", status: "unavailable", notes: "Not needed for smoke fixture." },
      { source: "Previous runs", status: "unavailable", notes: "Not needed for smoke fixture." }
    ],
    traceability: [
      {
        issue: "local-0001",
        problem: "Run reports must be auditable.",
        acceptanceCriterion: "Required artifacts exist and validate.",
        stateBefore: "partial",
        changeMade: "Run Report v0 generated the required artifacts.",
        evidence: "validateRunReportArtifacts returned valid.",
        status: "completed_with_warnings",
        requirement: "Required artifacts exist and validate.",
        implementationEvidence: "run.json, summary.md and traceability.md",
        validationEvidence: "run-report-smoke"
      }
    ],
    validation: {
      commandsExecuted: ["run-report-smoke"],
      results: ["Required artifacts, masking and path validation passed."]
    },
    unresolvedOrRiskyItems: ["Smoke uses synthetic issue context."]
  });

  await readRunManifest(projectRoot, run.runId);
  return { projectRoot, runId: run.runId };
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
