export const costRecordSources = ["not_available", "estimated", "reported_by_provider", "manual"] as const;

export type CostRecordSource = (typeof costRecordSources)[number];

export type RunCostRecord = {
  provider: string;
  model: string;
  agent: string;
  issueId: string;
  runId: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  estimated: boolean;
  source: CostRecordSource;
};

export function createUnavailableCostRecord(input: {
  provider?: string | null;
  model?: string | null;
  agent: string;
  issueId: string;
  runId: string;
}): RunCostRecord {
  return {
    provider: normalizeText(input.provider) ?? "codex-cli",
    model: normalizeText(input.model) ?? "unknown",
    agent: normalizeText(input.agent) ?? "unknown",
    issueId: normalizeText(input.issueId) ?? "unknown",
    runId: normalizeText(input.runId) ?? "unknown",
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    estimated: false,
    source: "not_available"
  };
}

function normalizeText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
