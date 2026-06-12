import { readFile } from "node:fs/promises";
import { z } from "zod";

const permissionModeSchema = z.enum(["manual", "supervised", "autonomous"]);

const sensitiveKeyPattern =
  /(?:secret|token|api[-_]?key|access[-_]?key|password|credential|private[-_]?key|authorization|bearer)/i;
const providerTypeSchema = z.enum(["mock", "openai-compatible", "local-process", "custom"]);
const providerParameterSchema = z.union([z.string().min(1), z.number(), z.boolean()]);

export const projectManifestSchema = z
  .object({
    version: z.literal(1),
    project: z.object({
      name: z.string().min(1),
      description: z.string().min(1).optional(),
      root: z.string().min(1).optional()
    }),
    stack: z
      .object({
        language: z.string().min(1).optional(),
        runtime: z.string().min(1).optional(),
        packageManager: z.string().min(1).optional(),
        frameworks: z.array(z.string().min(1)).default([])
      })
      .default({ frameworks: [] }),
    providers: z
      .array(
        z.object({
          id: z.string().min(1),
          type: providerTypeSchema,
          endpoint: z.string().url().optional(),
          defaultModel: z.string().min(1).optional(),
          parameters: z.record(providerParameterSchema).default({})
        })
      )
      .default([]),
    agents: z
      .array(
        z.object({
          id: z.string().min(1),
          role: z.string().min(1),
          provider: z.string().min(1),
          model: z.string().min(1),
          permissionMode: permissionModeSchema,
          capabilities: z.array(z.string().min(1)).default([])
        })
      )
      .default([]),
    permissions: z
      .object({
        defaultMode: permissionModeSchema.default("manual"),
        allowCommands: z.array(z.string().min(1)).default([]),
        sensitiveFiles: z.array(z.string().min(1)).default([".env", ".env.*"]),
        allowNetwork: z.boolean().default(false)
      })
      .default({
        defaultMode: "manual",
        allowCommands: [],
        sensitiveFiles: [".env", ".env.*"],
        allowNetwork: false
      })
  })
  .strict()
  .superRefine((value, context) => {
    visitManifestKeys(value, [], (path, key) => {
      if (sensitiveKeyPattern.test(key)) {
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
    assertUniqueIds(
      value.agents.map((agent) => agent.id),
      "agents",
      context
    );

    const providerIds = new Set(value.providers.map((provider) => provider.id));
    value.agents.forEach((agent, index) => {
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
    if (sensitiveKeyPattern.test(key)) {
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
