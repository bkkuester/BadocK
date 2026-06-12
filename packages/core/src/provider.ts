import {
  assertNoSensitiveKeys,
  sanitizeForPublicOutput,
  sanitizeSensitiveText
} from "./security";

export const providerTypes = ["mock", "openai-compatible", "local-process", "custom"] as const;

export type ProviderType = (typeof providerTypes)[number];

export type ProviderParameterValue = string | number | boolean;

export type ProviderPublicConfig = {
  id: string;
  type: ProviderType;
  endpoint?: string;
  defaultModel?: string;
  parameters?: Record<string, ProviderParameterValue>;
};

export type SafeProviderProfile = ProviderPublicConfig & {
  secretConfigured: boolean;
};

export type ModelCallPurpose = "plan" | "review" | "report" | "generic";

export type ModelCallRequest = {
  providerId: string;
  model?: string;
  purpose: ModelCallPurpose;
  prompt: string;
  parameters?: Record<string, ProviderParameterValue>;
};

export type ModelCallMetadata = {
  providerId: string;
  providerType: ProviderType;
  model: string;
  purpose: ModelCallPurpose;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  currency: "USD";
  estimated: true;
};

export type ModelCallResult = {
  output: string;
  metadata: ModelCallMetadata;
};

export type ProviderAdapter = {
  id: string;
  supports(provider: ProviderPublicConfig): boolean;
  call(request: ModelCallRequest & { model: string }, context: ProviderAdapterContext): Promise<ModelCallResult>;
};

export type ProviderAdapterContext = {
  provider: ProviderPublicConfig;
  secret: string | null;
};

export type ProviderSecretStore = {
  hasSecret(providerId: string): boolean;
  getSecret(providerId: string): string | null;
};

export type ProviderGatewayOptions = {
  providers?: ProviderPublicConfig[];
  adapters?: ProviderAdapter[];
  secretStore?: ProviderSecretStore;
};

export type ProviderGatewayErrorCode =
  | "provider_not_found"
  | "provider_invalid"
  | "adapter_not_found"
  | "provider_call_failed";

export class ProviderGatewayError extends Error {
  readonly code: ProviderGatewayErrorCode;
  readonly providerId?: string;
  readonly safeMessage: string;
  readonly details?: unknown;

  constructor(
    code: ProviderGatewayErrorCode,
    message: string,
    options: { providerId?: string; details?: unknown } = {}
  ) {
    super(sanitizeSensitiveText(message));
    this.name = "ProviderGatewayError";
    this.code = code;
    this.providerId = options.providerId;
    this.safeMessage = sanitizeSensitiveText(message);
    this.details = sanitizeForPublicOutput(options.details);
  }

  toJSON(): Record<string, unknown> {
    return sanitizeForPublicOutput({
      code: this.code,
      providerId: this.providerId,
      message: this.safeMessage,
      details: this.details
    }) as Record<string, unknown>;
  }
}

export class MemoryProviderSecretStore implements ProviderSecretStore {
  private readonly secrets = new Map<string, string>();

  constructor(entries: Record<string, string> = {}) {
    for (const [providerId, secret] of Object.entries(entries)) {
      this.setSecret(providerId, secret);
    }
  }

  setSecret(providerId: string, secret: string): void {
    this.secrets.set(normalizeId(providerId, "providerId"), secret);
  }

  hasSecret(providerId: string): boolean {
    return this.secrets.has(providerId);
  }

  getSecret(providerId: string): string | null {
    return this.secrets.get(providerId) ?? null;
  }
}

export class ProviderGateway {
  private readonly providers = new Map<string, ProviderPublicConfig>();
  private readonly adapters: ProviderAdapter[];
  private readonly secretStore: ProviderSecretStore;

  constructor(options: ProviderGatewayOptions = {}) {
    this.adapters = options.adapters ?? [createMockProviderAdapter()];
    this.secretStore = options.secretStore ?? new MemoryProviderSecretStore();

    for (const provider of options.providers ?? []) {
      this.registerProvider(provider);
    }
  }

  registerProvider(input: ProviderPublicConfig): SafeProviderProfile {
    const provider = normalizeProviderConfig(input);
    this.providers.set(provider.id, provider);
    return this.toSafeProviderProfile(provider);
  }

  getProvider(providerId: string): SafeProviderProfile | null {
    const provider = this.providers.get(providerId);
    return provider ? this.toSafeProviderProfile(provider) : null;
  }

  listProviders(): SafeProviderProfile[] {
    return [...this.providers.values()]
      .sort((left, right) => left.id.localeCompare(right.id, "en"))
      .map((provider) => this.toSafeProviderProfile(provider));
  }

