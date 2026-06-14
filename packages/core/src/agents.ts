import type { PermissionMode } from "./permissions";
import type { ProviderPublicConfig } from "./provider";
import type { NormalizedLocalIssue } from "./issues";
import type { StackProfile } from "./project";

export type AgentProfile = {
  id: string;
  role: string;
  providerId: string;
  model: string;
  permissionMode: PermissionMode;
  capabilities: string[];
};

export type AgentSelectionSource = "manual" | "suggested";

export type AgentSelection = {
  agentId: string;
  role: string;
  providerId: string;
  model: string;
  permissionMode: PermissionMode;
  source: AgentSelectionSource;
  reason: string;
  editable: true;
};

export type AgentRegistryErrorCode = "agent_not_found" | "agent_invalid" | "agent_provider_missing";

export class AgentRegistryError extends Error {
  readonly code: AgentRegistryErrorCode;
  readonly agentId?: string;

  constructor(code: AgentRegistryErrorCode, message: string, agentId?: string) {
    super(message);
    this.name = "AgentRegistryError";
    this.code = code;
    this.agentId = agentId;
  }
}

export class AgentRegistry {
  private readonly agents = new Map<string, AgentProfile>();

  constructor(agents: AgentProfile[] = []) {
    for (const agent of agents) {
      this.registerAgent(agent);
    }
  }

  registerAgent(input: AgentProfile): AgentProfile {
    const agent = normalizeAgentProfile(input);
    this.agents.set(agent.id, agent);
    return agent;
  }

  getAgent(agentId: string): AgentProfile | null {
    return this.agents.get(agentId) ?? null;
  }

  listAgents(): AgentProfile[] {
    return [...this.agents.values()].sort((left, right) => left.id.localeCompare(right.id, "en"));
  }
}

export type SelectAgentForRunInput = {
  agentId: string;
  agents: AgentProfile[];
  providers: Array<Pick<ProviderPublicConfig, "id">>;
};

export function selectAgentForRun(input: SelectAgentForRunInput): AgentSelection {
  const registry = new AgentRegistry(input.agents);
  const agent = registry.getAgent(input.agentId);
  if (!agent) {
    throw new AgentRegistryError("agent_not_found", `Agent not found: ${input.agentId}`, input.agentId);
  }
  assertAgentProviderConfigured(agent, input.providers);

  return agentToSelection(agent, "manual", "Agent selected manually before run");
}

export type SuggestAgentForIssueInput = {
  issue: Pick<NormalizedLocalIssue, "title" | "objective" | "scope" | "suggestedAgents">;
  agents: AgentProfile[];
  providers?: Array<Pick<ProviderPublicConfig, "id">>;
  stackProfile?: Partial<Pick<StackProfile, "language" | "runtime" | "packageManager">>;
};

export function suggestAgentForIssue(input: SuggestAgentForIssueInput): AgentSelection | null {
  const agents = input.agents.map(normalizeAgentProfile);
  if (agents.length === 0) {
    return null;
  }

  const configuredAgents = input.providers ? agents.filter((agent) => providerExists(agent, input.providers ?? [])) : agents;
  const candidates = configuredAgents.length > 0 ? configuredAgents : agents;
  const explicit = input.issue.suggestedAgents
    .map((agentId) => candidates.find((agent) => agent.id === agentId))
    .find((agent): agent is AgentProfile => Boolean(agent));

  if (explicit) {
    return agentToSelection(explicit, "suggested", "Issue suggested this agent");
  }

  return null;
}

export function normalizeAgentProfile(input: AgentProfile): AgentProfile {
  const id = normalizeRequiredText(input.id, "agent id");
  const role = normalizeRequiredText(input.role, "agent role");
  const providerId = normalizeRequiredText(input.providerId, "agent providerId");
  const model = normalizeRequiredText(input.model, "agent model");
  if (input.permissionMode !== "manual" && input.permissionMode !== "supervised" && input.permissionMode !== "autonomous") {
    throw new AgentRegistryError("agent_invalid", `Invalid permission mode for agent "${id}"`, id);
  }

  return {
    id,
    role,
    providerId,
    model,
    permissionMode: input.permissionMode,
    capabilities: normalizeList(input.capabilities)
  };
}

export function assertAgentProviderConfigured(
  agent: AgentProfile,
  providers: Array<Pick<ProviderPublicConfig, "id">>
): void {
  if (!providerExists(agent, providers)) {
    throw new AgentRegistryError(
      "agent_provider_missing",
      `Agent "${agent.id}" references unconfigured provider "${agent.providerId}"`,
      agent.id
    );
  }
}

function agentToSelection(agent: AgentProfile, source: AgentSelectionSource, reason: string): AgentSelection {
  return {
    agentId: agent.id,
    role: agent.role,
    providerId: agent.providerId,
    model: agent.model,
    permissionMode: agent.permissionMode,
    source,
    reason,
    editable: true
  };
}

function providerExists(agent: AgentProfile, providers: Array<Pick<ProviderPublicConfig, "id">>): boolean {
  return providers.some((provider) => provider.id === agent.providerId);
}

function normalizeRequiredText(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new AgentRegistryError("agent_invalid", `${fieldName} is required`);
  }
  return normalized;
}

function normalizeList(value: string[]): string[] {
  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, "en")
  );
}
