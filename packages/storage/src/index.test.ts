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
      const issue = storage.createIssue({
        id: "issue-1",
        projectId: project.id,
        title: "Create scaffold",
        objective: "Create the first BadocK scaffold"
      });
      const run = storage.createRun({
        id: "run-1",
        projectId: project.id,
        issueId: issue.id
      });
      const log = storage.appendRunLog({
        id: "log-1",
        runId: run.id,
        message: "Started",
        metadata: { step: "init" }
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

      assert.equal(storage.getProject(project.id)?.name, "Example");
      assert.equal(storage.getIssue(issue.id)?.title, "Create scaffold");
      assert.equal(storage.getRun(run.id)?.status, "planned");
      assert.deepEqual(storage.listRunLogs(run.id), [log]);
      assert.equal(storage.listCostRecords(run.id).length, 1);
      assert.equal(storage.listDecisions(run.id).length, 1);
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
