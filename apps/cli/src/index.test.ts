import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { runBadockCli } from "./index";

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

  it("initializes local SQLite storage", async () => {
    const dbPath = join(tempDir(), ".badock", "badock.sqlite");

    const result = await runBadockCli(["storage", "init", dbPath]);

    assert.deepEqual(result, {
      exitCode: 0,
      output: `SQLite storage initialized at ${dbPath}`
    });
  });
});
