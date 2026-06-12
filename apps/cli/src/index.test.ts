import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { runBadockCli } from "./index";
import { createBadockStorage } from "@badock/storage";

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
  const dir = mkdtempSync(join(tmpdir(), "badock-cli-"));
  tempDirs.push(dir);
  return dir;
}

describe("runBadockCli", () => {
  it("returns core health", async () => {
    const result = await runBadockCli(["health"]);

    assert.equal(result.exitCode, 0);
    assert.deepEqual(
      {
        name: JSON.parse(result.output ?? "{}").name,
        status: JSON.parse(result.output ?? "{}").status
      },
      {
        name: "BadocK",
        status: "ok"
      }
    );
  });

  it("validates a manifest", async () => {
    const dir = tempDir();
    const manifestPath = join(dir, "project.json");
    writeFileSync(
      manifestPath,
      JSON.stringify({
        version: 1,
        project: { name: "Example" },
        permissions: { defaultMode: "manual" }
      })
    );

    const result = await runBadockCli(["manifest", "validate", manifestPath]);

    assert.deepEqual(result, {
      exitCode: 0,
      output: 'Manifest valid for project "Example"'
    });
  });

  it("resolves relative paths from the original pnpm invocation cwd", async () => {
    const dir = tempDir();
    const previousInitCwd = process.env.INIT_CWD;
    writeFileSync(
      join(dir, "project.json"),
      JSON.stringify({
        version: 1,
        project: { name: "Example" },
        permissions: { defaultMode: "manual" }
      })
    );

    try {
      process.env.INIT_CWD = dir;
      const result = await runBadockCli(["manifest", "validate", "project.json"]);

      assert.deepEqual(result, {
        exitCode: 0,
        output: 'Manifest valid for project "Example"'
      });
    } finally {
      if (previousInitCwd === undefined) {
        delete process.env.INIT_CWD;
      } else {
        process.env.INIT_CWD = previousInitCwd;
      }
    }
  });

  it("initializes local SQLite storage", async () => {
    const dbPath = join(tempDir(), ".badock", "badock.sqlite");

    const result = await runBadockCli(["storage", "init", dbPath]);

    assert.deepEqual(result, {
      exitCode: 0,
      output: `SQLite storage initialized at ${dbPath}`
    });
  });

  it("scans a project and creates a stack profile", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
    writeFileSync(join(dir, "package-lock.json"), "{}");
    writeFileSync(join(dir, "README.md"), "# Example");

    const scan = await runBadockCli(["project", "scan", dir]);
    const profile = await runBadockCli(["project", "profile", dir]);

    assert.equal(scan.exitCode, 0);
    assert.equal(JSON.parse(scan.output ?? "{}").detectedFiles.packageJson, "package.json");
    assert.equal(profile.exitCode, 0);
    assert.equal(JSON.parse(profile.output ?? "{}").packageManager, "npm");
  });

  it("creates, lists, views and updates local BadocK issues", async () => {
    const dbPath = join(tempDir(), ".badock", "badock.sqlite");
    const storage = createBadockStorage(dbPath);
    storage.createProject({ id: "project-1", name: "Example", rootPath: "C:/repo" });
    storage.close();

    const create = await runBadockCli([
      "issue",
      "create",
      dbPath,
      "--project",
      "project-1",
      "--title",
      "Implement scanner",
      "--objective",
      "Read project facts",
      "--scope",
      "Project Scanner",
      "--agent",
      "stack-agent",
      "--acceptance",
      "Scanner is deterministic",
      "--file",
      "packages/core/src/project.ts"
    ]);

    assert.equal(create.exitCode, 0);
    const issue = JSON.parse(create.output ?? "{}") as { id: string };

    const list = await runBadockCli(["issue", "list", dbPath, "--project", "project-1"]);
    const view = await runBadockCli(["issue", "view", dbPath, issue.id]);
    const update = await runBadockCli([
      "issue",
      "update",
      dbPath,
      issue.id,
      "--state",
      "planned",
      "--acceptance",
      "Scanner is deterministic",
      "--acceptance",
      "Scanner handles missing directories"
    ]);

    assert.equal(JSON.parse(list.output ?? "[]").length, 1);
    assert.equal(JSON.parse(view.output ?? "{}").title, "Implement scanner");
    assert.equal(JSON.parse(update.output ?? "{}").state, "planned");
    assert.deepEqual(JSON.parse(update.output ?? "{}").acceptanceCriteria, [
      "Scanner is deterministic",
      "Scanner handles missing directories"
    ]);
  });

  it("registers local providers and agents", async () => {
    const dbPath = join(tempDir(), ".badock", "badock.sqlite");
    const storage = createBadockStorage(dbPath);
    storage.createProject({ id: "project-1", name: "Example", rootPath: "C:/repo" });
    storage.close();

    const provider = await runBadockCli([
      "provider",
      "register",
      dbPath,
      "--project",
      "project-1",
      "--id",
      "mock",
      "--type",
      "mock",
      "--default-model",
      "mock-planner",
      "--param",
      "temperature=0"
    ]);
    const agent = await runBadockCli([
      "agent",
      "register",
      dbPath,
      "--project",
      "project-1",
      "--id",
      "backend-agent",
      "--role",
      "backend",
      "--provider",
      "mock",
      "--model",
      "mock-planner",
      "--permission",
      "manual",
      "--capability",
      "plan"
    ]);
    const providers = await runBadockCli(["provider", "list", dbPath, "--project", "project-1"]);
    const agents = await runBadockCli(["agent", "list", dbPath, "--project", "project-1"]);

    assert.equal(provider.exitCode, 0);
    assert.equal(JSON.parse(provider.output ?? "{}").parameters.temperature, 0);
    assert.equal(agent.exitCode, 0);
    assert.equal(JSON.parse(agent.output ?? "{}").providerId, "mock");
    assert.equal(JSON.parse(providers.output ?? "[]").length, 1);
    assert.equal(JSON.parse(agents.output ?? "[]").length, 1);
  });

  it("rejects registering an agent without a configured provider", async () => {
    const dbPath = join(tempDir(), ".badock", "badock.sqlite");
    const storage = createBadockStorage(dbPath);
    storage.createProject({ id: "project-1", name: "Example", rootPath: "C:/repo" });
    storage.close();

    const result = await runBadockCli([
      "agent",
      "register",
      dbPath,
      "--project",
      "project-1",
      "--id",
      "backend-agent",
      "--role",
      "backend",
      "--provider",
      "missing",
      "--model",
      "mock-planner"
    ]);

    assert.equal(result.exitCode, 1);
    assert.match(result.error ?? "", /Provider not found/);
  });

  it("rejects invalid local issue creation", async () => {
    const dbPath = join(tempDir(), ".badock", "badock.sqlite");
    const storage = createBadockStorage(dbPath);
    storage.createProject({ id: "project-1", name: "Example", rootPath: "C:/repo" });
    storage.close();

    const result = await runBadockCli([
      "issue",
      "create",
      dbPath,
      "--project",
      "project-1",
      "--title",
      "Invalid",
      "--objective",
      "Missing acceptance"
    ]);

    assert.equal(result.exitCode, 1);
    assert.match(result.error ?? "", /scope/);
  });

  it("creates a persisted RunPlan from a local issue without authorizing execution", async () => {
    const dir = tempDir();
    const dbPath = join(dir, ".badock", "badock.sqlite");
    const storage = createBadockStorage(dbPath);
    const project = storage.createProject({ id: "project-1", name: "Example", rootPath: dir });
    storage.registerProviderProfile({
      id: "mock",
      projectId: project.id,
      type: "mock",
      defaultModel: "mock-planner"
    });
    storage.registerAgentProfile({
      id: "stack-agent",
      projectId: project.id,
      role: "backend",
      providerId: "mock",
      model: "mock-planner",
      permissionMode: "manual"
    });
    const issue = storage.createIssue({
      id: "issue-1",
      projectId: project.id,
      title: "Implement scanner",
      objective: "Read project facts",
      scope: ["Project Scanner"],
      suggestedAgents: ["stack-agent"],
      acceptanceCriteria: ["Scanner is deterministic"],
      files: ["packages/core/src/project.ts"]
    });
    storage.close();

    const result = await runBadockCli(["plan", "create", dbPath, issue.id, "--agent", "stack-agent"]);

    assert.equal(result.exitCode, 0);
    const plan = JSON.parse(result.output ?? "{}");
    assert.equal(plan.issueId, issue.id);
    assert.equal(plan.requiresManualReview, true);
    assert.equal(plan.executionAuthorized, false);
    assert.equal(plan.agentSelection.agentId, "stack-agent");
    assert.equal(plan.providerMetadata.providerId, "mock");
    assert.deepEqual(plan.acceptanceCriteria, ["Scanner is deterministic"]);
  });
});
