import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GitHubAvailability = {
  ghFound: boolean;
  authenticated: boolean;
  warning: string | null;
};

export async function detectGitHubCli(): Promise<GitHubAvailability> {
  const version = await runGh(["--version"]).catch(() => null);
  if (!version) {
    return {
      ghFound: false,
      authenticated: false,
      warning: "gh CLI not found; GitHub sync is unavailable"
    };
  }

  const auth = await runGh(["auth", "status"]).catch((error) => error);
  if (auth instanceof Error) {
    return {
      ghFound: true,
      authenticated: false,
      warning: "gh auth unavailable; GitHub sync disabled"
    };
  }

  return {
    ghFound: true,
    authenticated: true,
    warning: null
  };
}

export async function openGitHubPullRequest(input: {
  repoRoot: string;
  baseBranch: string;
  title: string;
  body: string;
  draft?: boolean;
}): Promise<string> {
  const branch = (await runGit(input.repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  if (branch === "main" || branch === "master") {
    throw new Error("Refusing to open a PR from main/master");
  }

  const args = [
    "pr",
    "create",
    "--base",
    input.baseBranch,
    "--head",
    branch,
    "--title",
    input.title,
    "--body",
    input.body
  ];
  if (input.draft) {
    args.push("--draft");
  }

  return (await runGh(args, input.repoRoot)).trim();
}

export async function listGitHubIssues(repoRoot: string): Promise<string> {
  return runGh(["issue", "list", "--limit", "50"], repoRoot);
}

export async function publishLocalIssueToGitHub(input: {
  repoRoot: string;
  title: string;
  body: string;
}): Promise<string> {
  return (
    await runGh(
      ["issue", "create", "--title", input.title, "--body", input.body],
      input.repoRoot
    )
  ).trim();
}

async function runGh(args: string[], cwd?: string): Promise<string> {
  const result = await execFileAsync("gh", args, {
    cwd,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  });
  return result.stdout.toString();
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024
  });
  return result.stdout.toString();
}
