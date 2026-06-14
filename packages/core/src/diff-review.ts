import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getRunArtifactPath, readRunManifest, type RunManifest } from "./run-store";
import { sanitizeSensitiveText } from "./security";

export const reviewStatuses = ["approved", "approved_with_warnings", "blocked", "needs_user_decision"] as const;

export type ReviewStatus = (typeof reviewStatuses)[number];

export type DiffReviewFinding = {
  severity: "info" | "warning" | "blocker";
  code: string;
  message: string;
  file?: string;
};

export type DiffReviewResult = {
  runId: string;
  status: ReviewStatus;
  reviewedAt: string;
  changedFiles: string[];
  findings: DiffReviewFinding[];
};

export type ReviewRunInput = {
  projectRoot: string;
  runId: string;
};

const runArtifactPatterns = [/^\.agents\/runs\//i, /^\.badock\/runs\//i];
const envPatterns = [/^\.env(?:\.|$)/i, /(^|\/)\.env(?:\.|$)/i, /(^|\/)(?:secrets?|credentials?)(?:\/|$)/i];
const workflowPattern = /^\.github\/workflows\//i;
const lockfilePattern = /(^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|npm-shrinkwrap\.json)$/i;
const packageManagerPattern = /(^|\/)package\.json$/i;
const largeDiffThreshold = 3000;

export async function reviewRunDiff(input: ReviewRunInput): Promise<DiffReviewResult> {
  const root = resolve(input.projectRoot);
  const manifest = await readRunManifest(root, input.runId);
  const diff = await readFile(getRunArtifactPath(root, manifest.runId, manifest.artifacts.diff), "utf8").catch(() => "");
  const changedFiles = Array.from(new Set([...manifest.filesChanged, ...extractFilesFromDiff(diff)])).sort(compareStable);
  const findings = buildFindings(manifest, changedFiles, diff);
  const result: DiffReviewResult = {
    runId: manifest.id,
    status: statusFromFindings(findings),
    reviewedAt: new Date().toISOString(),
    changedFiles,
    findings
  };

  await Promise.all([
    writeFile(getRunArtifactPath(root, manifest.runId, "review.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8"),
    writeFile(getRunArtifactPath(root, manifest.runId, "review.md"), formatReviewMarkdown(result), "utf8")
  ]);

  return result;
}

export function extractFilesFromDiff(diff: string): string[] {
  const files: string[] = [];
  for (const line of diff.split(/\r?\n/)) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (match?.[2]) {
      files.push(match[2].replace(/\\/g, "/"));
    }
  }
  return Array.from(new Set(files)).sort(compareStable);
}

export function buildFindings(
  manifest: Pick<RunManifest, "id" | "summaryPath" | "allowedFiles">,
  changedFiles: string[],
  diff: string
): DiffReviewFinding[] {
  const findings: DiffReviewFinding[] = [];
  const allowedFiles = new Set(manifest.allowedFiles.map(normalizePath));

  if (changedFiles.length === 0) {
    findings.push({
      severity: "warning",
      code: "no_changed_files",
      message: "Run has no changed files."
    });
  }

  for (const file of changedFiles) {
    const normalized = normalizePath(file);
    if (runArtifactPatterns.some((pattern) => pattern.test(normalized))) {
      findings.push({
        severity: "blocker",
        code: "run_artifact_in_diff",
        message: "Run artifacts must not be included in product diffs.",
        file
      });
    }
    if (envPatterns.some((pattern) => pattern.test(normalized))) {
      findings.push({
        severity: "blocker",
        code: "sensitive_file_changed",
        message: "Secrets, env files or credential paths require explicit security approval.",
        file
      });
    }
    if (allowedFiles.size > 0 && !allowedFiles.has(normalized)) {
      findings.push({
        severity: "blocker",
        code: "file_out_of_scope",
        message: "Changed file is outside the issue allowed file scope.",
        file
      });
    }
    if (workflowPattern.test(normalized)) {
      findings.push({
        severity: "warning",
        code: "workflow_changed",
        message: "GitHub Actions changes require explicit CI authorization.",
        file
      });
    }
    if (lockfilePattern.test(normalized)) {
      findings.push({
        severity: "warning",
        code: "lockfile_changed",
        message: "Lockfile changes require dependency/change-control review.",
        file
      });
    }
    if (packageManagerPattern.test(normalized)) {
      findings.push({
        severity: "warning",
        code: "package_manifest_changed",
        message: "Package manager metadata changed.",
        file
      });
    }
  }

  if (!manifest.summaryPath) {
    findings.push({
      severity: "warning",
      code: "missing_summary",
      message: "Run summary is missing from manifest."
    });
  }

  if (diff.split(/\r?\n/).length > largeDiffThreshold) {
    findings.push({
      severity: "warning",
      code: "large_diff",
      message: `Diff is larger than ${largeDiffThreshold} lines.`
    });
  }

  return findings;
}

export function formatReviewMarkdown(result: DiffReviewResult): string {
  return sanitizeSensitiveText(
    [
      `# Review ${result.runId}`,
      "",
      `Status: ${result.status}`,
      `Reviewed at: ${result.reviewedAt}`,
      "",
      "## Changed Files",
      "",
      result.changedFiles.length > 0 ? result.changedFiles.map((file) => `- ${file}`).join("\n") : "- none",
      "",
      "## Findings",
      "",
      result.findings.length > 0
        ? result.findings.map((finding) => `- ${finding.severity}: ${finding.code}${finding.file ? ` (${finding.file})` : ""} - ${finding.message}`).join("\n")
        : "- none",
      ""
    ].join("\n")
  );
}

function statusFromFindings(findings: DiffReviewFinding[]): ReviewStatus {
  if (findings.some((finding) => finding.severity === "blocker")) {
    return "blocked";
  }
  if (findings.some((finding) => finding.code === "workflow_changed" || finding.code === "lockfile_changed")) {
    return "needs_user_decision";
  }
  if (findings.some((finding) => finding.severity === "warning")) {
    return "approved_with_warnings";
  }
  return "approved";
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function compareStable(left: string, right: string): number {
  return left.localeCompare(right, "en");
}
