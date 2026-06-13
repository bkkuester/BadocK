import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

type ProviderType = "mock" | "openai-compatible" | "local-process" | "custom";
type PermissionMode = "manual" | "supervised" | "autonomous";
export const RUN_STATUSES = [
  "planned",
  "running",
  "completed",
  "completed_with_warnings",
  "paused_budget_limit",
  "failed",
  "needs_user_decision"
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export type CostMeasurementType = "exact" | "estimated";

const CANONICAL_SCHEMA_VERSION = 2;

type PermissionDecisionRecord = {
  action: string;
  mode: PermissionMode;
  decision: "allow" | "ask" | "deny";
  reason: string;
  requiresUserDecision: boolean;
};

export type ProjectRecord = {
  id: string;
  name: string;
  rootPath: string;
  manifestVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type ProviderProfileRecord = {
  id: string;
  projectId: string;
  type: ProviderType;
  endpoint: string | null;
  defaultModel: string | null;
  parameters: Record<string, string | number | boolean>;
  createdAt: string;
  updatedAt: string;
};

export type AgentProfileRecord = {
  id: string;
  projectId: string;
  role: string;
  providerId: string;
  model: string;
  permissionMode: PermissionMode;
  capabilities: string[];
  createdAt: string;
  updatedAt: string;
};

export type IssueRecord = {
  id: string;
  projectId: string;
  title: string;
  objective: string;
  scope: string[];
  suggestedAgents: string[];
  acceptanceCriteria: string[];
  technicalNotes: string;
  files: string[];
  state: "open" | "planned" | "running" | "closed";
  syncState: "local_only" | "synced" | "sync_error";
  githubNumber: number | null;
  githubUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StackProfileRecord = {
  id: string;
  projectId: string;
  profileJson: string;
  createdAt: string;
  updatedAt: string;
};

export type RunRecord = {
  id: string;
  projectId: string;
  issueId: string | null;
  status: RunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SchemaMigrationRecord = {
  version: number;
  name: string;
  appliedAt: string;
};

export type RunLogRecord = {
  id: string;
  runId: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  metadataJson: string | null;
  createdAt: string;
};

export type CostRecord = {
  id: string;
  projectId: string;
  issueId: string;
  runId: string;
  agentId: string;
  provider: string;
  model: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  currency: string;
  measurementType: CostMeasurementType;
  measurementSource: string;
  createdAt: string;
};

export type DecisionRecord = {
  id: string;
  runId: string;
  kind: string;
  summary: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
};

export type AgentRuntimeResultRecordInput = {
  runId: string;
  result: {
    adapterId?: string;
    status?: string;
    stdout?: string;
    stderr?: string;
    error?: string | null;
    [key: string]: unknown;
  };
};

export type RunPlanRecord = {
  id: string;
  projectId: string;
  issueId: string;
  objective: string;
  scope: string[];
  candidateFiles: string[];
  suggestedValidations: string[];
  risks: string[];
  acceptanceCriteria: string[];
  agentSelection: unknown | null;
  providerMetadata: unknown | null;
  requiresManualReview: boolean;
  executionAuthorized: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateProjectInput = {
  id?: string;
  name: string;
  rootPath: string;
  manifestVersion?: number;
};

export type RegisterProviderProfileInput = {
  id: string;
  projectId: string;
  type: ProviderType;
  endpoint?: string | null;
  defaultModel?: string | null;
  parameters?: Record<string, string | number | boolean>;
};

export type RegisterAgentProfileInput = {
  id: string;
  projectId: string;
  role: string;
  providerId: string;
  model: string;
  permissionMode: PermissionMode;
  capabilities?: string[];
};

export type CreateIssueInput = {
  id?: string;
  projectId: string;
  title: string;
  objective: string;
  scope?: string[];
  suggestedAgents?: string[];
  acceptanceCriteria?: string[];
  technicalNotes?: string;
  files?: string[];
  state?: IssueRecord["state"];
  syncState?: IssueRecord["syncState"];
  githubNumber?: number | null;
  githubUrl?: string | null;
};

export type UpdateIssueInput = Partial<
  Pick<
    CreateIssueInput,
    | "title"
    | "objective"
    | "scope"
    | "suggestedAgents"
    | "acceptanceCriteria"
    | "technicalNotes"
    | "files"
    | "state"
    | "syncState"
    | "githubNumber"
    | "githubUrl"
  >
>;

export type SaveStackProfileInput = {
  id?: string;
  projectId: string;
  profile: unknown;
};

export type CreateRunInput = {
  id?: string;
  projectId: string;
  issueId?: string | null;
  status?: RunRecord["status"];
};

export type CreateRunLogInput = {
  id?: string;
  runId: string;
  level?: RunLogRecord["level"];
  message: string;
  metadata?: unknown;
};

export type CreateCostRecordInput = {
  id?: string;
  projectId: string;
  issueId: string;
  runId: string;
  agentId: string;
  provider: string;
  model: string;
  tokens: number;
  inputTokens?: number;
  outputTokens?: number;
  cost: number;
  currency: string;
  measurementType: CostMeasurementType;
  measurementSource: string;
};

export type CreateDecisionInput = {
  id?: string;
  runId: string;
  kind: string;
  summary: string;
  status?: DecisionRecord["status"];
};

export type CreateRunPlanInput = {
  id?: string;
  projectId: string;
  issueId: string;
  objective: string;
  scope: string[];
  candidateFiles: string[];
  suggestedValidations: string[];
  risks: string[];
  acceptanceCriteria: string[];
  agentSelection?: unknown | null;
  providerMetadata?: unknown | null;
  requiresManualReview?: boolean;
  executionAuthorized?: boolean;
};

export class BadockStorage {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    assertSafeDatabasePath(dbPath);
    const resolvedPath = resolve(dbPath);
    mkdirSync(dirname(resolvedPath), { recursive: true });
    this.db = new DatabaseSync(resolvedPath);
    this.db.exec("PRAGMA foreign_keys = OFF;");
    this.migrate();
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  close(): void {
    this.db.close();
  }

  getSchemaVersion(): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migration")
      .get() as { version: number | null };
    return row.version ?? 0;
  }

  listSchemaMigrations(): SchemaMigrationRecord[] {
    return this.db
      .prepare("SELECT version, name, applied_at FROM schema_migration ORDER BY version ASC")
      .all()
      .map((row) => {
        const migration = row as { version: number; name: string; applied_at: string };
        return {
          version: migration.version,
          name: migration.name,
          appliedAt: migration.applied_at
        };
      });
  }

  createProject(input: CreateProjectInput): ProjectRecord {
    const now = new Date().toISOString();
    const record = {
      id: input.id ?? randomUUID(),
      name: input.name,
      rootPath: input.rootPath,
      manifestVersion: input.manifestVersion ?? 1,
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO project (id, name, root_path, manifest_version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(record.id, record.name, record.rootPath, record.manifestVersion, record.createdAt, record.updatedAt);

    return record;
  }

  getProject(id: string): ProjectRecord | null {
    const row = this.db.prepare("SELECT * FROM project WHERE id = ?").get(id);
    return row ? mapProject(row as ProjectRow) : null;
  }

  registerProviderProfile(input: RegisterProviderProfileInput): ProviderProfileRecord {
    const now = new Date().toISOString();
    const current = this.getProviderProfile(input.projectId, input.id);
    const record = {
      id: normalizeText(input.id, "provider id"),
      projectId: input.projectId,
      type: input.type,
      endpoint: sanitizeNullableText(input.endpoint),
      defaultModel: sanitizeNullableText(input.defaultModel),
      parameters: sanitizeForPublicOutput(input.parameters ?? {}) as Record<string, string | number | boolean>,
      createdAt: current?.createdAt ?? now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO provider_profile
           (id, project_id, type, endpoint, default_model, parameters_json, created_at, updated_at)
         VALUES
           (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(project_id, id) DO UPDATE SET
           type = excluded.type,
           endpoint = excluded.endpoint,
           default_model = excluded.default_model,
           parameters_json = excluded.parameters_json,
           updated_at = excluded.updated_at`
      )
      .run(
        record.id,
        record.projectId,
        record.type,
        record.endpoint,
        record.defaultModel,
        JSON.stringify(record.parameters),
        record.createdAt,
        record.updatedAt
      );

    return record;
  }

  getProviderProfile(projectId: string, id: string): ProviderProfileRecord | null {
    const row = this.db
      .prepare("SELECT * FROM provider_profile WHERE project_id = ? AND id = ?")
      .get(projectId, id);
    return row ? mapProviderProfile(row as ProviderProfileRow) : null;
  }

  listProviderProfiles(projectId: string): ProviderProfileRecord[] {
    return this.db
      .prepare("SELECT * FROM provider_profile WHERE project_id = ? ORDER BY id ASC")
      .all(projectId)
      .map((row) => mapProviderProfile(row as ProviderProfileRow));
  }

  registerAgentProfile(input: RegisterAgentProfileInput): AgentProfileRecord {
    const now = new Date().toISOString();
    const current = this.getAgentProfile(input.projectId, input.id);
    const record = {
      id: normalizeText(input.id, "agent id"),
      projectId: input.projectId,
      role: normalizeText(input.role, "agent role"),
      providerId: normalizeText(input.providerId, "agent provider"),
      model: normalizeText(input.model, "agent model"),
      permissionMode: input.permissionMode,
      capabilities: normalizeStringArray(input.capabilities ?? []),
      createdAt: current?.createdAt ?? now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO agent_profile
           (id, project_id, role, provider_id, model, permission_mode, capabilities_json, created_at, updated_at)
         VALUES
           (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(project_id, id) DO UPDATE SET
           role = excluded.role,
           provider_id = excluded.provider_id,
           model = excluded.model,
           permission_mode = excluded.permission_mode,
           capabilities_json = excluded.capabilities_json,
           updated_at = excluded.updated_at`
      )
      .run(
        record.id,
        record.projectId,
        record.role,
        record.providerId,
        record.model,
        record.permissionMode,
        JSON.stringify(record.capabilities),
        record.createdAt,
        record.updatedAt
      );

    return record;
  }

  getAgentProfile(projectId: string, id: string): AgentProfileRecord | null {
    const row = this.db.prepare("SELECT * FROM agent_profile WHERE project_id = ? AND id = ?").get(projectId, id);
    return row ? mapAgentProfile(row as AgentProfileRow) : null;
  }

  listAgentProfiles(projectId: string): AgentProfileRecord[] {
    return this.db
      .prepare("SELECT * FROM agent_profile WHERE project_id = ? ORDER BY id ASC")
      .all(projectId)
      .map((row) => mapAgentProfile(row as AgentProfileRow));
  }

  saveStackProfile(input: SaveStackProfileInput): StackProfileRecord {
    const now = new Date().toISOString();
    const record = {
      id: input.id ?? randomUUID(),
      projectId: input.projectId,
      profileJson: JSON.stringify(input.profile),
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO stack_profile (id, project_id, profile_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(record.id, record.projectId, record.profileJson, record.createdAt, record.updatedAt);

    return record;
  }

  getLatestStackProfile(projectId: string): StackProfileRecord | null {
    const row = this.db
      .prepare("SELECT * FROM stack_profile WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT 1")
      .get(projectId);
    return row ? mapStackProfile(row as StackProfileRow) : null;
  }

  createIssue(input: CreateIssueInput): IssueRecord {
    const now = new Date().toISOString();
    const record = {
      id: input.id ?? randomUUID(),
      projectId: input.projectId,
      title: input.title,
      objective: input.objective,
      scope: input.scope ?? [],
      suggestedAgents: input.suggestedAgents ?? [],
      acceptanceCriteria: input.acceptanceCriteria ?? [],
      technicalNotes: input.technicalNotes ?? "",
      files: input.files ?? [],
      state: input.state ?? "open",
      syncState: input.syncState ?? "local_only",
      githubNumber: input.githubNumber ?? null,
      githubUrl: input.githubUrl ?? null,
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO issue (
           id,
           project_id,
           title,
           objective,
           scope_json,
           suggested_agents_json,
           acceptance_criteria_json,
           technical_notes,
           files_json,
           state,
           sync_state,
           github_number,
           github_url,
           created_at,
           updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.projectId,
        record.title,
        record.objective,
        JSON.stringify(record.scope),
        JSON.stringify(record.suggestedAgents),
        JSON.stringify(record.acceptanceCriteria),
        record.technicalNotes,
        JSON.stringify(record.files),
        record.state,
        record.syncState,
        record.githubNumber,
        record.githubUrl,
        record.createdAt,
        record.updatedAt
      );

    return record;
  }

  getIssue(id: string): IssueRecord | null {
    const row = this.db.prepare("SELECT * FROM issue WHERE id = ?").get(id);
    return row ? mapIssue(row as IssueRow) : null;
  }

  listIssues(projectId?: string): IssueRecord[] {
    const statement = projectId
      ? this.db.prepare("SELECT * FROM issue WHERE project_id = ? ORDER BY created_at ASC, id ASC")
      : this.db.prepare("SELECT * FROM issue ORDER BY created_at ASC, id ASC");
    const rows = projectId ? statement.all(projectId) : statement.all();
    return rows.map((row) => mapIssue(row as IssueRow));
  }

  updateIssue(id: string, input: UpdateIssueInput): IssueRecord {
    const current = this.getIssue(id);
    if (!current) {
      throw new Error(`Issue not found: ${id}`);
    }

    const updated: IssueRecord = {
      ...current,
      title: input.title ?? current.title,
      objective: input.objective ?? current.objective,
      scope: input.scope ?? current.scope,
      suggestedAgents: input.suggestedAgents ?? current.suggestedAgents,
      acceptanceCriteria: input.acceptanceCriteria ?? current.acceptanceCriteria,
      technicalNotes: input.technicalNotes ?? current.technicalNotes,
      files: input.files ?? current.files,
      state: input.state ?? current.state,
      syncState: input.syncState ?? current.syncState,
      githubNumber: input.githubNumber === undefined ? current.githubNumber : input.githubNumber,
      githubUrl: input.githubUrl === undefined ? current.githubUrl : input.githubUrl,
      updatedAt: new Date().toISOString()
    };

    this.db
      .prepare(
        `UPDATE issue
         SET title = ?,
             objective = ?,
             scope_json = ?,
             suggested_agents_json = ?,
             acceptance_criteria_json = ?,
             technical_notes = ?,
             files_json = ?,
             state = ?,
             sync_state = ?,
             github_number = ?,
             github_url = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .run(
        updated.title,
        updated.objective,
        JSON.stringify(updated.scope),
        JSON.stringify(updated.suggestedAgents),
        JSON.stringify(updated.acceptanceCriteria),
        updated.technicalNotes,
        JSON.stringify(updated.files),
        updated.state,
        updated.syncState,
        updated.githubNumber,
        updated.githubUrl,
        updated.updatedAt,
        id
      );

    return updated;
  }

  createRun(input: CreateRunInput): RunRecord {
    const now = new Date().toISOString();
    const record = {
      id: input.id ?? randomUUID(),
      projectId: input.projectId,
      issueId: input.issueId ?? null,
      status: assertRunStatus(input.status ?? "planned"),
      startedAt: null,
      finishedAt: null,
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO run (id, project_id, issue_id, status, started_at, finished_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.projectId,
        record.issueId,
        record.status,
        record.startedAt,
        record.finishedAt,
        record.createdAt,
        record.updatedAt
      );

    return record;
  }

  getRun(id: string): RunRecord | null {
    const row = this.db.prepare("SELECT * FROM run WHERE id = ?").get(id);
    return row ? mapRun(row as RunRow) : null;
  }

  createRunPlan(input: CreateRunPlanInput): RunPlanRecord {
    const now = new Date().toISOString();
    const record = {
      id: input.id ?? randomUUID(),
      projectId: input.projectId,
      issueId: input.issueId,
      objective: input.objective,
      scope: input.scope,
      candidateFiles: input.candidateFiles,
      suggestedValidations: input.suggestedValidations,
      risks: input.risks,
      acceptanceCriteria: input.acceptanceCriteria,
      agentSelection: input.agentSelection ?? null,
      providerMetadata: input.providerMetadata ?? null,
      requiresManualReview: input.requiresManualReview ?? true,
      executionAuthorized: input.executionAuthorized ?? false,
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO run_plan (
           id,
           project_id,
           issue_id,
           objective,
           scope_json,
           candidate_files_json,
           suggested_validations_json,
           risks_json,
           acceptance_criteria_json,
           agent_selection_json,
           provider_metadata_json,
           requires_manual_review,
           execution_authorized,
           created_at,
           updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.projectId,
        record.issueId,
        record.objective,
        JSON.stringify(record.scope),
        JSON.stringify(record.candidateFiles),
        JSON.stringify(record.suggestedValidations),
        JSON.stringify(record.risks),
        JSON.stringify(record.acceptanceCriteria),
        JSON.stringify(sanitizeForPublicOutput(record.agentSelection)),
        JSON.stringify(sanitizeForPublicOutput(record.providerMetadata)),
        record.requiresManualReview ? 1 : 0,
        record.executionAuthorized ? 1 : 0,
        record.createdAt,
        record.updatedAt
      );

    return record;
  }

  getRunPlan(id: string): RunPlanRecord | null {
    const row = this.db.prepare("SELECT * FROM run_plan WHERE id = ?").get(id);
    return row ? mapRunPlan(row as RunPlanRow) : null;
  }

  listRunPlans(issueId: string): RunPlanRecord[] {
    return this.db
      .prepare("SELECT * FROM run_plan WHERE issue_id = ? ORDER BY created_at ASC, id ASC")
      .all(issueId)
      .map((row) => mapRunPlan(row as RunPlanRow));
  }

  appendRunLog(input: CreateRunLogInput): RunLogRecord {
    const record = {
      id: input.id ?? randomUUID(),
      runId: input.runId,
      level: input.level ?? "info",
      message: sanitizeSensitiveText(input.message),
      metadataJson: input.metadata === undefined ? null : JSON.stringify(sanitizeForPublicOutput(input.metadata)),
      createdAt: new Date().toISOString()
    };

    this.db
      .prepare(
        `INSERT INTO run_log (id, run_id, level, message, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(record.id, record.runId, record.level, record.message, record.metadataJson, record.createdAt);

    return record;
  }

  listRunLogs(runId: string): RunLogRecord[] {
    return this.db
      .prepare("SELECT * FROM run_log WHERE run_id = ? ORDER BY created_at ASC, id ASC")
      .all(runId)
      .map((row) => mapRunLog(row as RunLogRow));
  }

  recordAgentRuntimeResult(input: AgentRuntimeResultRecordInput): RunLogRecord {
    const status = typeof input.result.status === "string" && input.result.status ? input.result.status : "unknown";
    const adapterId =
      typeof input.result.adapterId === "string" && input.result.adapterId ? input.result.adapterId : "unknown";

    return this.appendRunLog({
      runId: input.runId,
      level: runtimeStatusToLogLevel(status),
      message: `Agent runtime ${adapterId} finished with status ${status}`,
      metadata: {
        agentRuntimeResult: input.result
      }
    });
  }

  createCostRecord(input: CreateCostRecordInput): CostRecord {
    const run = this.getRun(input.runId);
    if (!run) {
      throw new Error(`Run not found for cost record: ${input.runId}`);
    }
    if (run.projectId !== input.projectId) {
      throw new Error(`Cost record project does not match run project: ${input.projectId}`);
    }
    if (run.issueId !== input.issueId) {
      throw new Error(`Cost record issue does not match run issue: ${input.issueId}`);
    }

    const record = {
      id: input.id ?? randomUUID(),
      projectId: normalizeText(input.projectId, "cost project id"),
      issueId: normalizeText(input.issueId, "cost issue id"),
      runId: normalizeText(input.runId, "cost run id"),
      agentId: normalizeText(input.agentId, "cost agent id"),
      provider: normalizeText(input.provider, "cost provider"),
      model: normalizeText(input.model, "cost model"),
      tokens: normalizeNonNegativeInteger(input.tokens, "cost tokens"),
      inputTokens: normalizeNonNegativeInteger(input.inputTokens ?? 0, "cost input tokens"),
      outputTokens: normalizeNonNegativeInteger(input.outputTokens ?? 0, "cost output tokens"),
      cost: normalizeNonNegativeNumber(input.cost, "cost value"),
      currency: normalizeText(input.currency, "cost currency").toUpperCase(),
      measurementType: assertCostMeasurementType(input.measurementType),
      measurementSource: normalizeText(input.measurementSource, "cost measurement source"),
      createdAt: new Date().toISOString()
    };

    this.db
      .prepare(
        `INSERT INTO cost_record
           (
             id,
             project_id,
             issue_id,
             run_id,
             agent_id,
             provider,
             model,
             total_tokens,
             input_tokens,
             output_tokens,
             cost,
             currency,
             measurement_type,
             measurement_source,
             created_at
           )
         VALUES
           (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.projectId,
        record.issueId,
        record.runId,
        record.agentId,
        record.provider,
        record.model,
        record.tokens,
        record.inputTokens,
        record.outputTokens,
        record.cost,
        record.currency,
        record.measurementType,
        record.measurementSource,
        record.createdAt
      );

    return record;
  }

  listCostRecords(runId: string): CostRecord[] {
    return this.db
      .prepare("SELECT * FROM cost_record WHERE run_id = ? ORDER BY created_at ASC, id ASC")
      .all(runId)
      .map((row) => mapCostRecord(row as CostRecordRow));
  }

  createDecision(input: CreateDecisionInput): DecisionRecord {
    const now = new Date().toISOString();
    const record = {
      id: input.id ?? randomUUID(),
      runId: input.runId,
      kind: input.kind,
      summary: sanitizeSensitiveText(input.summary),
      status: input.status ?? "pending",
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO decision (id, run_id, kind, summary, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.runId,
        record.kind,
        record.summary,
        record.status,
        record.createdAt,
        record.updatedAt
      );

    return record;
  }

  recordPermissionDecision(input: { id?: string; runId: string; decision: PermissionDecisionRecord }): DecisionRecord {
    return this.createDecision({
      id: input.id,
      runId: input.runId,
      kind: "permission",
      summary: formatPermissionDecision(input.decision),
      status:
        input.decision.decision === "allow"
          ? "approved"
          : input.decision.decision === "deny"
            ? "rejected"
            : "pending"
    });
  }

  listDecisions(runId: string): DecisionRecord[] {
    return this.db
      .prepare("SELECT * FROM decision WHERE run_id = ? ORDER BY created_at ASC, id ASC")
      .all(runId)
      .map((row) => mapDecision(row as DecisionRow));
  }

  private migrate(): void {
    const runStatusCheck = sqlStringList(RUN_STATUSES);
    const appliedAt = new Date().toISOString();

    this.db.exec("BEGIN;");
    try {
      this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migration (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        root_path TEXT NOT NULL,
        manifest_version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS issue (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        objective TEXT NOT NULL,
        scope_json TEXT NOT NULL DEFAULT '[]',
        suggested_agents_json TEXT NOT NULL DEFAULT '[]',
        acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
        technical_notes TEXT NOT NULL DEFAULT '',
        files_json TEXT NOT NULL DEFAULT '[]',
        state TEXT NOT NULL CHECK (state IN ('open', 'planned', 'running', 'closed')),
        sync_state TEXT NOT NULL DEFAULT 'local_only' CHECK (sync_state IN ('local_only', 'synced', 'sync_error')),
        github_number INTEGER,
        github_url TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS provider_profile (
        id TEXT NOT NULL,
        project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('mock', 'openai-compatible', 'local-process', 'custom')),
        endpoint TEXT,
        default_model TEXT,
        parameters_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, id)
      );

      CREATE TABLE IF NOT EXISTS agent_profile (
        id TEXT NOT NULL,
        project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model TEXT NOT NULL,
        permission_mode TEXT NOT NULL CHECK (permission_mode IN ('manual', 'supervised', 'autonomous')),
        capabilities_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (project_id, id),
        FOREIGN KEY (project_id, provider_id) REFERENCES provider_profile(project_id, id) ON DELETE RESTRICT
      );

      CREATE TABLE IF NOT EXISTS stack_profile (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        profile_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS run (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        issue_id TEXT REFERENCES issue(id) ON DELETE SET NULL,
        status TEXT NOT NULL CHECK (status IN (${runStatusCheck})),
        started_at TEXT,
        finished_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS run_plan (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        issue_id TEXT NOT NULL REFERENCES issue(id) ON DELETE CASCADE,
        objective TEXT NOT NULL,
        scope_json TEXT NOT NULL,
        candidate_files_json TEXT NOT NULL,
        suggested_validations_json TEXT NOT NULL,
        risks_json TEXT NOT NULL,
        acceptance_criteria_json TEXT NOT NULL,
        agent_selection_json TEXT,
        provider_metadata_json TEXT,
        requires_manual_review INTEGER NOT NULL DEFAULT 1,
        execution_authorized INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS run_log (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
        level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
        message TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cost_record (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        issue_id TEXT NOT NULL,
        run_id TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
        agent_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cost REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        measurement_type TEXT NOT NULL CHECK (measurement_type IN ('exact', 'estimated')),
        measurement_source TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS decision (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        summary TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
      this.ensureColumn("issue", "scope_json", "TEXT NOT NULL DEFAULT '[]'");
      this.ensureColumn("issue", "suggested_agents_json", "TEXT NOT NULL DEFAULT '[]'");
      this.ensureColumn("issue", "acceptance_criteria_json", "TEXT NOT NULL DEFAULT '[]'");
      this.ensureColumn("issue", "technical_notes", "TEXT NOT NULL DEFAULT ''");
      this.ensureColumn("issue", "files_json", "TEXT NOT NULL DEFAULT '[]'");
      this.ensureColumn("issue", "sync_state", "TEXT NOT NULL DEFAULT 'local_only'");
      this.ensureColumn("issue", "github_number", "INTEGER");
      this.ensureColumn("issue", "github_url", "TEXT");
      this.ensureColumn("provider_profile", "parameters_json", "TEXT NOT NULL DEFAULT '{}'");
      this.ensureColumn("agent_profile", "capabilities_json", "TEXT NOT NULL DEFAULT '[]'");
      this.ensureColumn("run_plan", "agent_selection_json", "TEXT");
      this.ensureColumn("run_plan", "provider_metadata_json", "TEXT");
      this.ensureCanonicalRunTable(runStatusCheck);
      this.ensureCanonicalCostRecordTable();
      this.recordSchemaMigration(1, "initial_local_storage", appliedAt);
      this.recordSchemaMigration(CANONICAL_SCHEMA_VERSION, "canonical_run_status_and_auditable_costs", appliedAt);
      this.db.exec("COMMIT;");
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  private ensureColumn(tableName: string, columnName: string, columnDefinition: string): void {
    const columns = this.tableColumns(tableName);
    if (columns.some((column) => column.name === columnName)) {
      return;
    }

    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition};`);
  }

  private ensureCanonicalRunTable(runStatusCheck: string): void {
    const tableSql = this.tableSql("run") ?? "";
    const hasCanonicalStatusCheck =
      RUN_STATUSES.every((status) => tableSql.includes(`'${status}'`)) && !tableSql.includes("'decision_required'");
    if (hasCanonicalStatusCheck) {
      return;
    }

    this.db.exec(`
      CREATE TABLE run_next (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
        issue_id TEXT REFERENCES issue(id) ON DELETE SET NULL,
        status TEXT NOT NULL CHECK (status IN (${runStatusCheck})),
        started_at TEXT,
        finished_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      INSERT INTO run_next (
        id,
        project_id,
        issue_id,
        status,
        started_at,
        finished_at,
        created_at,
        updated_at
      )
      SELECT
        id,
        project_id,
        issue_id,
        CASE status
          WHEN 'planned' THEN 'planned'
          WHEN 'running' THEN 'running'
          WHEN 'completed' THEN 'completed'
          WHEN 'completed_with_warnings' THEN 'completed_with_warnings'
          WHEN 'paused_budget_limit' THEN 'paused_budget_limit'
          WHEN 'failed' THEN 'failed'
          WHEN 'needs_user_decision' THEN 'needs_user_decision'
          WHEN 'decision_required' THEN 'needs_user_decision'
          WHEN 'created' THEN 'planned'
          WHEN 'ready' THEN 'planned'
          WHEN 'preflight_failed' THEN 'failed'
          ELSE 'failed'
        END,
        started_at,
        finished_at,
        created_at,
        updated_at
      FROM run;

      DROP TABLE run;
      ALTER TABLE run_next RENAME TO run;
    `);
  }

  private ensureCanonicalCostRecordTable(): void {
    const columns = this.tableColumns("cost_record");
    const columnNames = new Set(columns.map((column) => column.name));
    const requiredColumns = [
      "project_id",
      "issue_id",
      "run_id",
      "agent_id",
      "provider",
      "model",
      "total_tokens",
      "input_tokens",
      "output_tokens",
      "cost",
      "currency",
      "measurement_type",
      "measurement_source",
      "created_at"
    ];
    const hasCanonicalColumns =
      requiredColumns.every((columnName) => columnNames.has(columnName)) && !columnNames.has("estimated_cost");
    if (hasCanonicalColumns) {
      return;
    }

    const columnExpression = (columnName: string, fallback: string): string =>
      columnNames.has(columnName) ? `cost_record.${columnName}` : fallback;
    const inputTokensExpression = columnExpression("input_tokens", "0");
    const outputTokensExpression = columnExpression("output_tokens", "0");
    const totalTokensExpression = columnNames.has("total_tokens")
      ? "cost_record.total_tokens"
      : `(${inputTokensExpression} + ${outputTokensExpression})`;
    const costExpression = columnExpression("cost", columnExpression("estimated_cost", "0"));
    const measurementTypeExpression = columnNames.has("measurement_type")
      ? "CASE cost_record.measurement_type WHEN 'exact' THEN 'exact' WHEN 'estimated' THEN 'estimated' ELSE 'estimated' END"
      : "'estimated'";

    this.db.exec(`
      CREATE TABLE cost_record_next (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        issue_id TEXT NOT NULL,
        run_id TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
        agent_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cost REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        measurement_type TEXT NOT NULL CHECK (measurement_type IN ('exact', 'estimated')),
        measurement_source TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      INSERT INTO cost_record_next (
        id,
        project_id,
        issue_id,
        run_id,
        agent_id,
        provider,
        model,
        total_tokens,
        input_tokens,
        output_tokens,
        cost,
        currency,
        measurement_type,
        measurement_source,
        created_at
      )
      SELECT
        cost_record.id,
        COALESCE(${columnExpression("project_id", "run.project_id")}, run.project_id, 'legacy-project'),
        COALESCE(${columnExpression("issue_id", "run.issue_id")}, run.issue_id, 'legacy-unassigned'),
        cost_record.run_id,
        COALESCE(NULLIF(${columnExpression("agent_id", "''")}, ''), 'unknown'),
        COALESCE(NULLIF(cost_record.provider, ''), 'unknown'),
        COALESCE(NULLIF(cost_record.model, ''), 'unknown'),
        COALESCE(${totalTokensExpression}, 0),
        COALESCE(${inputTokensExpression}, 0),
        COALESCE(${outputTokensExpression}, 0),
        COALESCE(${costExpression}, 0),
        COALESCE(NULLIF(${columnExpression("currency", "''")}, ''), 'USD'),
        ${measurementTypeExpression},
        COALESCE(NULLIF(${columnExpression("measurement_source", "''")}, ''), 'migration:legacy-cost-record'),
        cost_record.created_at
      FROM cost_record
      LEFT JOIN run ON run.id = cost_record.run_id;

      DROP TABLE cost_record;
      ALTER TABLE cost_record_next RENAME TO cost_record;
    `);
  }

  private recordSchemaMigration(version: number, name: string, appliedAt: string): void {
    this.db
      .prepare("INSERT OR IGNORE INTO schema_migration (version, name, applied_at) VALUES (?, ?, ?)")
      .run(version, name, appliedAt);
  }

  private tableColumns(tableName: string): Array<{ name: string }> {
    return this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  }

  private tableSql(tableName: string): string | null {
    const row = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName) as { sql: string } | undefined;
    return row?.sql ?? null;
  }
}

export function createBadockStorage(dbPath: string): BadockStorage {
  return new BadockStorage(dbPath);
}

export function assertSafeDatabasePath(dbPath: string): void {
  const lowerPath = dbPath.toLowerCase();
  if (/(secret|token|api[-_]?key|password|credential)/i.test(lowerPath)) {
    throw new Error("Database path must not include secret-like names");
  }
}

type ProjectRow = {
  id: string;
  name: string;
  root_path: string;
  manifest_version: number;
  created_at: string;
  updated_at: string;
};

type ProviderProfileRow = {
  id: string;
  project_id: string;
  type: ProviderType;
  endpoint: string | null;
  default_model: string | null;
  parameters_json: string;
  created_at: string;
  updated_at: string;
};

type AgentProfileRow = {
  id: string;
  project_id: string;
  role: string;
  provider_id: string;
  model: string;
  permission_mode: PermissionMode;
  capabilities_json: string;
  created_at: string;
  updated_at: string;
};

type IssueRow = {
  id: string;
  project_id: string;
  title: string;
  objective: string;
  scope_json: string;
  suggested_agents_json: string;
  acceptance_criteria_json: string;
  technical_notes: string;
  files_json: string;
  state: IssueRecord["state"];
  sync_state: IssueRecord["syncState"];
  github_number: number | null;
  github_url: string | null;
  created_at: string;
  updated_at: string;
};

type StackProfileRow = {
  id: string;
  project_id: string;
  profile_json: string;
  created_at: string;
  updated_at: string;
};

type RunRow = {
  id: string;
  project_id: string;
  issue_id: string | null;
  status: RunRecord["status"];
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

type RunLogRow = {
  id: string;
  run_id: string;
  level: RunLogRecord["level"];
  message: string;
  metadata_json: string | null;
  created_at: string;
};

type CostRecordRow = {
  id: string;
  project_id: string;
  issue_id: string;
  run_id: string;
  agent_id: string;
  provider: string;
  model: string;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  currency: string;
  measurement_type: CostMeasurementType;
  measurement_source: string;
  created_at: string;
};

type DecisionRow = {
  id: string;
  run_id: string;
  kind: string;
  summary: string;
  status: DecisionRecord["status"];
  created_at: string;
  updated_at: string;
};

type RunPlanRow = {
  id: string;
  project_id: string;
  issue_id: string;
  objective: string;
  scope_json: string;
  candidate_files_json: string;
  suggested_validations_json: string;
  risks_json: string;
  acceptance_criteria_json: string;
  agent_selection_json: string | null;
  provider_metadata_json: string | null;
  requires_manual_review: number;
  execution_authorized: number;
  created_at: string;
  updated_at: string;
};

function mapProject(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    rootPath: row.root_path,
    manifestVersion: row.manifest_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapProviderProfile(row: ProviderProfileRow): ProviderProfileRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    endpoint: row.endpoint,
    defaultModel: row.default_model,
    parameters: parseJsonObject(row.parameters_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapAgentProfile(row: AgentProfileRow): AgentProfileRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    role: row.role,
    providerId: row.provider_id,
    model: row.model,
    permissionMode: row.permission_mode,
    capabilities: parseStringArray(row.capabilities_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapIssue(row: IssueRow): IssueRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    objective: row.objective,
    scope: parseStringArray(row.scope_json),
    suggestedAgents: parseStringArray(row.suggested_agents_json),
    acceptanceCriteria: parseStringArray(row.acceptance_criteria_json),
    technicalNotes: row.technical_notes,
    files: parseStringArray(row.files_json),
    state: row.state,
    syncState: row.sync_state,
    githubNumber: row.github_number,
    githubUrl: row.github_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapStackProfile(row: StackProfileRow): StackProfileRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    profileJson: row.profile_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRun(row: RunRow): RunRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    issueId: row.issue_id,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRunLog(row: RunLogRow): RunLogRecord {
  return {
    id: row.id,
    runId: row.run_id,
    level: row.level,
    message: row.message,
    metadataJson: row.metadata_json,
    createdAt: row.created_at
  };
}

function mapCostRecord(row: CostRecordRow): CostRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    issueId: row.issue_id,
    runId: row.run_id,
    agentId: row.agent_id,
    provider: row.provider,
    model: row.model,
    tokens: row.total_tokens,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cost: row.cost,
    currency: row.currency,
    measurementType: row.measurement_type,
    measurementSource: row.measurement_source,
    createdAt: row.created_at
  };
}

function mapDecision(row: DecisionRow): DecisionRecord {
  return {
    id: row.id,
    runId: row.run_id,
    kind: row.kind,
    summary: row.summary,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRunPlan(row: RunPlanRow): RunPlanRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    issueId: row.issue_id,
    objective: row.objective,
    scope: parseStringArray(row.scope_json),
    candidateFiles: parseStringArray(row.candidate_files_json),
    suggestedValidations: parseStringArray(row.suggested_validations_json),
    risks: parseStringArray(row.risks_json),
    acceptanceCriteria: parseStringArray(row.acceptance_criteria_json),
    agentSelection: parseNullableJson(row.agent_selection_json),
    providerMetadata: parseNullableJson(row.provider_metadata_json),
    requiresManualReview: row.requires_manual_review === 1,
    executionAuthorized: row.execution_authorized === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string): Record<string, string | number | boolean> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string | number | boolean] =>
          typeof entry[1] === "string" || typeof entry[1] === "number" || typeof entry[1] === "boolean"
      )
    );
  } catch {
    return {};
  }
}

function parseNullableJson(raw: string | null): unknown | null {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function isRunStatus(value: string): value is RunStatus {
  return (RUN_STATUSES as readonly string[]).includes(value);
}

function assertRunStatus(value: string): RunStatus {
  if (isRunStatus(value)) {
    return value;
  }

  throw new Error(`Invalid run status: ${value}`);
}

function assertCostMeasurementType(value: string): CostMeasurementType {
  if (value === "exact" || value === "estimated") {
    return value;
  }

  throw new Error(`Invalid cost measurement type: ${value}`);
}

function normalizeText(value: string, fieldName: string): string {
  const normalized = sanitizeSensitiveText(value).trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function normalizeNonNegativeInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }

  return value;
}

function normalizeNonNegativeNumber(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative number`);
  }

  return value;
}

function sanitizeNullableText(value: string | null | undefined): string | null {
  const normalized = sanitizeSensitiveText(value ?? "").trim();
  return normalized ? normalized : null;
}

function normalizeStringArray(value: string[]): string[] {
  return Array.from(new Set(value.map((item) => sanitizeSensitiveText(item).trim()).filter(Boolean))).sort(
    (left, right) => left.localeCompare(right, "en")
  );
}

function formatPermissionDecision(decision: PermissionDecisionRecord): string {
  return `${decision.action}: ${decision.decision} (${decision.mode}) - ${decision.reason}`;
}

function runtimeStatusToLogLevel(status: string): RunLogRecord["level"] {
  if (status === "completed") {
    return "info";
  }

  if (status === "needs_user_decision" || status === "blocked" || status === "timed_out" || status === "cancelled") {
    return "warn";
  }

  return "error";
}

function sanitizeForPublicOutput(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeSensitiveText(value);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForPublicOutput);
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      isSensitiveKey(key) ? "[REDACTED]" : sanitizeForPublicOutput(nestedValue)
    ])
  );
}

function sanitizeSensitiveText(text: string): string {
  return text
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}\b/gi, "$1[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "sk-[REDACTED]")
    .replace(/\bgithub_pat_[A-Za-z0-9_]{12,}\b/g, "github_pat_[REDACTED]")
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{12,}\b/g, (match) => `${match.split("_")[0]}_[REDACTED]`)
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, (match) => `${match.split("-")[0]}-[REDACTED]`)
    .replace(
      /\b(secret|token|api[-_]?key|access[-_]?key|password|credential|private[-_]?key|authorization)\b\s*[:=]\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,;}]+)/gi,
      (_match, key: string) => `${key}=[REDACTED]`
    );
}

function isSensitiveKey(key: string): boolean {
  return /(?:secret|token|api[-_]?key|access[-_]?key|password|credential|private[-_]?key|authorization|bearer)/i.test(
    key
  );
}

function sqlStringList(values: readonly string[]): string {
  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", ");
}
