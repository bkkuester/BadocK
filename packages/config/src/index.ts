import { readFile } from "node:fs/promises";
import { z } from "zod";

const permissionModeSchema = z.enum(["manual", "supervised", "autonomous"]);

const sensitiveKeyPattern =
  /(?:secret|token|api[-_]?key|access[-_]?key|password|credential|private[-_]?key|authorization|bearer)/i;
const allowedSensitivePolicyKeys = new Set([
  "allowModifySecrets",
  "allowSecretChanges",
  "sensitiveFiles",
  "secretPolicy"
]);
const providerTypeSchema = z.enum(["mock", "openai-compatible", "local-process", "custom"]);
const providerParameterSchema = z.union([z.string().min(1), z.number(), z.boolean()]);

const stackSchema = z
  .object({
    language: z.string().min(1).optional(),
    languages: z.array(z.string().min(1)).default([]),
    runtime: z.string().min(1).nullable().optional(),
    packageManager: z.string().min(1).nullable().optional(),
    frameworks: z.array(z.string().min(1)).default([]),
    testCommands: z.array(z.string().min(1)).default([]),
    buildCommands: z.array(z.string().min(1)).default([])
  })
  .default({
    languages: [],
    frameworks: [],
    testCommands: [],
    buildCommands: []
  });

const providerSchema = z.object({
  id: z.string().min(1),
  type: providerTypeSchema,
  endpoint: z.string().url().optional(),
  defaultModel: z.string().min(1).optional(),
  parameters: z.record(providerParameterSchema).default({})
});

const agentProfileSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  permissionMode: permissionModeSchema,
  capabilities: z.array(z.string().min(1)).default([]),
  labels: z.array(z.string().min(1)).default([]),
  prompt: z.string().min(1).optional(),
  paths: z.array(z.string().min(1)).default([])
});

const agentsSchema = z
  .union([
    z.array(agentProfileSchema),
    z.object({
      registryFile: z.string().min(1).default(".badock/agents.json"),
      defaultSelectionMode: z.enum(["explicit"]).default("explicit"),
      profiles: z.array(agentProfileSchema).default([])
    })
  ])
  .default({
    registryFile: ".badock/agents.json",
    defaultSelectionMode: "explicit",
    profiles: []
  });

export const projectManifestSchema = z
  .object({
    schemaVersion: z.literal(1).optional(),
    version: z.literal(1).optional(),
    project: z.object({
      name: z.string().min(1),
      productName: z.string().min(1).optional(),
      type: z.string().min(1).optional(),
      description: z.string().min(1).optional(),
      root: z.string().min(1).optional()
    }),
    stack: stackSchema,
    vcs: z
      .object({
        type: z.literal("git").default("git"),
        defaultBranch: z.string().min(1).default("main"),
        worktreeBaseDir: z.string().min(1).default("../worktrees"),
        allowMainExecution: z.boolean().default(false)
      })
      .default({
        type: "git",
        defaultBranch: "main",
        worktreeBaseDir: "../worktrees",
        allowMainExecution: false
      }),
    github: z
      .object({
        enabled: z.boolean().default(false),
        owner: z.string().min(1).optional(),
        repo: z.string().min(1).optional(),
        issues: z.boolean().default(false),
        pullRequests: z.boolean().default(false)
      })
      .default({ enabled: false, issues: false, pullRequests: false }),
    providers: z.array(providerSchema).default([]),
    agents: agentsSchema,
    permissions: z
      .object({
        mode: permissionModeSchema.optional(),
        defaultMode: permissionModeSchema.default("manual"),
        allowCommands: z.array(z.string().min(1)).default([]),
        allowedCommands: z.array(z.string().min(1)).default([]),
        sensitiveFiles: z.array(z.string().min(1)).default([".env", ".env.*"]),
        allowNetwork: z.boolean().default(false),
        allowCommit: z.boolean().default(false),
        allowPush: z.boolean().default(false),
        allowOpenPr: z.boolean().default(false),
        allowPullRequest: z.boolean().default(false),
        allowInstallDependencies: z.boolean().default(false),
        allowDependencyInstall: z.boolean().default(false),
        allowModifySecrets: z.boolean().default(false),
        allowSecretChanges: z.boolean().default(false),
        allowMainExecution: z.boolean().default(false)
      })
      .default({
        mode: "manual",
        defaultMode: "manual",
        allowCommands: [],
        allowedCommands: [],
        sensitiveFiles: [".env", ".env.*"],
        allowNetwork: false,
        allowCommit: false,
        allowPush: false,
        allowOpenPr: false,
        allowPullRequest: false,
        allowInstallDependencies: false,
        allowDependencyInstall: false,
        allowModifySecrets: false,
        allowSecretChanges: false,
        allowMainExecution: false
      }),
    runs: z
      .object({
        directory: z.string().min(1).default(".badock/runs"),
        ignoreRunArtifactsInGit: z.boolean().default(true)
      })
      .default({ directory: ".badock/runs", ignoreRunArtifactsInGit: true }),
    cost: z
      .object({
        tracking: z.enum(["not_available", "estimated", "reported_by_provider", "manual"]).default("estimated"),
        currency: z.string().min(1).default("USD"),
        budgetPerRun: z.number().nonnegative().nullable().default(null)
      })
      .default({ tracking: "estimated", currency: "USD", budgetPerRun: null })
  })
  .strict()
  .superRefine((value, context) => {
    if (value.schemaVersion !== 1 && value.version !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schemaVersion"],
        message: "schemaVersion or version must be 1"
      });
    }
    visitManifestKeys(value, [], (path, key) => {
      if (sensitiveKeyPattern.test(key) && !allowedSensitivePolicyKeys.has(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `Sensitive field "${key}" is not allowed in versioned BadocK manifests`
        });
      }
    });
    assertUniqueIds(
      value.providers.map((provider) => provider.id),
      "providers",
      context
    );
    const agents = getManifestAgentProfiles(value);
    assertUniqueIds(
      agents.map((agent) => agent.id),
      "agents",
      context
    );

    const providerIds = new Set(value.providers.map((provider) => provider.id));
    agents.forEach((agent, index) => {
      if (!providerIds.has(agent.provider)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["agents", index, "provider"],
          message: `Agent "${agent.id}" references unconfigured provider "${agent.provider}"`
        });
      }
    });
  });

