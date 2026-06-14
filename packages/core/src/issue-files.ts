import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { sanitizeSensitiveText } from "./security";

export type LocalIssueFileInput = {
  title: string;
  objective: string;
  scope: string[];
  suggestedAgents: string[];
  acceptanceCriteria: string[];
  technicalNotes?: string;
  files?: string[];
};

export type LocalIssueFileRecord = LocalIssueFileInput & {
  id: string;
  filePath: string;
  createdAt: string;
  updatedAt: string;
};

export type LocalIssueValidation = {
  valid: boolean;
  errors: string[];
  issue: LocalIssueFileRecord | null;
};

export type LocalIssueIndex = {
  updatedAt: string;
  issues: Array<Pick<LocalIssueFileRecord, "id" | "title" | "filePath" | "createdAt" | "updatedAt">>;
};

const issuesDir = ".badock/issues";
const indexFile = "index.json";

export async function createLocalIssueFile(
  projectRoot: string,
  input: Partial<LocalIssueFileInput> = {}
): Promise<LocalIssueFileRecord> {
  const root = resolve(projectRoot);
  const directory = join(root, issuesDir);
  await mkdir(directory, { recursive: true });

  const id = await nextIssueId(directory);
  const now = new Date().toISOString();
  const record: LocalIssueFileRecord = {
    id,
    filePath: join(issuesDir, `${id}.md`).replace(/\\/g, "/"),
    title: normalizeText(input.title) ?? "Draft local issue",
    objective: normalizeText(input.objective) ?? "TODO: define objective",
    scope: normalizeList(input.scope, ["TODO: define scope"]),
    suggestedAgents: normalizeList(input.suggestedAgents, ["ci-agent"]),
    acceptanceCriteria: normalizeList(input.acceptanceCriteria, ["TODO: define acceptance criteria"]),
    technicalNotes: normalizeText(input.technicalNotes) ?? "",
    files: normalizeList(input.files, []),
    createdAt: now,
    updatedAt: now
  };

  await writeFile(join(root, record.filePath), formatLocalIssueMarkdown(record), "utf8");
  await writeIssueIndex(root);
  return record;
}

export async function listLocalIssueFiles(projectRoot: string): Promise<LocalIssueFileRecord[]> {
  const root = resolve(projectRoot);
  const directory = join(root, issuesDir);
  const entries = await readdir(directory).catch(() => []);
  const records: LocalIssueFileRecord[] = [];

  for (const entry of entries.sort(compareStable)) {
    if (!/^local-\d{4}\.md$/i.test(entry)) {
      continue;
    }
    const record = await readLocalIssueFile(root, entry.replace(/\.md$/i, "")).catch(() => null);
    if (record) {
      records.push(record);
    }
  }

  return records;
}

export async function readLocalIssueFile(projectRoot: string, issueId: string): Promise<LocalIssueFileRecord> {
  const root = resolve(projectRoot);
  const id = normalizeIssueId(issueId);
  const filePath = join(issuesDir, `${id}.md`).replace(/\\/g, "/");
  const absolutePath = join(root, filePath);
  const [markdown, fileStat] = await Promise.all([readFile(absolutePath, "utf8"), stat(absolutePath)]);
  const parsed = parseLocalIssueMarkdown(markdown);

  return {
    id,
    filePath,
    ...parsed,
    createdAt: fileStat.birthtime.toISOString(),
    updatedAt: fileStat.mtime.toISOString()
  };
}

export async function validateLocalIssueFile(projectRoot: string, issueId: string): Promise<LocalIssueValidation> {
  try {
    const issue = await readLocalIssueFile(projectRoot, issueId);
    const errors = validateIssueShape(issue);
    return {
      valid: errors.length === 0,
      errors,
      issue
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      issue: null
    };
  }
}

