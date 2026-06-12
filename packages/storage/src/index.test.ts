import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
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
        issueId: issue.id
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
      storage.createCostRecord({
        id: "cost-1",
        runId: run.id,
        provider: "mock",
        model: "mock-planner",
        inputTokens: 10,
        outputTokens: 5
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
      assert.equal(storage.getRun(run.id)?.status, "planned");
      assert.deepEqual(storage.getLatestStackProfile(project.id), profile);
      assert.deepEqual(storage.getRunPlan(plan.id), plan);
      assert.equal(storage.getRunPlan(plan.id)?.requiresManualReview, true);
      assert.equal(storage.getRunPlan(plan.id)?.executionAuthorized, false);
      assert.equal(storage.listRunPlans(issue.id).length, 1);
      assert.deepEqual(storage.listRunLogs(run.id), [log]);
      assert.doesNotMatch(storage.listRunLogs(run.id)[0]?.message ?? "", /sk-supersecret123/);
      assert.doesNotMatch(storage.listRunLogs(run.id)[0]?.metadataJson ?? "", /ghp_supersecret/);
      assert.equal(storage.listCostRecords(run.id).length, 1);
      assert.equal(storage.listDecisions(run.id).length, 2);
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
