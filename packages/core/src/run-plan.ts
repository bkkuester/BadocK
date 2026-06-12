import type { NormalizedLocalIssue } from "./issues";
import type { StackProfile, ValidationScript } from "./project";
import {
  type AgentProfile,
  type AgentSelection,
  selectAgentForRun,
  suggestAgentForIssue
} from "./agents";
import type { ProviderPublicConfig } from "./provider";

export type RunPlan = {
  projectId: string;
  issueId: string;
  objective: string;
  scope: string[];
  candidateFiles: string[];
  suggestedValidations: string[];
  risks: string[];
  acceptanceCriteria: string[];
  agentSelection: AgentSelection | null;
  providerMetadata: RunPlanProviderMetadata | null;
  requiresManualReview: true;
  executionAuthorized: false;
};

export type RunPlanProviderMetadata = {
  providerId: string;
  providerType: ProviderPublicConfig["type"] | "unknown";
  model: string;
  permissionMode: AgentSelection["permissionMode"];
  costTrackingReady: boolean;
};

export type GenerateRunPlanInput = {
  projectId: string;
  issueId: string;
  issue: Pick<
    NormalizedLocalIssue,
    "title" | "objective" | "scope" | "suggestedAgents" | "acceptanceCriteria" | "files"
  >;
  stackProfile?: Pick<StackProfile, "validationScripts"> &
    Partial<Pick<StackProfile, "language" | "runtime" | "packageManager">>;
  agents?: AgentProfile[];
  providers?: ProviderPublicConfig[];
  selectedAgentId?: string;
};

export function generateRunPlan(input: GenerateRunPlanInput): RunPlan {
  const suggestedValidations = buildSuggestedValidations(input.issue.acceptanceCriteria, input.stackProfile);
  const agentSelection = resolveAgentSelection(input);
  const providerMetadata = agentSelection ? buildProviderMetadata(agentSelection, input.providers ?? []) : null;

  return {
    projectId: input.projectId,
    issueId: input.issueId,
    objective: input.issue.objective,
    scope: input.issue.scope,
    candidateFiles: input.issue.files,
    suggestedValidations,
    risks: buildRisks(input.issue, suggestedValidations, agentSelection, input.selectedAgentId),
    acceptanceCriteria: input.issue.acceptanceCriteria,
    agentSelection,
    providerMetadata,
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
  suggestedValidations: string[],
  agentSelection: AgentSelection | null,
  selectedAgentId: string | undefined
): string[] {
  const risks: string[] = ["RunPlan requires manual review before execution"];

  if (issue.files.length === 0) {
    risks.push("Issue does not name candidate files");
  }

  if (issue.suggestedAgents.length === 0 && !agentSelection) {
    risks.push("Issue does not name suggested agents");
  }

  if (agentSelection?.source === "suggested" && !selectedAgentId) {
    risks.push("Agent selection is an editable suggestion and must be confirmed before execution");
  }

  if (suggestedValidations.length === 0) {
    risks.push("No validation was inferred from acceptance criteria or stack profile");
  }

  return risks;
}

function resolveAgentSelection(input: GenerateRunPlanInput): AgentSelection | null {
  const agents = input.agents ?? [];
  const providers = input.providers ?? [];

  if (input.selectedAgentId) {
    return selectAgentForRun({
      agentId: input.selectedAgentId,
      agents,
      providers
    });
  }

  return suggestAgentForIssue({
    issue: input.issue,
    agents,
    providers: providers.length > 0 ? providers : undefined,
    stackProfile: input.stackProfile
  });
}

function buildProviderMetadata(
  agentSelection: AgentSelection,
  providers: ProviderPublicConfig[]
): RunPlanProviderMetadata {
  const provider = providers.find((candidate) => candidate.id === agentSelection.providerId);
  return {
    providerId: agentSelection.providerId,
    providerType: provider?.type ?? "unknown",
    model: agentSelection.model,
    permissionMode: agentSelection.permissionMode,
    costTrackingReady: Boolean(provider)
  };
}
