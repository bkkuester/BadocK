export const redactedValue = "[REDACTED]";

export const sensitiveKeyPattern =
  /(?:secret|token|key|api[-_]?key|access[-_]?key|password|credential|private[-_]?key|authorization|bearer)/i;

const assignmentPattern =
  /\b((?:[A-Za-z_][A-Za-z0-9_]*(?:SECRET|TOKEN|KEY|PASSWORD|CREDENTIAL|AUTHORIZATION)[A-Za-z0-9_]*)|secret|token|key|password|credential|authorization|api[-_]?key|access[-_]?key|private[-_]?key)\b\s*[:=]\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,;}]+)/gi;
const bearerPattern = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}\b/gi;
const openAiKeyPattern = /\bsk-[A-Za-z0-9_-]{8,}\b/g;
const githubClassicTokenPattern = /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{12,}\b/g;
const githubFineGrainedTokenPattern = /\bgithub_pat_[A-Za-z0-9_]{12,}\b/g;
const slackTokenPattern = /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g;
const nonSecretKeyNames = new Set([
  "inputtokens",
  "outputtokens",
  "reasoningtokens",
  "totaltokens",
  "sensitivekeypattern",
  "allowedsensitivepolicykeys",
  "openapikeypattern",
  "githubclassictokenpattern",
  "githubfinegrainedtokenpattern",
  "slacktokenpattern"
]);

export function isSensitiveKey(key: string): boolean {
  if (nonSecretKeyNames.has(key.replace(/[^A-Za-z0-9]/g, "").toLowerCase())) {
    return false;
  }
  return sensitiveKeyPattern.test(key);
}

export function maskSensitiveValue(value: string): string {
  return value.trim().length > 0 ? redactedValue : "";
}

export function sanitizeSensitiveText(text: string): string {
  return text
    .replace(bearerPattern, `$1${redactedValue}`)
    .replace(openAiKeyPattern, `sk-${redactedValue}`)
    .replace(githubFineGrainedTokenPattern, `github_pat_${redactedValue}`)
    .replace(githubClassicTokenPattern, (match) => `${match.split("_")[0]}_${redactedValue}`)
    .replace(slackTokenPattern, (match) => `${match.split("-")[0]}-${redactedValue}`)
    .replace(assignmentPattern, (match, key: string) => (isSensitiveKey(key) ? `${key}=${redactedValue}` : match));
}

export function sanitizeForPublicOutput(value: unknown): unknown {
  return sanitizeValue(value, new WeakSet<object>());
}

export function assertNoSensitiveKeys(value: unknown, context = "value"): void {
  const paths = findSensitiveKeyPaths(value);
  if (paths.length > 0) {
    throw new Error(`${context} contains sensitive field "${paths[0]}"`);
  }
}

export function findSensitiveKeyPaths(value: unknown): string[] {
  const paths: string[] = [];
  visitKeys(value, [], (path, key) => {
    if (isSensitiveKey(key)) {
      paths.push(path.join("."));
    }
  });
  return paths;
}

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "string") {
    return sanitizeSensitiveText(value);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeSensitiveText(value.message)
    };
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, seen));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      isSensitiveKey(key) ? redactedValue : sanitizeValue(nestedValue, seen)
    ])
  );
}

function visitKeys(
  value: unknown,
  path: Array<string | number>,
  onKey: (path: string[], key: string) => void
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitKeys(item, [...path, index], onKey));
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const nestedPath = [...path, key];
    onKey(
      nestedPath.map((part) => String(part)),
      key
    );
    visitKeys(nestedValue, nestedPath, onKey);
  }
}
