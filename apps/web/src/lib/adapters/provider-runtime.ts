export type ProviderMode = "mock" | "real";

export type ProviderExecution<TOutput> = {
  output: TOutput;
  rawRequest: unknown;
  rawResponse: unknown;
  providerMode: ProviderMode;
  providerName: string;
  model: string;
};

export class ProviderCallError extends Error {
  providerName: string;
  providerMode: ProviderMode;
  model: string;
  rawRequest: unknown;
  rawResponse: unknown;
  statusCode: number | null;

  constructor(input: {
    message: string;
    providerName: string;
    providerMode: ProviderMode;
    model: string;
    rawRequest?: unknown;
    rawResponse?: unknown;
    statusCode?: number | null;
  }) {
    super(input.message);
    this.name = "ProviderCallError";
    this.providerName = input.providerName;
    this.providerMode = input.providerMode;
    this.model = input.model;
    this.rawRequest = input.rawRequest ?? null;
    this.rawResponse = input.rawResponse ?? null;
    this.statusCode = input.statusCode ?? null;
  }
}

export function resolveProviderMode(input: {
  providerDisplayName: string;
  envValue: string | undefined;
}): ProviderMode {
  const normalized = input.envValue?.trim().toLowerCase();

  if (!normalized || normalized === "mock") {
    return "mock";
  }

  if (normalized === "real") {
    return "real";
  }

  throw new Error(
    `${input.providerDisplayName} adapter mode must be either "mock" or "real".`
  );
}

export function requireEnv(input: {
  envName: string;
  value: string | undefined;
  providerDisplayName: string;
  providerMode: ProviderMode;
}) {
  const trimmed = input.value?.trim();

  if (!trimmed) {
    throw new Error(
      `[${input.providerMode}] ${input.providerDisplayName} requires ${input.envName} to be set.`
    );
  }

  return trimmed;
}

export function resolveBaseUrl(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return fallback;
  }

  return trimmed.replace(/\/+$/, "");
}

export function resolveTimeoutMs(value: string | undefined, fallback: number) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return fallback;
  }

  const parsed = Number.parseInt(trimmed, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export function logProviderEvent(
  level: "info" | "warn" | "error",
  event: Record<string, unknown>
) {
  const logger = level === "error" ? console.error : level === "warn" ? console.warn : console.info;
  logger(
    JSON.stringify({
      scope: "provider",
      level,
      timestamp: new Date().toISOString(),
      ...event
    })
  );
}

export function createResponseEnvelope(input: {
  providerName: string;
  providerMode: ProviderMode;
  model: string;
  payload: unknown;
}) {
  return {
    provider: input.providerName,
    mode: input.providerMode,
    model: input.model,
    payload: input.payload
  };
}

export function summarizeUnknownError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Unknown provider error";
}
