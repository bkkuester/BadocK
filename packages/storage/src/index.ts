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
  state: "open" | "planned" | "running" | "closed";
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
  state?: IssueRecord["state"];
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

  createIssue(input: CreateIssueInput): IssueRecord {
    const now = new Date().toISOString();
    const record = {
      id: input.id ?? randomUUID(),
      projectId: input.projectId,
      title: input.title,
      objective: input.objective,
      state: input.state ?? "open",
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO issue (id, project_id, title, objective, state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.projectId,
        record.title,
        record.objective,
        record.state,
        record.createdAt,
        record.updatedAt
      );

    return record;
  }

  getIssue(id: string): IssueRecord | null {
    const row = this.db.prepare("SELECT * FROM issue WHERE id = ?").get(id);
    return row ? mapIssue(row as IssueRow) : null;
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
        state TEXT NOT NULL CHECK (state IN ('open', 'planned', 'running', 'closed')),
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
  state: IssueRecord["state"];
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
    state: row.state,
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