export async function writeIssueIndex(projectRoot: string): Promise<LocalIssueIndex> {
  const root = resolve(projectRoot);
  const records = await listLocalIssueFiles(root);
  const index: LocalIssueIndex = {
    updatedAt: new Date().toISOString(),
    issues: records.map((record) => ({
      id: record.id,
      title: record.title,
      filePath: record.filePath,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }))
  };

  await mkdir(join(root, issuesDir), { recursive: true });
  await writeFile(join(root, issuesDir, indexFile), `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return index;
}

export function parseLocalIssueMarkdown(markdown: string): LocalIssueFileInput {
  return {
    title: normalizeTitle(markdown),
    objective: readSection(markdown, "Objetivo"),
    scope: readListSection(markdown, "Escopo"),
    suggestedAgents: readListSection(markdown, "Agente\\(s\\) sugerido\\(s\\)"),
    acceptanceCriteria: readListSection(markdown, "Critérios de aceite|Criterios de aceite"),
    technicalNotes: readSection(markdown, "Observações técnicas|Observacoes tecnicas"),
    files: readListSection(markdown, "Arquivos")
  };
}

export function formatLocalIssueMarkdown(issue: LocalIssueFileRecord | LocalIssueFileInput): string {
  return [
    `# ${sanitizeSensitiveText(issue.title.trim())}`,
    "",
    "## Objetivo",
    "",
    sanitizeSensitiveText(issue.objective.trim()),
    "",
    "## Escopo",
    "",
    formatList(issue.scope),
    "",
    "## Agente(s) sugerido(s)",
    "",
    formatList(issue.suggestedAgents),
    "",
    "## Critérios de aceite",
    "",
    formatList(issue.acceptanceCriteria),
    "",
    "## Observações técnicas",
    "",
    sanitizeSensitiveText(issue.technicalNotes?.trim() ?? ""),
    "",
    "## Arquivos",
    "",
    formatList(issue.files ?? []),
    ""
  ].join("\n");
}

export function validateIssueShape(issue: LocalIssueFileInput): string[] {
  const errors: string[] = [];
  if (!normalizeText(issue.title)) {
    errors.push("title is required");
  }
  if (!normalizeText(issue.objective)) {
    errors.push("objective is required");
  }
  if (normalizeList(issue.scope).length === 0) {
    errors.push("scope must include at least one item");
  }
  if (normalizeList(issue.acceptanceCriteria).length === 0) {
    errors.push("acceptance criteria must include at least one item");
  }
  return errors;
}

function normalizeTitle(markdown: string): string {
  const match = markdown.match(/^#\s+(.+?)\s*$/m);
  return sanitizeSensitiveText(match?.[1]?.trim() ?? "");
}

function readSection(markdown: string, headingPattern: string): string {
  const match = markdown.match(new RegExp(`^##\\s+(?:${headingPattern})\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, "im"));
  return sanitizeSensitiveText(match?.[1]?.trim() ?? "");
}

function readListSection(markdown: string, headingPattern: string): string[] {
  return readSection(markdown, headingPattern)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean)
    .map(sanitizeSensitiveText);
}

async function nextIssueId(directory: string): Promise<string> {
  const entries = await readdir(directory).catch(() => []);
  const next =
    entries
      .map((entry) => entry.match(/^local-(\d{4})\.md$/i)?.[1])
      .filter((value): value is string => Boolean(value))
      .map((value) => Number.parseInt(value, 10))
      .reduce((max, value) => Math.max(max, value), 0) + 1;
  return `local-${String(next).padStart(4, "0")}`;
}

function normalizeIssueId(issueId: string): string {
  const normalized = issueId.trim().replace(/\.md$/i, "");
  if (!/^local-\d{4}$/i.test(normalized)) {
    throw new Error(`Invalid local issue id: ${issueId}`);
  }
  return normalized.toLowerCase();
}

function normalizeText(value: string | undefined): string | null {
  const normalized = sanitizeSensitiveText(value ?? "").trim();
  return normalized ? normalized : null;
}

function normalizeList(value: string[] | undefined, fallback: string[] = []): string[] {
  const normalized = Array.from(new Set((value ?? []).map((item) => sanitizeSensitiveText(item).trim()).filter(Boolean)));
  return normalized.length > 0 ? normalized : fallback;
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.map((value) => `- ${sanitizeSensitiveText(value.trim())}`).join("\n") : "-";
}

function compareStable(left: string, right: string): number {
  return left.localeCompare(right, "en");
}
