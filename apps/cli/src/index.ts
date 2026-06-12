#!/usr/bin/env node
import { formatManifestError, loadProjectManifest } from "@badock/config";
import { badockVersion, getBadockHealth } from "@badock/core";

type CommandResult = {
  exitCode: number;
  output?: string;
  error?: string;
};

export async function runBadockCli(argv: string[]): Promise<CommandResult> {
  const [command, subcommand, target] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { exitCode: 0, output: usage() };
  }

  if (command === "--version" || command === "-v" || command === "version") {
    return { exitCode: 0, output: badockVersion };
  }

  if (command === "health") {
    return { exitCode: 0, output: JSON.stringify(getBadockHealth(), null, 2) };
  }

  if (command === "manifest" && subcommand === "validate") {
    if (!target) {
      return { exitCode: 1, error: "Usage: badock manifest validate <path>" };
    }

    try {
      const manifest = await loadProjectManifest(target);
      return {
        exitCode: 0,
        output: `Manifest valid for project "${manifest.project.name}"`
      };
    } catch (error) {
      return { exitCode: 1, error: formatManifestError(error) };
    }
  }

  if (command === "storage" && subcommand === "init") {
    if (!target) {
      return { exitCode: 1, error: "Usage: badock storage init <db-path>" };
    }

    try {
      const { createBadockStorage } = await import("@badock/storage");
      const storage = createBadockStorage(target);
      storage.close();
      return { exitCode: 0, output: `SQLite storage initialized at ${target}` };
    } catch (error) {
      return { exitCode: 1, error: error instanceof Error ? error.message : String(error) };
    }
  }

  return { exitCode: 1, error: `Unknown command: ${argv.join(" ")}` };
}

function usage(): string {
  return [
    "BadocK CLI",
    "",
    "Commands:",
    "  badock health",
    "  badock version",
    "  badock manifest validate <path>",
    "  badock storage init <db-path>"
  ].join("\n");
}

async function main(): Promise<void> {
  const result = await runBadockCli(process.argv.slice(2));

  if (result.output) {
    console.log(result.output);
  }

  if (result.error) {
    console.error(result.error);
  }

  process.exitCode = result.exitCode;
}

if (require.main === module) {
  void main();
}
