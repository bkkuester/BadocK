import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export type GitProjectState = "none" | "local" | "remote" | "github";

export type GitSummary = {
  hasGit: boolean;
  state: GitProjectState;
  branch: string | null;
  remoteUrl: string | null;
  isGitHubRemote: boolean;
};

export type DetectedProjectFiles = {
  packageJson: string | null;
  lockfiles: string[];
  tsconfigs: string[];
  readmes: string[];
  workflows: string[];
};

export type ProjectScanSummary = {
  rootPath: string;
  detectedFiles: DetectedProjectFiles;
  packageScripts: Record<string, string>;
  packageManagerField: string | null;
  dependencies: string[];
  devDependencies: string[];
  git: GitSummary;
  warnings: string[];
};

export type ValidationScriptKind = "check" | "test" | "build" | "lint";

export type ValidationScript = {
  kind: ValidationScriptKind;
  name: string;
  command: string;
};

export type StackProfile = {
  projectRoot: string;
  language: "typescript" | "javascript" | "unknown";
  runtime: "node" | "unknown";
  packageManager: "pnpm" | "npm" | "yarn" | "bun" | "unknown";
  validationScripts: ValidationScript[];
  detectedFrom: {
    packageJson: boolean;
    tsconfig: boolean;
    lockfiles: string[];
  };
};

const lockfilePackageManagers: Array<[fileName: string, packageManager: StackProfile["packageManager"]]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["package-lock.json", "npm"],
  ["npm-shrinkwrap.json", "npm"],
  ["yarn.lock", "yarn"],
  ["bun.lockb", "bun"],
  ["bun.lock", "bun"]
];

export async function scanProject(projectPath: string): Promise<ProjectScanSummary> {
  const rootPath = resolve(projectPath);
  await assertDirectory(rootPath);

  const rootEntries = await safeReaddir(rootPath);
  const packageJson = rootEntries.includes("package.json") ? "package.json" : null;
  const lockfiles = lockfilePackageManagers
    .map(([fileName]) => fileName)
    .filter((fileName) => rootEntries.includes(fileName));
  const tsconfigs = rootEntries
    .filter((fileName) => /^tsconfig(?:\..+)?\.json$/i.test(fileName))
    .sort(compareStable);
  const readmes = rootEntries.filter((fileName) => /^readme(?:\..*)?$/i.test(fileName)).sort(compareStable);
  const workflows = await detectWorkflows(rootPath);
  const warnings: string[] = [];
  const packageMetadata = packageJson ? await readPackageMetadata(join(rootPath, packageJson), warnings) : null;

  return {
    rootPath,
    detectedFiles: {
      packageJson,
      lockfiles,
      tsconfigs,
      readmes,
      workflows
    },
    packageScripts: packageMetadata?.scripts ?? {},
    packageManagerField: packageMetadata?.packageManager ?? null,
    dependencies: packageMetadata?.dependencies ?? [],
    devDependencies: packageMetadata?.devDependencies ?? [],
    git: await detectGit(rootPath),
    warnings
  };
}

export function createStackProfile(scan: ProjectScanSummary): StackProfile {
  const hasPackageJson = scan.detectedFiles.packageJson !== null;
  const hasTypeScript =
    scan.detectedFiles.tsconfigs.length > 0 ||
    scan.dependencies.includes("typescript") ||
    scan.devDependencies.includes("typescript");

  return {
    projectRoot: scan.rootPath,
    language: hasTypeScript ? "typescript" : hasPackageJson ? "javascript" : "unknown",
    runtime: hasPackageJson ? "node" : "unknown",
    packageManager: detectPackageManager(scan),
    validationScripts: detectValidationScripts(scan.packageScripts),
    detectedFrom: {
      packageJson: hasPackageJson,
      tsconfig: scan.detectedFiles.tsconfigs.length > 0,
      lockfiles: [...scan.detectedFiles.lockfiles]
    }
  };
}

function detectPackageManager(scan: ProjectScanSummary): StackProfile["packageManager"] {
  for (const [lockfile, packageManager] of lockfilePackageManagers) {
    if (scan.detectedFiles.lockfiles.includes(lockfile)) {
      return packageManager;
    }
  }

  const packageManagerName = scan.packageManagerField?.split("@")[0]?.toLowerCase();
  if (packageManagerName === "pnpm" || packageManagerName === "npm" || packageManagerName === "yarn") {
    return packageManagerName;
  }
  if (packageManagerName === "bun") {
    return "bun";
  }

  return "unknown";
}

function detectValidationScripts(scripts: Record<string, string>): ValidationScript[] {
  const result: ValidationScript[] = [];
  const preferredOrder: ValidationScriptKind[] = ["check", "test", "build", "lint"];

  for (const kind of preferredOrder) {
    for (const [name, command] of Object.entries(scripts).sort(([left], [right]) => compareStable(left, right))) {
      if (scriptMatchesKind(name, kind)) {
        result.push({ kind, name, command });
      }
    }
  }

  return result;
}

