#!/usr/bin/env node
import { formatManifestError, loadProjectManifest } from "@badock/config";
import {
  badockVersion,
  createStackProfile,
  generateRunPlan,
  getBadockHealth,
  normalizeLocalIssueInput,
  scanProject
} from "@badock/core";
import { createBadockStorage } from "@badock/storage";

type CommandResult = {
  exitCode: number;
  output?: string;
  error?: string;
};

export async function runBadockCli(argv: string[]): Promise<CommandResult> {
  const [command, subcommand] = argv;

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
    const target = argv[2];
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

  if (command === "project" && subcommand === "scan") {
    const target = argv[2];
    if (!target) {
      return { exitCode: 1, error: "Usage: badock project scan <project-path>" };
    }

    try {
      return { exitCode: 0, output: JSON.stringify(await scanProject(target), null, 2) };
    } catch (error) {
      return { exitCode: 1, error: error instanceof Error ? error.message : String(error) };
    }
  }

  if (command === "project" && subcommand === "profile") {
    const target = argv[2];
    if (!target) {
      return { exitCode: 1, error: "Usage: badock project profile <project-path>" };
    }

    try {
      const scan = await scanProject(target);
      return { exitCode: 0, output: JSON.stringify(createStackProfile(scan), null, 2) };
    } catch (error) {
      return { exitCode: 1, error: error instanceof Error ? error.message : String(error) };
    }
  }

  if (command === "storage" && subcommand === "init") {
    const target = argv[2];
    if (!target) {
      return { exitCode: 1, error: "Usage: badock storage init <db-path>" };
    }

    try {
      const storage = createBadockStorage(target);
      storage.close();
      return { exitCode: 0, output: `SQLite storage initialized at ${target}` };
    } catch (error) {
      return { exitCode: 1, error: error instanceof Error ? error.message : String(error) };
    }
  }

  if (command === "issue") {
    return runIssueCommand(subcommand, argv.slice(2));
  }

  if (command === "plan") {
    return runPlanCommand(subcommand, argv.slice(2));
  }

  return { exitCode: 1, error: `Unknown command: ${argv.join(" ")}` };
}

async function runIssueCommand(subcommand: string | undefined, args: string[]): Promise<CommandResult> {
  const dbPath = args[0];
  if (!subcommand || !dbPath) {
    return { exitCode: 1, error: "Usage: badock issue <create|list|view|update> <db-path> ..." };
  }

  const storage = createBadockStorage(dbPath);
  try {
    if (subcommand === "create") {
      const normalized = normalizeLocalIssueInput({
        title: requireFlag(args, "--title"),
        objective: requireFlag(args, "--objective"),
        scope: readRepeatedFlag(args, "--scope"),
        suggestedAgents: readRepeatedFlag(args, "--agent"),
        acceptanceCriteria: readRepeatedFlag(args, "--acceptance"),
        technicalNotes: readFlag(args, "--notes") ?? "",
        files: readRepeatedFlag(args, "--file")
      });
      const issue = storage.createIssue({
        projectId: requireFlag(args, "--project"),
        ...normalized
      });

      return { exitCode: 0, output: JSON.stringify(issue, null, 2) };
    }

    if (subcommand === "list") {
      const projectId = readFlag(args, "--project") ?? undefined;
      return { exitCode: 0, output: JSON.stringify(storage.listIssues(projectId), null, 2) };
    }

    if (subcommand === "view") {
      const issueId = args[1];
      if (!issueId) {
        return { exitCode: 1, error: "Usage: badock issue view <db-path> <issue-id>" };
      }

      const issue = storage.getIssue(issueId);
      if (!issue) {
        return { exitCode: 1, error: `Issue not found: ${issueId}` };
      }

      return { exitCode: 0, output: JSON.stringify(issue, null, 2) };
    }

    if (subcommand === "update") {
      const issueId = args[1];
      if (!issueId) {
        return { exitCode: 1, error: "Usage: badock issue update <db-path> <issue-id> [fields]" };
      }

      const current = storage.getIssue(issueId);
      if (!current) {
        return { exitCode: 1, error: `Issue not found: ${issueId}` };
      }

      const normalized = normalizeLocalIssueInput({
        title: readFlag(args, "--title") ?? current.title,
        objective: readFlag(args, "--objective") ?? current.objective,
        scope: readRepeatedFlag(args, "--scope", current.scope),
        suggestedAgents: readRepeatedFlag(args, "--agent", current.suggestedAgents),
        acceptanceCriteria: readRepeatedFlag(args, "--acceptance", current.acceptanceCriteria),
        technicalNotes: readFlag(args, "--notes") ?? current.technicalNotes,
        files: readRepeatedFlag(args, "--file", current.files),
        state: (readFlag(args, "--state") as typeof current.state | null) ?? current.state
      });
      const issue = storage.updateIssue(issueId, normalized);

      return { exitCode: 0, output: JSON.stringify(issue, null, 2) };
    }

    return { exitCode: 1, error: `Unknown issue command: ${subcommand}` };
  } catch (error) {
    return { exitCode: 1, error: error instanceof Error ? error.message : String(error) };
  } finally {
    storage.close();
  }
}

async function runPlanCommand(subcommand: string | undefined, args: string[]): Promise<CommandResult> {
  const dbPath = args[0];
  if (subcommand !== "create" || !dbPath) {
    return { exitCode: 1, error: "Usage: badock plan create <db-path> <issue-id>" };
  }

  const issueId = args[1];
  if (!issueId) {
    return { exitCode: 1, error: "Usage: badock plan create <db-path> <issue-id>" };
  }

  const storage = createBadockStorage(dbPath);
  try {
    const issue = storage.getIssue(issueId);
    if (!issue) {
      return { exitCode: 1, error: `Issue not found: ${issueId}` };
    }

    const profile = storage.getLatestStackProfile(issue.projectId);
    const stackProfile = profile ? JSON.parse(profile.profileJson) : undefined;
    const plan = generateRunPlan({
      projectId: issue.projectId,
      issueId: issue.id,
      issue,
      stackProfile
    });
    const record = storage.createRunPlan(plan);

    return { exitCode: 0, output: JSON.stringify(record, null, 2) };
  } catch (error) {
    return { exitCode: 1, error: error instanceof Error ? error.message : String(error) };
  } finally {
    storage.close();
  }
}

function readFlag(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }

  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function requireFlag(args: string[], name: string): string {
  const value = readFlag(args, name);
  if (!value) {
    throw new Error(`Missing required flag: ${name}`);
  }
  return value;
}

function readRepeatedFlag(args: string[], name: string, fallback: string[] = []): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name) {
      const value = args[index + 1];
      if (value && !value.startsWith("--")) {
        values.push(value);
      }
    }
  }

  return values.length > 0 ? values : fallback;
}

function usage(): string {
  return [
    "BadocK CLI",
    "",
    "Commands:",
    "  badock health",
    "  badock version",
    "  badock project scan <project-path>",
    "  badock project profile <project-path>",
    "  badock manifest validate <path>",
    "  badock storage init <db-path>",
    "  badock issue create <db-path> --project <project-id> --title <title> --objective <objective> --scope <item> --agent <id> --acceptance <item>",
    "  badock issue list <db-path> [--project <project-id>]",
    "  badock issue view <db-path> <issue-id>",
    "  badock issue update <db-path> <issue-id> [fields]",
    "  badock plan create <db-path> <issue-id>"
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
