import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  createStackProfile,
  generateRunPlan,
  getBadockHealth,
  normalizeLocalIssueInput,
  scanProject
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
});
