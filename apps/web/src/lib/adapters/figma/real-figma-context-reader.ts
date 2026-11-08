import {
  ProviderCallError,
  type ProviderMode,
  logProviderEvent,
  resolveBaseUrl,
  resolveTimeoutMs,
  summarizeUnknownError
} from "@/lib/adapters/provider-runtime";
import { buildFigmaSummary, parseFigmaUrl } from "@/lib/adapters/figma/figma-url";
import type {
  FigmaContextReader,
  FigmaContextRequest,
  FigmaContextResult,
  FigmaRawContext
} from "@/lib/adapters/figma/types";

type FigmaConfig = {
  accessToken: string;
  baseUrl: string;
  timeoutMs: number;
  providerMode: ProviderMode;
};

type FigmaApiEnvelope = {
  endpoint: "file" | "file_nodes";
  url: string;
  depth: number;
};

export class RealFigmaContextReader implements FigmaContextReader {
  private readonly config: FigmaConfig;

  constructor(config: FigmaConfig) {
    this.config = config;
  }

  async readContext(input: FigmaContextRequest): Promise<FigmaContextResult> {
    const parsed = parseFigmaUrl(input.figmaUrl);
    const endpoint = this.buildEndpoint(parsed.fileKey, parsed.nodeId);
    const rawRequest = {
      provider: "figma",
      mode: this.config.providerMode,
      model: "read-only",
      request: {
        method: "GET",
        url: endpoint.url,
        headers: {
          "X-Figma-Token": "[redacted]"
        }
      }
    };

    logProviderEvent("info", {
      event: "provider_request_started",
      provider: "figma",
      mode: this.config.providerMode,
      model: "read-only",
      reviewRunId: input.reviewRunId,
      fileKey: parsed.fileKey,
      nodeId: parsed.nodeId
    });

    let response: Response;

    try {
      response = await fetch(endpoint.url, {
        method: "GET",
        headers: {
          "X-Figma-Token": this.config.accessToken
        },
        signal: AbortSignal.timeout(this.config.timeoutMs)
      });
    } catch (error) {
      throw this.toProviderError({
        message:
          error instanceof Error && error.name === "TimeoutError"
            ? `[real:read-only] Figma context lookup timed out after ${this.config.timeoutMs}ms.`
            : "[real:read-only] Figma context lookup could not reach the API endpoint. Check FIGMA_BASE_URL and network access.",
        rawRequest,
        rawResponse: {
          error: {
            type: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network",
            message: summarizeUnknownError(error)
          }
        }
      });
    }

    const rawText = await response.text();
    const responseBody = safeParseJson(rawText);
    const rawResponse = {
      provider: "figma",
      mode: this.config.providerMode,
      model: "read-only",
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: pickResponseHeaders(response.headers, ["content-type", "x-request-id"]),
        body: responseBody ?? rawText
      }
    };

    if (!response.ok) {
      throw this.toProviderError({
        message: `[real:read-only] Figma context lookup failed with ${response.status} ${response.statusText}. Check FIGMA_ACCESS_TOKEN, file access, and file_content:read scope.`,
        rawRequest,
        rawResponse,
        statusCode: response.status
      });
    }

    if (!isRecord(responseBody)) {
      throw this.toProviderError({
        message: "[real:read-only] Figma context lookup returned a non-JSON or invalid JSON response.",
        rawRequest,
        rawResponse
      });
    }

    const fileName = typeof responseBody.name === "string" && responseBody.name.trim()
      ? responseBody.name
      : `Figma file ${parsed.fileKey}`;
    const selectedNode = endpoint.endpoint === "file_nodes"
      ? extractSelectedNode(responseBody, parsed.nodeId)
      : extractDocumentNode(responseBody);

    if (endpoint.endpoint === "file_nodes" && parsed.nodeId && !selectedNode) {
      throw this.toProviderError({
        message: `[real:read-only] Figma node ${parsed.nodeId} was not found in file ${parsed.fileKey}.`,
        rawRequest,
        rawResponse
      });
    }

