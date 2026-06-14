import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type WorktreeMetadata = {
  issueId: string;
  agentName: string;
  branch: string;
  worktreePath: string;
  baseBranch: string;
  created: boolean;
};

export type WorktreeRequest = {
  repoRoot: string;
  issueId: string;
  agentName: string;
  baseBranch?: string;
  worktreeBaseDir?: string;
  allowMainExecution?: boolean;
};

export async function ensureIssueWorktree(input: WorktreeRequest): Promise<WorktreeMetadata> {
  const metadata = buildWorktreeMetadata(input);
  const repoRoot = resolve(input.repoRoot);
  const currentBranch = await getCurrentGitBranch(repoRoot);
  assertNotMainBranch(currentBranch, input.allowMainExecution ?? false);
  await assertGitRepositoryRoot(repoRoot);
  await mkdir(resolve(repoRoot, input.worktreeBaseDir ?? "../worktrees"), { recursive: true });

  if (await worktreeExists(repoRoot, metadata.worktreePath)) {
    return { ...metadata, created: false };
  }

  await git(repoRoot, ["worktree", "add", "-B", metadata.branch, metadata.worktreePath, metadata.baseBranch]);
  return { ...metadata, created: true };
}

export function buildWorktreeMetadata(input: WorktreeRequest): WorktreeMetadata {
  const repoRoot = resolve(input.repoRoot);
  const issueId = sanitizeSlug(input.issueId);
  const agentName = sanitizeSlug(input.agentName);
  const baseBranch = sanitizeBranchPart(input.baseBranch ?? "main");
  const worktreeBaseDir = input.worktreeBaseDir ?? "../worktrees";
  const branch = `agent/${issueId}/${sanitizeBranchPart(agentName)}`;
  const worktreePath = resolve(repoRoot, worktreeBaseDir, `issue-${issueId}-${agentName}`);

  if (isMainBranch(branch)) {
    throw new Error("Generated worktree branch must not be main");
  }

  return {
    issueId,
    agentName,
    branch,
    worktreePath,
    baseBranch,
    created: false
  };
}

export function assertNotMainBranch(branch: string | null, allowMainExecution: boolean): void {
  if (branch && isMainBranch(branch) && !allowMainExecution) {
    throw new Error("Operation refused on main/master without explicit allowMainExecution");
  }
}

export async function getCurrentGitBranch(repoRoot: string): Promise<string | null> {
  const result = await git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => null);
  const branch = result?.stdout.trim();
  return branch && branch !== "HEAD" ? branch : null;
}

export async function getGitOrigin(repoRoot: string): Promise<string | null> {
  const result = await git(repoRoot, ["remote", "get-url", "origin"]).catch(() => null);
  return result?.stdout.trim() || null;
}

export async function getGitDefaultBranch(repoRoot: string): Promise<string | null> {
  const originHead = await git(repoRoot, ["symbolic-ref", "refs/remotes/origin/HEAD"]).catch(() => null);
  const originBranch = originHead?.stdout.trim().replace(/^refs\/remotes\/origin\//, "");
  if (originBranch) {
    return originBranch;
  }
  return (await branchExists(repoRoot, "main")) ? "main" : (await branchExists(repoRoot, "master")) ? "master" : null;
}

export async function gitStatusShort(repoRoot: string): Promise<string> {
  return (await git(repoRoot, ["status", "--short"])).stdout;
}

export async function gitDiff(repoRoot: string): Promise<string> {
  return (await git(repoRoot, ["diff", "--binary"])).stdout;
}

export async function gitChangedFiles(repoRoot: string): Promise<string[]> {
  const result = await git(repoRoot, ["status", "--short"]);
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^..?\s+/, "").replace(/^"|"$/g, ""))
    .map((line) => line.split(" -> ").pop() ?? line)
    .map((line) => line.replace(/\\/g, "/"))
    .sort((left, right) => left.localeCompare(right, "en"));
}

export async function git(repoRoot: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync("git", args, {
    cwd: repoRoot,
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024
  });

  return {
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString()
  };
}

async function assertGitRepositoryRoot(repoRoot: string): Promise<void> {
  const result = await git(repoRoot, ["rev-parse", "--show-toplevel"]);
  const actual = resolve(result.stdout.trim());
  if (actual.toLowerCase() !== resolve(repoRoot).toLowerCase()) {
    throw new Error(`Path is not the Git repository root: ${repoRoot}`);
  }
}

async function worktreeExists(repoRoot: string, worktreePath: string): Promise<boolean> {
  const result = await git(repoRoot, ["worktree", "list", "--porcelain"]);
  const normalized = resolve(worktreePath).toLowerCase();
  return result.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => resolve(line.slice("worktree ".length)).toLowerCase())
    .includes(normalized);
}

async function branchExists(repoRoot: string, branch: string): Promise<boolean> {
  const result = await git(repoRoot, ["rev-parse", "--verify", branch]).catch(() => null);
  return Boolean(result);
}

function sanitizeSlug(value: string): string {
  const basenameValue = basename(value.trim());
  const normalized = basenameValue
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) {
    throw new Error(`Invalid worktree identifier: ${value}`);
  }
  return normalized;
}

function sanitizeBranchPart(value: string): string {
  const normalized = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/[^A-Za-z0-9._/-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized.includes("..") || normalized.endsWith(".lock")) {
    throw new Error(`Invalid branch name: ${value}`);
  }
  return normalized;
}

function isMainBranch(branch: string): boolean {
  return branch === "main" || branch === "master";
}