function scriptMatchesKind(name: string, kind: ValidationScriptKind): boolean {
  const normalized = name.toLowerCase();
  if (kind === "check") {
    return normalized === "check" || normalized.includes("typecheck") || normalized.includes("validate");
  }
  return normalized === kind || normalized.startsWith(`${kind}:`) || normalized.endsWith(`:${kind}`);
}

async function detectWorkflows(rootPath: string): Promise<string[]> {
  const workflowsRoot = join(rootPath, ".github", "workflows");
  const entries = await safeReaddir(workflowsRoot);
  return entries
    .filter((fileName) => /\.(?:ya?ml)$/i.test(fileName))
    .map((fileName) => join(".github", "workflows", fileName).replace(/\\/g, "/"))
    .sort(compareStable);
}

async function detectGit(rootPath: string): Promise<GitSummary> {
  const gitPath = join(rootPath, ".git");
  if (!(await pathExists(gitPath))) {
    return {
      hasGit: false,
      state: "none",
      branch: null,
      remoteUrl: null,
      isGitHubRemote: false
    };
  }

  const gitDir = await resolveGitDir(rootPath, gitPath);
  const config = gitDir ? await safeReadFile(join(gitDir, "config")) : null;
  const head = gitDir ? await safeReadFile(join(gitDir, "HEAD")) : null;
  const remoteUrl = config ? parseOriginRemoteUrl(config) : null;
  const isGitHubRemote = remoteUrl ? /github\.com[:/]/i.test(remoteUrl) : false;

  return {
    hasGit: true,
    state: isGitHubRemote ? "github" : remoteUrl ? "remote" : "local",
    branch: head ? parseBranch(head) : null,
    remoteUrl,
    isGitHubRemote
  };
}

async function resolveGitDir(rootPath: string, gitPath: string): Promise<string | null> {
  const gitPathStat = await stat(gitPath).catch(() => null);
  if (!gitPathStat) {
    return null;
  }
  if (gitPathStat.isDirectory()) {
    return gitPath;
  }

  const gitFile = await safeReadFile(gitPath);
  const match = gitFile?.match(/^gitdir:\s*(.+)$/im);
  if (!match) {
    return null;
  }

  const candidate = match[1]?.trim();
  if (!candidate) {
    return null;
  }

  return resolve(dirname(gitPath), candidate);
}

function parseOriginRemoteUrl(config: string): string | null {
  const lines = config.split(/\r?\n/);
  let inOrigin = false;

  for (const line of lines) {
    const section = line.match(/^\s*\[(.+)]\s*$/);
    if (section) {
      inOrigin = section[1] === 'remote "origin"';
      continue;
    }

    if (inOrigin) {
      const remoteUrl = line.match(/^\s*url\s*=\s*(.+?)\s*$/);
      if (remoteUrl) {
        return remoteUrl[1] ?? null;
      }
    }
  }

  return null;
}

function parseBranch(head: string): string | null {
  const match = head.trim().match(/^ref:\s+refs\/heads\/(.+)$/);
  return match?.[1] ?? null;
}

type PackageMetadata = {
  scripts: Record<string, string>;
  packageManager: string | null;
  dependencies: string[];
  devDependencies: string[];
};

async function readPackageMetadata(packageJsonPath: string, warnings: string[]): Promise<PackageMetadata> {
  try {
    const raw = await readFile(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as {
      scripts?: unknown;
      packageManager?: unknown;
      dependencies?: unknown;
      devDependencies?: unknown;
    };

    return {
      scripts: readStringRecord(parsed.scripts),
      packageManager: typeof parsed.packageManager === "string" ? parsed.packageManager : null,
      dependencies: Object.keys(readStringRecord(parsed.dependencies)).sort(compareStable),
      devDependencies: Object.keys(readStringRecord(parsed.devDependencies)).sort(compareStable)
    };
  } catch (error) {
    warnings.push(`package.json could not be parsed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      scripts: {},
      packageManager: null,
      dependencies: [],
      devDependencies: []
    };
  }
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .sort(([left], [right]) => compareStable(left, right))
  );
}

async function assertDirectory(path: string): Promise<void> {
  const pathStat = await stat(path).catch(() => null);
  if (!pathStat || !pathStat.isDirectory()) {
    throw new Error(`Project path does not exist or is not a directory: ${path}`);
  }
}

async function pathExists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null)) !== null;
}

async function safeReadFile(path: string): Promise<string | null> {
  return await readFile(path, "utf8").catch(() => null);
}

async function safeReaddir(path: string): Promise<string[]> {
  return (await readdir(path).catch(() => [])).sort(compareStable);
}

function compareStable(left: string, right: string): number {
  return left.localeCompare(right, "en");
}
