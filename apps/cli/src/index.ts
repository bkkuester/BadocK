#!/usr/bin/env node
import { isAbsolute, resolve } from "node:path";
import { formatManifestError, loadProjectManifest } from "@badock/config";
import {
  type AgentProfile,
  badockVersion,
  createStackProfile,
  generateRunPlan,
  getBadockHealth,
  normalizeLocalIssueInput,
  normalizeProviderConfig,
  permissionModes,
  type PermissionMode,
  providerTypes,
  type ProviderPublicConfig,
  type ProviderType,
  sanitizeForPublicOutput,
  sanitizeSensitiveText,
  scanProject
} from "@badock/core";
import { createBadockStorage, type AgentProfileRecord, type ProviderProfileRecord } from "@badock/storage";

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
    return { exitCode: 0, output: jsonOutput(getBadockHealth()) };
  }

  if (command === "manifest" && subcommand === "validate") {
    const target = argv[2];
    if (!target) {
      return { exitCode: 1, error: "Usage: badock manifest validate <path>" };
    }

    try {
      const manifest = await loadProjectManifest(resolveCliPath(target));
      return {
        exitCode: 0,
        output: sanitizeSensitiveText(`Manifest valid for project "${manifest.project.name}"`)
      };
    } catch (error) {
      return { exitCode: 1, error: safeErrorMessage(formatManifestError(error)) };
    }
  }

  if (command === "project" && subcommand === "scan") {
    const target = argv[2];
    if (!target) {
      return { exitCode: 1, error: "Usage: badock project scan <project-path>" };
    }

    try {
      return { exitCode: 0, output: jsonOutput(await scanProject(resolveCliPath(target))) };
    } catch (error) {
      return { exitCode: 1, error: safeErrorMessage(error) };
    }
  }

  if (command === "project" && subcommand === "profile") {
    if (argv[2] === "save") {
      const dbPath = argv[3];
      const projectId = argv[4];
      const target = argv[5];
      if (!dbPath || !projectId || !target) {
        return { exitCode: 1, error: "Usage: badock project profile save <db-path> <project-id> <project-path>" };
      }

      const storage = createBadockStorage(resolveCliPath(dbPath));
      try {
        const scan = await scanProject(resolveCliPath(target));
        const record = storage.saveStackProfile({
          projectId,
          profile: createStackProfile(scan)
        });
        return { exitCode: 0, output: jsonOutput(record) };
      } catch (error) {
        return { exitCode: 1, error: safeErrorMessage(error) };
      } finally {
        storage.close();
      }
    }

    const target = argv[2];
    if (!target) {
      return { exitCode: 1, error: "Usage: badock project profile <project-path>" };
    }

    try {
      const scan = await scanProject(resolveCliPath(target));
      return { exitCode: 0, output: jsonOutput(createStackProfile(scan)) };
    } catch (error) {
      return { exitCode: 1, error: safeErrorMessage(error) };
    }
  }

  if (command === "storage" && subcommand === "init") {
    const target = argv[2];
    if (!target) {
      return { exitCode: 1, error: "Usage: badock storage init <db-path>" };
    }

    try {
      const storage = createBadockStorage(resolveCliPath(target));
      storage.close();
      return { exitCode: 0, output: sanitizeSensitiveText(`SQLite storage initialized at ${target}`) };
    } catch (error) {
      return { exitCode: 1, error: safeErrorMessage(error) };
    }
  }

  if (command === "provider") {
    return runProviderCommand(subcommand, argv.slice(2));
  }

  if (command === "agent") {
    return runAgentCommand(subcommand, argv.slice(2));
  }

  if (command === "issue") {
    return runIssueCommand(subcommand, argv.slice(2));
  }

  if (command === "plan") {
    return runPlanCommand(subcommand, argv.slice(2));
  }

  return { exitCode: 1, error: sanitizeSensitiveText(`Unknown command: ${argv.join(" ")}`) };
}

