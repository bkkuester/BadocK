import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type ProjectRecord = {
  id: string;
  name: string;
  rootPath: string;
  manifestVersion: number;
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
  status: "planned" | "running" | "completed" | "failed" | "decision_required";
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  runId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  currency: string;
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
  runId: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  currency?: string;
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
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  close(): void {
    this.db.close();
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
      status: input.status ?? "planned",
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
           requires_manual_review,
           execution_authorized,
           created_at,
           updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      message: input.message,
      metadataJson: input.metadata === undefined ? null : JSON.stringify(input.metadata),
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

  createCostRecord(input: CreateCostRecordInput): CostRecord {
    const record = {
      id: input.id ?? randomUUID(),
      runId: input.runId,
      provider: input.provider,
      model: input.model,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      estimatedCost: input.estimatedCost ?? 0,
      currency: input.currency ?? "USD",
      createdAt: new Date().toISOString()
    };

    this.db
      .prepare(
        `INSERT INTO cost_record
           (id, run_id, provider, model, input_tokens, output_tokens, estimated_cost, currency, created_at)
         VALUES
           (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.runId,
        record.provider,
        record.model,
        record.inputTokens,
        record.outputTokens,
        record.estimatedCost,
        record.currency,
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
      summary: input.summary,
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

  listDecisions(runId: string): DecisionRecord[] {
    return this.db
      .prepare("SELECT * FROM decision WHERE run_id = ? ORDER BY created_at ASC, id ASC")
      .all(runId)
      .map((row) => mapDecision(row as DecisionRow));
  }

  private migrate(): void {
    this.db.exec(`
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
        status TEXT NOT NULL CHECK (status IN ('planned', 'running', 'completed', 'failed', 'decision_required')),
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
        run_id TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_cost REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
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
  }

  private ensureColumn(tableName: string, columnName: string, columnDefinition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    if (columns.some((column) => column.name === columnName)) {
      return;
    }

    this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition};`);
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
  run_id: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  currency: string;
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
    runId: row.run_id,
    provider: row.provider,
    model: row.model,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    estimatedCost: row.estimated_cost,
    currency: row.currency,
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
