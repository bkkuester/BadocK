export const permissionModes = ["manual", "supervised", "autonomous"] as const;

export type PermissionMode = (typeof permissionModes)[number];

export const operationalActions = [
  "read_files",
  "edit_files",
  "run_command",
  "run_test",
  "install_dependency",
  "alter_config",
  "modify_secret",
  "commit",
  "push",
  "open_pr",
  "execute_on_main",
  "network_access"
] as const;

export type OperationalAction = (typeof operationalActions)[number];

export type PermissionDecision = "allow" | "ask" | "deny";

export type PermissionDecisionRecord = {
  action: OperationalAction;
  mode: PermissionMode;
  decision: PermissionDecision;
  reason: string;
  requiresUserDecision: boolean;
};

export type PermissionConfig = {
  mode: PermissionMode;
  allowCommands: string[];
  scopedPaths: string[];
  sensitiveFiles: string[];
  allowNetwork: boolean;
  allowCommit: boolean;
  allowPush: boolean;
  allowPullRequest: boolean;
  allowMainExecution: boolean;
  allowDependencyInstall: boolean;
  allowConfigChanges: boolean;
  allowSecretChanges: boolean;
};

export type PermissionConfigInput = Partial<PermissionConfig> & {
  defaultMode?: PermissionMode;
};

export type PermissionEvaluationInput = {
  action: OperationalAction;
  projectConfig?: PermissionConfigInput;
  runConfig?: PermissionConfigInput;
  command?: string;
  targetPath?: string;
  currentBranch?: string | null;
  isTestCommand?: boolean;
};

const defaultSensitiveFiles = [".env", ".env.*"];

export function resolvePermissionConfig(
  projectConfig: PermissionConfigInput = {},
  runConfig: PermissionConfigInput = {}
): PermissionConfig {
  const mode = runConfig.mode ?? runConfig.defaultMode ?? projectConfig.mode ?? projectConfig.defaultMode ?? "manual";

  return {
    mode,
    allowCommands: [...(projectConfig.allowCommands ?? []), ...(runConfig.allowCommands ?? [])],
    scopedPaths: [...(projectConfig.scopedPaths ?? []), ...(runConfig.scopedPaths ?? [])],
    sensitiveFiles: [...(projectConfig.sensitiveFiles ?? defaultSensitiveFiles), ...(runConfig.sensitiveFiles ?? [])],
    allowNetwork: runConfig.allowNetwork ?? projectConfig.allowNetwork ?? false,
    allowCommit: runConfig.allowCommit ?? projectConfig.allowCommit ?? false,
    allowPush: runConfig.allowPush ?? projectConfig.allowPush ?? false,
    allowPullRequest: runConfig.allowPullRequest ?? projectConfig.allowPullRequest ?? false,
    allowMainExecution: runConfig.allowMainExecution ?? projectConfig.allowMainExecution ?? false,
    allowDependencyInstall: runConfig.allowDependencyInstall ?? projectConfig.allowDependencyInstall ?? false,
    allowConfigChanges: runConfig.allowConfigChanges ?? projectConfig.allowConfigChanges ?? false,
    allowSecretChanges: runConfig.allowSecretChanges ?? projectConfig.allowSecretChanges ?? false
  };
}

export function evaluatePermission(input: PermissionEvaluationInput): PermissionDecisionRecord {
  const config = resolvePermissionConfig(input.projectConfig, input.runConfig);

  if (input.action === "execute_on_main" && !config.allowMainExecution) {
    return deny(input.action, config.mode, "Execution on main is blocked by default");
  }

  if (isMainBranch(input.currentBranch) && isExecutionAction(input.action) && !config.allowMainExecution) {
    return deny(input.action, config.mode, "Agent execution on main is blocked by default");
  }

  if (config.mode === "manual") {
    return evaluateManualMode(input, config);
  }

  if (config.mode === "supervised") {
    return evaluateSupervisedMode(input, config);
  }

  return evaluateAutonomousMode(input, config);
}

export function formatPermissionDecision(decision: PermissionDecisionRecord): string {
  return `${decision.action}: ${decision.decision} (${decision.mode}) - ${decision.reason}`;
}

function evaluateManualMode(input: PermissionEvaluationInput, config: PermissionConfig): PermissionDecisionRecord {
  if (input.action === "read_files") {
    return allow(input.action, config.mode, "Manual mode allows reading files");
  }

  return ask(input.action, config.mode, "Manual mode requires user confirmation for this action");
}

function evaluateSupervisedMode(input: PermissionEvaluationInput, config: PermissionConfig): PermissionDecisionRecord {
  if (input.action === "read_files") {
    return allow(input.action, config.mode, "Supervised mode allows reading files");
  }

  if (input.action === "edit_files") {
    if (isSensitivePath(input.targetPath, config.sensitiveFiles)) {
      return ask(input.action, config.mode, "Editing sensitive files requires user confirmation");
    }
    if (!isPathInScope(input.targetPath, config.scopedPaths)) {
      return deny(input.action, config.mode, "Editing outside the run scope is blocked");
    }
    return allow(input.action, config.mode, "Supervised mode allows editing files inside scope");
  }

  if (input.action === "run_test") {
    return allow(input.action, config.mode, "Supervised mode allows running tests");
  }

  if (input.action === "run_command") {
    if (commandAllowed(input.command, config.allowCommands) || input.isTestCommand) {
      return allow(input.action, config.mode, "Command is allowed by project/run policy");
    }
    return ask(input.action, config.mode, "Unlisted commands require user confirmation");
  }

  if (input.action === "network_access") {
    return config.allowNetwork
      ? allow(input.action, config.mode, "Network access is allowed by policy")
      : ask(input.action, config.mode, "Network access requires user confirmation");
  }

  return ask(input.action, config.mode, "Sensitive action requires user confirmation");
}