async function runIssueCommand(subcommand: string | undefined, args: string[]): Promise<CommandResult> {
  const dbPath = args[0];
  if (!subcommand || !dbPath) {
    return { exitCode: 1, error: "Usage: badock issue <create|list|view|update> <db-path> ..." };
  }

  const storage = createBadockStorage(resolveCliPath(dbPath));
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

      return { exitCode: 0, output: jsonOutput(issue) };
    }

    if (subcommand === "list") {
      const projectId = readFlag(args, "--project") ?? undefined;
      return { exitCode: 0, output: jsonOutput(storage.listIssues(projectId)) };
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

      return { exitCode: 0, output: jsonOutput(issue) };
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

      return { exitCode: 0, output: jsonOutput(issue) };
    }

    return { exitCode: 1, error: sanitizeSensitiveText(`Unknown issue command: ${subcommand}`) };
  } catch (error) {
    return { exitCode: 1, error: safeErrorMessage(error) };
  } finally {
    storage.close();
  }
}

async function runProviderCommand(subcommand: string | undefined, args: string[]): Promise<CommandResult> {
  const dbPath = args[0];
  if (!subcommand || !dbPath) {
    return { exitCode: 1, error: "Usage: badock provider <register|list|view> <db-path> ..." };
  }

  const storage = createBadockStorage(resolveCliPath(dbPath));
  try {
    if (subcommand === "register") {
      const provider = normalizeProviderConfig({
        id: requireFlag(args, "--id"),
        type: readProviderType(requireFlag(args, "--type")),
        endpoint: readFlag(args, "--endpoint") ?? undefined,
        defaultModel: readFlag(args, "--default-model") ?? undefined,
        parameters: readKeyValueFlags(args, "--param")
      });
      const record = storage.registerProviderProfile({
        projectId: requireFlag(args, "--project"),
        ...provider
      });
      return { exitCode: 0, output: jsonOutput(record) };
    }

    if (subcommand === "list") {
      const projectId = requireFlag(args, "--project");
      return { exitCode: 0, output: jsonOutput(storage.listProviderProfiles(projectId)) };
    }

    if (subcommand === "view") {
      const projectId = requireFlag(args, "--project");
      const providerId = args[1];
      if (!providerId) {
        return { exitCode: 1, error: "Usage: badock provider view <db-path> <provider-id> --project <project-id>" };
      }
      const provider = storage.getProviderProfile(projectId, providerId);
      if (!provider) {
        return { exitCode: 1, error: `Provider not found: ${providerId}` };
      }
      return { exitCode: 0, output: jsonOutput(provider) };
    }

    return { exitCode: 1, error: sanitizeSensitiveText(`Unknown provider command: ${subcommand}`) };
  } catch (error) {
    return { exitCode: 1, error: safeErrorMessage(error) };
  } finally {
    storage.close();
  }
}