    const rawContext: FigmaRawContext = {
      source: "figma",
      mode: this.config.providerMode,
      providerName: "figma-rest",
      fileKey: parsed.fileKey,
      fileName,
      target: {
        kind: parsed.targetKind,
        nodeId: parsed.nodeId,
        frameId: parsed.targetKind === "frame" ? parsed.nodeId : null
      },
      originalUrl: input.figmaUrl,
      retrievedAt: new Date().toISOString(),
      file: {
        name: fileName,
        lastModified: readString(responseBody.lastModified),
        version: readString(responseBody.version),
        editorType: readString(responseBody.editorType),
        linkAccess: readString(responseBody.linkAccess),
        role: readString(responseBody.role),
        thumbnailUrl: readString(responseBody.thumbnailUrl)
      },
      node: parsed.nodeId && selectedNode ? summarizeNode(parsed.nodeId, selectedNode) : null,
      selection: {
        endpoint: endpoint.endpoint,
        depth: endpoint.depth
      },
      apiResponse: responseBody
    };

    logProviderEvent("info", {
      event: "provider_request_succeeded",
      provider: "figma",
      mode: this.config.providerMode,
      model: "read-only",
      fileKey: parsed.fileKey,
      nodeId: parsed.nodeId,
      endpoint: endpoint.endpoint
    });

    return {
      rawContext,
      summaryText: buildFigmaSummary(rawContext)
    };
  }

  private buildEndpoint(fileKey: string, nodeId: string | null): FigmaApiEnvelope {
    if (!nodeId) {
      const depth = 2;
      return {
        endpoint: "file",
        depth,
        url: `${this.config.baseUrl}/v1/files/${encodeURIComponent(fileKey)}?depth=${depth}`
      };
    }

    const depth = 2;
    const params = new URLSearchParams({
      ids: nodeId,
      depth: String(depth)
    });

    return {
      endpoint: "file_nodes",
      depth,
      url: `${this.config.baseUrl}/v1/files/${encodeURIComponent(fileKey)}/nodes?${params.toString()}`
    };
  }

  private toProviderError(input: {
    message: string;
    rawRequest: unknown;
    rawResponse: unknown;
    statusCode?: number | null;
  }) {
    logProviderEvent("error", {
      event: "provider_request_failed",
      provider: "figma",
      mode: this.config.providerMode,
      model: "read-only",
      statusCode: input.statusCode ?? null,
      message: input.message
    });

    return new ProviderCallError({
      message: input.message,
      providerName: "figma",
      providerMode: this.config.providerMode,
      model: "read-only",
      rawRequest: input.rawRequest,
      rawResponse: input.rawResponse,
      statusCode: input.statusCode ?? null
    });
  }
}

export function loadFigmaConfig(providerMode: ProviderMode): FigmaConfig {
  return {
    providerMode,
    accessToken: process.env.FIGMA_ACCESS_TOKEN?.trim() ?? "",
    baseUrl: resolveBaseUrl(process.env.FIGMA_BASE_URL, "https://api.figma.com"),
    timeoutMs: resolveTimeoutMs(process.env.FIGMA_TIMEOUT_MS, 15000)
  };
}

function extractSelectedNode(responseBody: Record<string, unknown>, nodeId: string | null) {
  if (!nodeId || !isRecord(responseBody.nodes)) {
    return null;
  }

  const entry = responseBody.nodes[nodeId];

  if (!isRecord(entry) || !isRecord(entry.document)) {
    return null;
  }

  return entry.document;
}

function extractDocumentNode(responseBody: Record<string, unknown>) {
  if (!isRecord(responseBody.document)) {
    return null;
  }

  return responseBody.document;
}

function summarizeNode(nodeId: string, node: Record<string, unknown>) {
  return {
    id: nodeId,
    name: readString(node.name),
    type: readString(node.type),
    childCount: Array.isArray(node.children) ? node.children.length : 0,
    absoluteBoundingBox: readBoundingBox(node.absoluteBoundingBox)
  };
}

function readBoundingBox(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const x = readNumber(value.x);
  const y = readNumber(value.y);
  const width = readNumber(value.width);
  const height = readNumber(value.height);

  if (x === null || y === null || width === null || height === null) {
    return null;
  }

  return { x, y, width, height };
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function safeParseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function pickResponseHeaders(headers: Headers, names: string[]) {
  const result: Record<string, string> = {};

  for (const name of names) {
    const value = headers.get(name);

    if (value) {
      result[name] = value;
    }
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
