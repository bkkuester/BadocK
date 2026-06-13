import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { assertSafeDatabasePath, createBadockStorage } from "./index";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

function tempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "badock-storage-"));
  tempDirs.push(dir);
  return join(dir, ".badock", "badock.sqlite");
}

describe("BadockStorage", () => {
  it("creates and reads MVP entities", () => {
    const storage = createBadockStorage(tempDbPath());

    try {
      const project = storage.createProject({
        id: "project-1",
        name: "Example",
        rootPath: "C:/repo"
      });
      const provider = storage.registerProviderProfile({
        id: "mock",
        projectId: project.id,
        type: "mock",
        defaultModel: "mock-planner",
        parameters: { temperature: 0 }
      });
      const agent = storage.registerAgentProfile({
        id: "backend-agent",
        projectId: project.id,
        role: "backend",
        providerId: provider.id,
        model: "mock-planner",
        permissionMode: "manual",
        capabilities: ["plan"]
      });
      const issue = storage.createIssue({
        id: "issue-1",
        projectId: project.id,
        title: "Create scaffold",
        objective: "Create the first BadocK scaffold",
        scope: ["Core storage"],
        suggestedAgents: ["backend-agent"],
        acceptanceCriteria: ["Issue is persisted"],
        technicalNotes: "No GitHub sync yet",
        files: ["packages/storage/src/index.ts"]
      });
      const updatedIssue = storage.updateIssue(issue.id, {
        state: "planned",
        acceptanceCriteria: ["Issue is persisted", "Issue can be edited"]
      });
      const run = storage.createRun({
        id: "run-1",
        projectId: project.id,
        issueId: issue.id,
        status: "completed_with_warnings"
      });
      const profile = storage.saveStackProfile({
        id: "profile-1",
        projectId: project.id,
        profile: { language: "typescript", packageManager: "pnpm" }
      });
      const plan = storage.createRunPlan({
        id: "plan-1",
        projectId: project.id,
        issueId: issue.id,
        objective: issue.objective,
        scope: issue.scope,
        candidateFiles: issue.files,
        suggestedValidations: ["Review acceptance criterion: Issue is persisted"],
        risks: ["RunPlan requires manual review before execution"],
        acceptanceCriteria: updatedIssue.acceptanceCriteria,
        agentSelection: {
          agentId: agent.id,
          providerId: provider.id,
          model: agent.model,
          permissionMode: agent.permissionMode
        },
        providerMetadata: {
          providerId: provider.id,
          providerType: provider.type,
          model: agent.model,
          costTrackingReady: true
        }
      });
      const log = storage.appendRunLog({
        id: "log-1",
        runId: run.id,
        message: "Started with apiKey=sk-supersecret123",
        metadata: { step: "init", token: "ghp_supersecret1234567890" }
      });
      const runtimeLog = storage.recordAgentRuntimeResult({
        runId: run.id,
        result: {
          adapterId: "local-process",
          status: "failed",
          stdout: "apiKey=sk-secret123456789",
          stderr: "Authorization: Bearer abcdef123456",
          exitCode: 2
        }
      });
      storage.createCostRecord({
        id: "cost-1",
        projectId: project.id,
        issueId: issue.id,
        runId: run.id,
        agentId: agent.id,
        provider: "mock",
        model: "mock-planner",
        tokens: 15,
        inputTokens: 10,
        outputTokens: 5,
        cost: 0.01,
        currency: "usd",
        measurementType: "estimated",
        measurementSource: "mock-provider-metadata"
      });
      storage.createDecision({
        id: "decision-1",
        runId: run.id,
        kind: "permission",
        summary: "Proceed with check"
      });
      storage.recordPermissionDecision({
        id: "permission-1",
        runId: run.id,
        decision: {
          action: "edit_files",
          mode: "manual",
          decision: "ask",
          reason: "Manual mode requires user confirmation for this action",
          requiresUserDecision: true
        }
      });

      assert.equal(storage.getProject(project.id)?.name, "Example");
      assert.deepEqual(storage.getProviderProfile(project.id, provider.id), provider);
      assert.deepEqual(storage.listProviderProfiles(project.id), [provider]);
      assert.deepEqual(storage.getAgentProfile(project.id, agent.id), agent);
      assert.deepEqual(storage.listAgentProfiles(project.id), [agent]);
      assert.equal(storage.getIssue(issue.id)?.title, "Create scaffold");
      assert.equal(storage.getIssue(issue.id)?.state, "planned");
      assert.deepEqual(storage.getIssue(issue.id)?.acceptanceCriteria, ["Issue is persisted", "Issue can be edited"]);
      assert.equal(storage.listIssues(project.id).length, 1);
      assert.equal(storage.getRun(run.id)?.status, "completed_with_warnings");
      assert.deepEqual(storage.getLatestStackProfile(project.id), profile);
      assert.deepEqual(storage.getRunPlan(plan.id), plan);
      assert.equal(storage.getRunPlan(plan.id)?.requiresManualReview, true);
      assert.equal(storage.getRunPlan(plan.id)?.executionAuthorized, false);
      assert.equal(storage.listRunPlans(issue.id).length, 1);
      assert.deepEqual(storage.listRunLogs(run.id), [log, runtimeLog]);
      assert.doesNotMatch(storage.listRunLogs(run.id)[0]?.message ?? "", /sk-supersecret123/);
      assert.doesNotMatch(storage.listRunLogs(run.id)[0]?.metadataJson ?? "", /ghp_supersecret/);
      assert.equal(storage.listRunLogs(run.id)[1]?.level, "error");
      assert.match(storage.listRunLogs(run.id)[1]?.message ?? "", /local-process/);
      assert.doesNotMatch(storage.listRunLogs(run.id)[1]?.metadataJson ?? "", /sk-secret123456789|abcdef123456/);
      assert.match(storage.listRunLogs(run.id)[1]?.metadataJson ?? "", /\[REDACTED\]/);
      assert.deepEqual(storage.listCostRecords(run.id)[0], {
        id: "cost-1",
        projectId: project.id,
        issueId: issue.id,
        runId: run.id,
        agentId: agent.id,
        provider: "mock",
        model: "mock-planner",
        tokens: 15,
        inputTokens: 10,
        outputTokens: 5,
        cost: 0.01,
        currency: "USD",
        measurementType: "estimated",
        measurementSource: "mock-provider-metadata",
        createdAt: storage.listCostRecords(run.id)[0]?.createdAt
      });
      assert.equal(storage.listDecisions(run.id).length, 2);
    } finally {
      storage.close();
    }
  });

  it("accepts only canonical RunStatus values", () => {
    const storage = createBadockStorage(tempDbPath());

    try {
      const project = storage.createProject({ id: "project-1", name: "Example", rootPath: "C:/repo" });
      const issue = storage.createIssue({
        id: "issue-1",
        projectId: project.id,
        title: "Plan work",
        objective: "Prepare run status coverage",
        scope: ["Run Orchestrator"],
        suggestedAgents: ["backend-agent"],
        acceptanceCriteria: ["Statuses are canonical"]
      });

      for (const status of [
        "planned",
        "running",
        "completed",
        "completed_with_warnings",
        "paused_budget_limit",
        "failed",
        "needs_user_decision"
      ] as const) {
        const run = storage.createRun({ projectId: project.id, issueId: issue.id, status });
        assert.equal(storage.getRun(run.id)?.status, status);
      }

      assert.throws(
        () => storage.createRun({ projectId: project.id, issueId: issue.id, status: "decision_required" as never }),
        /Invalid run status/
      );
    } finally {
      storage.close();
    }
  });

  it("requires auditable CostRecord dimensions", () => {
    const storage = createBadockStorage(tempDbPath());

    try {
      const project = storage.createProject({ id: "project-1", name: "Example", rootPath: "C:/repo" });
      storage.registerProviderProfile({ id: "mock", projectId: project.id, type: "mock" });
      const agent = storage.registerAgentProfile({
        id: "agent-1",
        projectId: project.id,
        role: "planner",
        providerId: "mock",
        model: "mock-planner",
        permissionMode: "manual"
      });
      const issue = storage.createIssue({
        id: "issue-1",
        projectId: project.id,
        title: "Track cost",
        objective: "Record cost dimensions",
        scope: ["Cost Tracker"],
        suggestedAgents: [agent.id],
        acceptanceCriteria: ["Cost is auditable"]
      });
      const run = storage.createRun({ id: "run-1", projectId: project.id, issueId: issue.id });

      assert.throws(
        () =>
          storage.createCostRecord({
            projectId: project.id,
            issueId: "wrong-issue",
            runId: run.id,
            agentId: agent.id,
            provider: "mock",
            model: "mock-planner",
            tokens: 1,
            cost: 0,
            currency: "USD",
            measurementType: "estimated",
            measurementSource: "test"
          }),
        /issue does not match/
      );
      assert.throws(
        () =>
          storage.createCostRecord({
            projectId: project.id,
            issueId: issue.id,
            runId: run.id,
            agentId: "",
            provider: "mock",
            model: "mock-planner",
            tokens: 1,
            cost: 0,
            currency: "USD",
            measurementType: "estimated",
            measurementSource: "test"
          }),
        /cost agent id is required/
      );
      assert.throws(
        () =>
          storage.createCostRecord({
            projectId: project.id,
            issueId: issue.id,
            runId: run.id,
            agentId: agent.id,
            provider: "mock",
            model: "mock-planner",
            tokens: -1,
            cost: 0,
            currency: "USD",
            measurementType: "estimated",
            measurementSource: "test"
          }),
        /cost tokens/
      );
    } finally {
      storage.close();
    }
  });

  it("keeps schema migrations idempotent", () => {
    const dbPath = tempDbPath();
    const first = createBadockStorage(dbPath);
    try {
      assert.equal(first.getSchemaVersion(), 2);
      assert.deepEqual(
        first.listSchemaMigrations().map((migration) => migration.version),
        [1, 2]
      );
    } finally {
      first.close();
    }

    const second = createBadockStorage(dbPath);
    try {
      assert.equal(second.getSchemaVersion(), 2);
      assert.deepEqual(
        second.listSchemaMigrations().map((migration) => migration.version),
        [1, 2]
      );
    } finally {
      second.close();
    }
  });

  it("migrates legacy run statuses and cost records without dropping data", () => {
    const dbPath = tempDbPath();
    mkdirSync(dirname(dbPath), { recursive: true });
    const legacy = new DatabaseSync(dbPath);
    legacy.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE project (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        manifest_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE issue (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        objective TEXT NOT NULL,
        scope_json TEXT NOT NULL DEFAULT '[]',
        suggested_agents_json TEXT NOT NULL DEFAULT '[]',
        acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
        technical_notes TEXT NOT NULL DEFAULT '',
        files_json TEXT NOT NULL DEFAULT '[]',
        state TEXT NOT NULL CHECK (state IN ('open', 'planned', 'running', 'closed')),
        sync_state TEXT NOT NULL DEFAULT 'local_only' CHECK (sync_state IN ('local_only', 'synced', 'sync_error')),
        github_number INTEGER,
        github_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE run (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        issue_id TEXT REFERENCES issue(id) ON DELETE SET NULL,
        status TEXT NOT NULL CHECK (status IN ('planned', 'running', 'completed', 'failed', 'decision_required')),
        started_at TEXT,
        finished_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE cost_record (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_cost REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        created_at TEXT NOT NULL
      );

      INSERT INTO project VALUES ('project-1', 'Example', 'C:/repo', 1, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z');
      INSERT INTO issue VALUES ('issue-1', 'project-1', 'Track cost', 'Track cost dimensions', '[]', '[]', '[]', '', '[]', 'open', 'local_only', NULL, NULL, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z');
      INSERT INTO run VALUES ('run-1', 'project-1', 'issue-1', 'decision_required', NULL, NULL, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z');
      INSERT INTO cost_record VALUES ('cost-1', 'run-1', 'mock', 'mock-planner', 10, 5, 0.02, 'USD', '2026-06-13T00:00:00.000Z');
    `);
    legacy.close();

    const storage = createBadockStorage(dbPath);
    try {
      assert.equal(storage.getRun("run-1")?.status, "needs_user_decision");
      assert.deepEqual(storage.listCostRecords("run-1")[0], {
        id: "cost-1",
        projectId: "project-1",
        issueId: "issue-1",
        runId: "run-1",
        agentId: "unknown",
        provider: "mock",
        model: "mock-planner",
        tokens: 15,
        inputTokens: 10,
        outputTokens: 5,
        cost: 0.02,
        currency: "USD",
        measurementType: "estimated",
        measurementSource: "migration:legacy-cost-record",
        createdAt: "2026-06-13T00:00:00.000Z"
      });
      assert.equal(storage.getSchemaVersion(), 2);
    } finally {
      storage.close();
    }
  });

  it("rejects database paths that look secret-bearing", () => {
    assert.throws(
      () => assertSafeDatabasePath("C:/repo/.badock/api-key.sqlite"),
      /must not include secret-like names/
    );
  });
});