  async callModel(request: ModelCallRequest): Promise<ModelCallResult> {
    const provider = this.providers.get(request.providerId);
    if (!provider) {
      throw new ProviderGatewayError("provider_not_found", `Provider not found: ${request.providerId}`, {
        providerId: request.providerId
      });
    }

    const model = normalizeOptionalText(request.model ?? provider.defaultModel);
    if (!model) {
      throw new ProviderGatewayError("provider_invalid", `Provider "${provider.id}" has no model configured`, {
        providerId: provider.id
      });
    }

    const adapter = this.adapters.find((candidate) => candidate.supports(provider));
    if (!adapter) {
      throw new ProviderGatewayError("adapter_not_found", `No adapter registered for provider "${provider.id}"`, {
        providerId: provider.id
      });
    }

    try {
      const result = await adapter.call(
        {
          ...request,
          model,
          prompt: sanitizeSensitiveText(request.prompt)
        },
        {
          provider,
          secret: this.secretStore.getSecret(provider.id)
        }
      );

      return {
        output: sanitizeSensitiveText(result.output),
        metadata: sanitizeModelCallMetadata(result.metadata, provider, model, request.purpose)
      };
    } catch (error) {
      throw new ProviderGatewayError(
        "provider_call_failed",
        `Provider "${provider.id}" failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          providerId: provider.id,
          details: error
        }
      );
    }
  }

  private toSafeProviderProfile(provider: ProviderPublicConfig): SafeProviderProfile {
    return {
      ...provider,
      parameters: { ...(provider.parameters ?? {}) },
      secretConfigured: this.secretStore.hasSecret(provider.id)
    };
  }
}

export function createMockProviderAdapter(responses: Partial<Record<ModelCallPurpose, string>> = {}): ProviderAdapter {
  return {
    id: "mock",
    supports(provider) {
      return provider.type === "mock";
    },
    async call(request, context) {
      const output =
        responses[request.purpose] ??
        `mock ${request.purpose} response for ${context.provider.id}/${request.model}`;
      return {
        output,
        metadata: createEstimatedModelCallMetadata({
          provider: context.provider,
          model: request.model,
          purpose: request.purpose,
          prompt: request.prompt,
          output
        })
      };
    }
  };
}

export function createEstimatedModelCallMetadata(input: {
  provider: ProviderPublicConfig;
  model: string;
  purpose: ModelCallPurpose;
  prompt: string;
  output: string;
}): ModelCallMetadata {
  return {
    providerId: input.provider.id,
    providerType: input.provider.type,
    model: input.model,
    purpose: input.purpose,
    inputTokens: estimateTokens(input.prompt),
    outputTokens: estimateTokens(input.output),
    estimatedCost: 0,
    currency: "USD",
    estimated: true
  };
}

export function normalizeProviderConfig(input: ProviderPublicConfig): ProviderPublicConfig {
  assertNoSensitiveKeys(input, "provider config");

  const id = normalizeId(input.id, "provider id");
  if (!providerTypes.includes(input.type)) {
    throw new ProviderGatewayError("provider_invalid", `Invalid provider type for "${id}": ${String(input.type)}`, {
      providerId: id
    });
  }

  const endpoint = normalizeOptionalText(input.endpoint);
  if (endpoint) {
    try {
      new URL(endpoint);
    } catch {
      throw new ProviderGatewayError("provider_invalid", `Invalid provider endpoint for "${id}"`, {
        providerId: id
      });
    }
  }

  return {
    id,
    type: input.type,
    endpoint: endpoint ?? undefined,
    defaultModel: normalizeOptionalText(input.defaultModel) ?? undefined,
    parameters: normalizeProviderParameters(input.parameters)
  };
}

export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(words, text.trim().length > 0 ? 1 : 0);
}

function sanitizeModelCallMetadata(
  metadata: ModelCallMetadata,
  provider: ProviderPublicConfig,
  model: string,
  purpose: ModelCallPurpose
): ModelCallMetadata {
  return {
    providerId: provider.id,
    providerType: provider.type,
    model: sanitizeSensitiveText(metadata.model || model),
    purpose,
    inputTokens: Math.max(0, Math.trunc(metadata.inputTokens)),
    outputTokens: Math.max(0, Math.trunc(metadata.outputTokens)),
    estimatedCost: Math.max(0, Number(metadata.estimatedCost) || 0),
    currency: "USD",
    estimated: true
  };
}

function normalizeProviderParameters(
  parameters: Record<string, ProviderParameterValue> | undefined
): Record<string, ProviderParameterValue> {
  const result: Record<string, ProviderParameterValue> = {};
  for (const [key, value] of Object.entries(parameters ?? {}).sort(([left], [right]) =>
    left.localeCompare(right, "en")
  )) {
    const normalizedKey = normalizeId(key, "provider parameter");
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new ProviderGatewayError("provider_invalid", `Invalid provider parameter "${normalizedKey}"`);
    }
    result[normalizedKey] = typeof value === "string" ? sanitizeSensitiveText(value.trim()) : value;
  }
  return result;
}

function normalizeId(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new ProviderGatewayError("provider_invalid", `${fieldName} is required`);
  }
  return normalized;
}

function normalizeOptionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