export type ProjectManifest = z.infer<typeof projectManifestSchema>;
export type ManifestAgentProfile = z.infer<typeof agentProfileSchema>;

export function parseProjectManifest(input: unknown): ProjectManifest {
  assertNoSensitiveKeys(input);
  return projectManifestSchema.parse(input);
}

export async function loadProjectManifest(filePath: string): Promise<ProjectManifest> {
  const raw = await readFile(filePath, "utf8");
  return parseProjectManifest(JSON.parse(raw));
}

export function formatManifestError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
        return `${path}: ${issue.message}`;
      })
      .join("\n");
  }

  if (error instanceof SyntaxError) {
    return `Invalid JSON: ${error.message}`;
  }

  return error instanceof Error ? error.message : String(error);
}

export function getManifestAgentProfiles(manifest: ProjectManifest): ManifestAgentProfile[] {
  return Array.isArray(manifest.agents) ? manifest.agents : manifest.agents.profiles;
}

export function getManifestPermissionMode(manifest: ProjectManifest): "manual" | "supervised" | "autonomous" {
  return manifest.permissions.mode ?? manifest.permissions.defaultMode;
}

export function getManifestAllowedCommands(manifest: ProjectManifest): string[] {
  return Array.from(
    new Set([...(manifest.permissions.allowCommands ?? []), ...(manifest.permissions.allowedCommands ?? [])])
  );
}

function visitManifestKeys(
  value: unknown,
  path: Array<string | number>,
  onKey: (path: Array<string | number>, key: string) => void
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitManifestKeys(item, [...path, index], onKey));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const nestedPath = [...path, key];
    onKey(nestedPath, key);
    visitManifestKeys(nestedValue, nestedPath, onKey);
  }
}

function assertNoSensitiveKeys(input: unknown): void {
  visitManifestKeys(input, [], (path, key) => {
    if (sensitiveKeyPattern.test(key) && !allowedSensitivePolicyKeys.has(key)) {
      const fieldPath = path.join(".");
      throw new Error(`Sensitive field "${key}" is not allowed in versioned BadocK manifests at ${fieldPath}`);
    }
  });
}

function assertUniqueIds(ids: string[], fieldName: string, context: z.RefinementCtx): void {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (seen.has(id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [fieldName, index, "id"],
        message: `Duplicate ${fieldName} id "${id}"`
      });
      return;
    }
    seen.add(id);
  });
}