function evaluateAutonomousMode(input: PermissionEvaluationInput, config: PermissionConfig): PermissionDecisionRecord {
  if (input.action === "read_files") {
    return allow(input.action, config.mode, "Autonomous mode allows reading files");
  }

  if (input.action === "edit_files") {
    if (isSensitivePath(input.targetPath, config.sensitiveFiles)) {
      return deny(input.action, config.mode, "Autonomous mode cannot edit sensitive files without explicit capability");
    }
    if (!isPathInScope(input.targetPath, config.scopedPaths)) {
      return deny(input.action, config.mode, "Autonomous mode cannot edit outside scope");
    }
    return allow(input.action, config.mode, "Autonomous mode allows editing files inside scope");
  }

  if (input.action === "run_test" || input.action === "run_command") {
    return commandAllowed(input.command, config.allowCommands) || (!input.command && input.action === "run_test")
      ? allow(input.action, config.mode, "Command is allowlisted")
      : deny(input.action, config.mode, "Autonomous mode only runs allowlisted commands");
  }

  if (input.action === "install_dependency") {
    return config.allowDependencyInstall
      ? allow(input.action, config.mode, "Dependency installation is explicitly enabled")
      : deny(input.action, config.mode, "Dependency installation is not explicitly enabled");
  }

  if (input.action === "alter_config") {
    return config.allowConfigChanges
      ? allow(input.action, config.mode, "Config changes are explicitly enabled")
      : deny(input.action, config.mode, "Config changes are not explicitly enabled");
  }

  if (input.action === "modify_secret") {
    return config.allowSecretChanges
      ? allow(input.action, config.mode, "Secret changes are explicitly enabled")
      : deny(input.action, config.mode, "Secret changes are not explicitly enabled");
  }

  if (input.action === "commit") {
    return config.allowCommit
      ? allow(input.action, config.mode, "Commit is explicitly enabled")
      : deny(input.action, config.mode, "Commit is not explicitly enabled");
  }

  if (input.action === "push") {
    return config.allowPush
      ? allow(input.action, config.mode, "Push is explicitly enabled")
      : deny(input.action, config.mode, "Push is not explicitly enabled");
  }

  if (input.action === "open_pr") {
    return config.allowPullRequest
      ? allow(input.action, config.mode, "Pull request creation is explicitly enabled")
      : deny(input.action, config.mode, "Pull request creation is not explicitly enabled");
  }

  if (input.action === "network_access") {
    return config.allowNetwork
      ? allow(input.action, config.mode, "Network access is explicitly enabled")
      : deny(input.action, config.mode, "Network access is not explicitly enabled");
  }

  return deny(input.action, config.mode, "Action is not enabled for autonomous mode");
}

function allow(action: OperationalAction, mode: PermissionMode, reason: string): PermissionDecisionRecord {
  return {
    action,
    mode,
    decision: "allow",
    reason,
    requiresUserDecision: false
  };
}

function ask(action: OperationalAction, mode: PermissionMode, reason: string): PermissionDecisionRecord {
  return {
    action,
    mode,
    decision: "ask",
    reason,
    requiresUserDecision: true
  };
}

function deny(action: OperationalAction, mode: PermissionMode, reason: string): PermissionDecisionRecord {
  return {
    action,
    mode,
    decision: "deny",
    reason,
    requiresUserDecision: false
  };
}

function commandAllowed(command: string | undefined, allowCommands: string[]): boolean {
  if (!command) {
    return false;
  }
  const normalized = command.trim();
  return allowCommands.some((allowed) => allowed.trim() === normalized);
}

function isPathInScope(targetPath: string | undefined, scopedPaths: string[]): boolean {
  if (!targetPath) {
    return scopedPaths.length === 0;
  }
  if (scopedPaths.length === 0) {
    return false;
  }
  const normalized = normalizePath(targetPath);
  return scopedPaths.some((scope) => {
    const normalizedScope = normalizePath(scope);
    return normalized === normalizedScope || normalized.startsWith(`${normalizedScope}/`);
  });
}

function isSensitivePath(targetPath: string | undefined, sensitiveFiles: string[]): boolean {
  if (!targetPath) {
    return false;
  }
  const normalized = normalizePath(targetPath).split("/").pop() ?? normalizePath(targetPath);
  return sensitiveFiles.some((pattern) => wildcardMatch(normalized, pattern.toLowerCase()));
}

function wildcardMatch(value: string, pattern: string): boolean {
  if (!pattern.includes("*")) {
    return value.toLowerCase() === pattern;
  }
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "").toLowerCase();
}

function isMainBranch(branch: string | null | undefined): boolean {
  return branch === "main" || branch === "master";
}

function isExecutionAction(action: OperationalAction): boolean {
  return action === "run_command" || action === "run_test" || action === "execute_on_main";
}
