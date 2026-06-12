import type { NormalizedLocalIssue } from "./issues";
import type { StackProfile, ValidationScript } from "./project";

export type RunPlan = {
  projectId: string;
  issueId: string;
  objective: string;
  scope: string[];
  candidateFiles: string[];
  suggestedValidations: string[];
  risks: string[];
  acceptanceCriteria: string[];
  requiresManualReview: true;
  executionAuthorized: false;
};

export type GenerateRunPlanInput = {
  projectId: string;
  issueId: string;
  issue: Pick<
    NormalizedLocalIssue,
    "title" | "objective" | "scope" | "suggestedAgents" | "acceptanceCriteria" | "files"
  >;
  stackProfile?: Pick<StackProfile, "validationScripts">;
};

export function generateRunPlan(input: GenerateRunPlanInput): RunPlan {
  const suggestedValidations = buildSuggestedValidations(input.issue.acceptanceCriteria, input.stackProfile);

  return {
    projectId: input.projectId,
    issueId: input.issueId,
    objective: input.issue.objective,
    scope: input.issue.scope,
    candidateFiles: input.issue.files,
    suggestedValidations,
    risks: buildRisks(input.issue, suggestedValidations),
    acceptanceCriteria: input.issue.acceptanceCriteria,
    requiresManualReview: true,
    executionAuthorized: false
  };
}

function buildSuggestedValidations(
  acceptanceCriteria: string[],
  stackProfile: Pick<StackProfile, "validationScripts"> | undefined
): string[] {
  const criteriaChecks = acceptanceCriteria.map((criterion) => `Review acceptance criterion: ${criterion}`);
  const scriptChecks = (stackProfile?.validationScripts ?? []).map(formatValidationScript);
  return [...criteriaChecks, ...scriptChecks];
}

function formatValidationScript(script: ValidationScript): string {
  return `Run ${script.kind} script when explicitly approved: ${script.name}`;
}

function buildRisks(
  issue: Pick<NormalizedLocalIssue, "suggestedAgents" | "files">,
  suggestedValidations: string[]
): string[] {
  const risks: string[] = ["RunPlan requires manual review before execution"];

  if (issue.files.length === 0) {
    risks.push("Issue does not name candidate files");
  }

  if (issue.suggestedAgents.length === 0) {
    risks.push("Issue does not name suggested agents");
  }

  if (suggestedValidations.length === 0) {
    risks.push("No validation was inferred from acceptance criteria or stack profile");
  }

  return risks;
}