async function runAgentCommand(subcommand: string | undefined, args: string[]): Promise<CommandResult> {
  const dbPath = args[0];
  if (!subcommand || !dbPath) {
    return { exitCode: 1, error: "Usage: badock agent <register|list|view> <db-path> ..." };
  }

  const storage = createBadockStorage(resolveCliPath(dbPath));
  try {
    if (subcommand === "register") {
      const projectId = requireFlag(args, "--project");
      const providerId = requireFlag(args, "--provider");
      if (!storage.getProviderProfile(projectId, providerId)) {
        return { exitCode: 1, error: `Provider not found for agent: ${providerId}` };
      }

      const record = storage.registerAgentProfile({
        projectId,
        id: requireFlag(args, "--id"),
        role: requireFlag(args, "--role"),
        providerId,
        model: requireFlag(args, "--model"),
        permissionMode: readPermissionMode(readFlag(args, "--permission") ?? "manual"),
        capabilities: readRepeatedFlag(args, "--capability")
      });
      return { exitCode: 0, output: jsonOutput(record) };
    }

    if (subcommand === "list") {
      const projectId = requireFlag(args, "--project");
      return { exitCode: 0, output: jsonOutput(storage.listAgentProfiles(projectId)) };
    }

    if (subcommand === "view") {
      const projectId = requireFlag(args, "--project");
      const agentId = args[1];
      if (!agentId) {
        return { exitCode: 1, error: "Usage: badock agent view <db-path> <agent-id> --project <project-id>" };
      }
      const agent = storage.getAgentProfile(projectId, agentId);
      if (!agent) {
        return { exitCode: 1, error: `Agent not found: ${agentId}` };
      }
      return { exitCode: 0, output: jsonOutput(agent) };
    }

    return { exitCode: 1, error: sanitizeSensitiveText(`Unknown agent command: ${subcommand}`) };
  } catch (error) {
    return { exitCode: 1, error: safeErrorMessage(error) };
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

  const storage = createBadockStorage(resolveCliPath(dbPath));
  try {
    const issue = storage.getIssue(issueId);
    if (!issue) {
      return { exitCode: 1, error: `Issue not found: ${issueId}` };
    }

    const profile = storage.getLatestStackProfile(issue.projectId);
    const stackProfile = profile ? JSON.parse(profile.profileJson) : undefined;
    const agents = storage.listAgentProfiles(issue.projectId).map(agentRecordToProfile);
    const providers = storage.listProviderProfiles(issue.projectId).map(providerRecordToConfig);
    const plan = generateRunPlan({
      projectId: issue.projectId,
      issueId: issue.id,
      issue,
      stackProfile,
      agents,
      providers,
      selectedAgentId: readFlag(args, "--agent") ?? undefined
    });
    const record = storage.createRunPlan(plan);

    return { exitCode: 0, output: jsonOutput(record) };
  } catch (error) {
    return { exitCode: 1, error: safeErrorMessage(error) };
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

function readKeyValueFlags(args: string[], name: string): Record<string, string | number | boolean> {
  const values: Record<string, string | number | boolean> = {};
  for (const item of readRepeatedFlag(args, name)) {
    const separator = item.indexOf("=");
    if (separator === -1) {
      throw new Error(`${name} must use key=value`);
    }
    const key = item.slice(0, separator).trim();
    const rawValue = item.slice(separator + 1).trim();
    if (!key || !rawValue) {
      throw new Error(`${name} must use key=value`);
    }
    values[key] = parseParameterValue(rawValue);
  }
  return values;
}

function parseParameterValue(value: string): string | number | boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) && value.trim() !== "" ? numeric : value;
}

function readProviderType(value: string): ProviderType {
  if (providerTypes.includes(value as ProviderType)) {
    return value as ProviderType;
  }
  throw new Error(`Invalid provider type: ${value}`);
}

function readPermissionMode(value: string): PermissionMode {
  if (permissionModes.includes(value as PermissionMode)) {
    return value as PermissionMode;
  }
  throw new Error(`Invalid permission mode: ${value}`);
}

function providerRecordToConfig(record: ProviderProfileRecord): ProviderPublicConfig {
  return {
    id: record.id,
    type: record.type,
    endpoint: record.endpoint ?? undefined,
    defaultModel: record.defaultModel ?? undefined,
    parameters: record.parameters
  };
}

function agentRecordToProfile(record: AgentProfileRecord): AgentProfile {
  return {
    id: record.id,
    role: record.role,
    providerId: record.providerId,
    model: record.model,
    permissionMode: record.permissionMode,
    capabilities: record.capabilities
  };
}

function jsonOutput(value: unknown): string {
  return JSON.stringify(sanitizeForPublicOutput(value), null, 2);
}

function safeErrorMessage(error: unknown): string {
  return sanitizeSensitiveText(error instanceof Error ? error.message : String(error));
}

function resolveCliPath(inputPath: string): string {
  if (isAbsolute(inputPath)) {
    return inputPath;
  }
  return resolve(process.env.INIT_CWD ?? process.cwd(), inputPath);
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
    "  badock project profile save <db-path> <project-id> <project-path>",
    "  badock manifest validate <path>",
    "  badock storage init <db-path>",
    "  badock provider register <db-path> --project <project-id> --id <provider-id> --type <mock|openai-compatible|local-process|custom> [--endpoint <url>] [--default-model <model>] [--param key=value]",
    "  badock provider list <db-path> --project <project-id>",
    "  badock provider view <db-path> <provider-id> --project <project-id>",
    "  badock agent register <db-path> --project <project-id> --id <agent-id> --role <role> --provider <provider-id> --model <model> [--permission <mode>] [--capability <item>]",
    "  badock agent list <db-path> --project <project-id>",
    "  badock agent view <db-path> <agent-id> --project <project-id>",
    "  badock issue create <db-path> --project <project-id> --title <title> --objective <objective> --scope <item> --agent <id> --acceptance <item>",
    "  badock issue list <db-path> [--project <project-id>]",
    "  badock issue view <db-path> <issue-id>",
    "  badock issue update <db-path> <issue-id> [fields]",
    "  badock plan create <db-path> <issue-id> [--agent <agent-id>]"
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
