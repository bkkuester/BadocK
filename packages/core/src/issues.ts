export const issueStates = ["open", "planned", "running", "closed"] as const;

export type IssueState = (typeof issueStates)[number];

export type LocalIssueInput = {
  title: string;
  objective: string;
  scope: string[];
  suggestedAgents: string[];
  acceptanceCriteria: string[];
  technicalNotes?: string;
  files?: string[];
  state?: IssueState;
};

export type NormalizedLocalIssue = {
  title: string;
  objective: string;
  scope: string[];
  suggestedAgents: string[];
  acceptanceCriteria: string[];
  technicalNotes: string;
  files: string[];
  state: IssueState;
};

export function normalizeLocalIssueInput(input: LocalIssueInput): NormalizedLocalIssue {
  const normalized = {
    title: normalizeRequiredText(input.title, "title"),
    objective: normalizeRequiredText(input.objective, "objective"),
    scope: normalizeRequiredList(input.scope, "scope"),
    suggestedAgents: normalizeRequiredList(input.suggestedAgents, "suggestedAgents"),
    acceptanceCriteria: normalizeRequiredList(input.acceptanceCriteria, "acceptanceCriteria"),
    technicalNotes: input.technicalNotes?.trim() ?? "",
    files: normalizeOptionalList(input.files),
    state: input.state ?? "open"
  };

  if (!isIssueState(normalized.state)) {
    throw new Error(`Invalid issue state: ${normalized.state}`);
  }

  return normalized;
}

export function isIssueState(value: string): value is IssueState {
  return issueStates.includes(value as IssueState);
}

function normalizeRequiredText(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`Issue ${fieldName} is required`);
  }
  return normalized;
}

function normalizeRequiredList(value: string[], fieldName: string): string[] {
  const normalized = normalizeOptionalList(value);
  if (normalized.length === 0) {
    throw new Error(`Issue ${fieldName} must include at least one item`);
  }
  return normalized;
}

function normalizeOptionalList(value: string[] | undefined): string[] {
  return Array.from(new Set((value ?? []).map((item) => item.trim()).filter(Boolean)));
}
