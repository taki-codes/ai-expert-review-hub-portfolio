import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ProviderCallError,
  type ProviderMode,
  logProviderEvent,
  resolveBaseUrl,
  resolveTimeoutMs,
  summarizeUnknownError
} from "@/lib/adapters/provider-runtime";
import type {
  GeminiIssue,
  GeminiReviewExecution,
  GeminiReviewInput,
  GeminiReviewResult,
  GeminiReviewer
} from "@/lib/adapters/gemini/types";
import { resolveArtifactAbsolutePath } from "@/lib/storage/artifact-writer";

type GeminiConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  providerMode: ProviderMode;
};

export class RealGeminiReviewer implements GeminiReviewer {
  private readonly config: GeminiConfig;

  constructor(config: GeminiConfig) {
    this.config = config;
  }

  async review(input: GeminiReviewInput): Promise<GeminiReviewExecution> {
    const screenshotAbsolutePath = resolveArtifactAbsolutePath(input.screenshotArtifactPath);
    const mimeType = guessMimeType(screenshotAbsolutePath);
    const screenshotBytes = await readFile(screenshotAbsolutePath);
    const requestBody = {
      systemInstruction: {
        role: "system",
        parts: [
          {
            text: buildSystemInstruction()
          }
        ]
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: buildUserPrompt(input)
            },
            {
              inlineData: {
                mimeType,
                data: screenshotBytes.toString("base64")
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: buildGeminiResponseSchema(),
        temperature: 0.2
      }
    };
    const url = `${this.config.baseUrl}/models/${this.config.model}:generateContent`;
    const rawRequest = {
      provider: "gemini",
      mode: this.config.providerMode,
      model: this.config.model,
      request: {
        method: "POST",
        url,
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": "[redacted]"
        },
        body: requestBody
      }
    };

    logProviderEvent("info", {
      event: "provider_request_started",
      provider: "gemini",
      mode: this.config.providerMode,
      model: this.config.model,
      screenshotArtifactPath: input.screenshotArtifactPath
    });

    let response: Response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.config.apiKey
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.config.timeoutMs)
      });
    } catch (error) {
      throw this.toProviderError({
        message:
          error instanceof Error && error.name === "TimeoutError"
            ? `[real:${this.config.model}] Gemini request timed out after ${this.config.timeoutMs}ms.`
            : `[real:${this.config.model}] Gemini request could not reach the API endpoint. Check GEMINI_BASE_URL and network access.`,
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
      provider: "gemini",
      mode: this.config.providerMode,
      model: this.config.model,
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: pickResponseHeaders(response.headers, ["content-type", "x-request-id"]),
        body: responseBody ?? rawText
      }
    };

    if (!response.ok) {
      throw this.toProviderError({
        message: `[real:${this.config.model}] Gemini request failed with ${response.status} ${response.statusText}. Check GEMINI_API_KEY, GEMINI_MODEL, and provider access.`,
        rawRequest,
        rawResponse,
        statusCode: response.status
      });
    }

    const responseText = extractGeminiResponseText(responseBody);

    if (!responseText) {
      throw this.toProviderError({
        message: `[real:${this.config.model}] Gemini did not return structured review text.`,
        rawRequest,
        rawResponse
      });
    }

    const parsedOutput = safeParseJson(responseText);

    if (!parsedOutput) {
      throw this.toProviderError({
        message: `[real:${this.config.model}] Gemini returned non-JSON structured output.`,
        rawRequest,
        rawResponse
      });
    }

    const validation = validateGeminiReviewResult(parsedOutput);

    if (!validation.ok) {
      throw this.toProviderError({
        message: `[real:${this.config.model}] Gemini returned JSON that did not match the review contract: ${validation.message}`,
        rawRequest,
        rawResponse
      });
    }

    logProviderEvent("info", {
      event: "provider_request_succeeded",
      provider: "gemini",
      mode: this.config.providerMode,
      model: this.config.model,
      issueCount: validation.value.issues.length,
      overallScore: validation.value.overallScore
    });

    return {
      output: validation.value,
      rawRequest,
      rawResponse,
      providerMode: this.config.providerMode,
      providerName: "gemini",
      model: this.config.model
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
      provider: "gemini",
      mode: this.config.providerMode,
      model: this.config.model,
      statusCode: input.statusCode ?? null,
      message: input.message
    });

    return new ProviderCallError({
      message: input.message,
      providerName: "gemini",
      providerMode: this.config.providerMode,
      model: this.config.model,
      rawRequest: input.rawRequest,
      rawResponse: input.rawResponse,
      statusCode: input.statusCode ?? null
    });
  }
}

export function loadGeminiConfig(providerMode: ProviderMode): GeminiConfig {
  return {
    providerMode,
    apiKey: process.env.GEMINI_API_KEY?.trim() ?? "",
    baseUrl: resolveBaseUrl(
      process.env.GEMINI_BASE_URL,
      "https://generativelanguage.googleapis.com/v1beta"
    ),
    model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
    timeoutMs: resolveTimeoutMs(process.env.GEMINI_TIMEOUT_MS, 45000)
  };
}

function buildSystemInstruction() {
  return [
    "You are the Gemini first-pass reviewer for AI Review Hub.",
    "Return only JSON that matches the provided schema.",
    "Ground issues in the screenshot and explanatory text.",
    "Do not invent hidden UI states or unsupported security findings.",
    "Prefer user-facing UX, CTA, form, hierarchy, navigation, copy, accessibility, and mobile issues.",
    "Write every user-facing text field in natural Japanese suitable for a Japanese business review tool.",
    "The JSON keys stay in English, but the values for summary, title, reason, and suggestion must be Japanese."
  ].join(" ");
}

function buildUserPrompt(input: GeminiReviewInput) {
  return [
    "Analyze the attached screenshot as a product UI.",
    `Explanatory text: ${input.explanatoryText}`,
    `Knowledge summary: ${input.knowledgeSummary}`,
    "Return an overallScore from 0 to 100, a concise summary, and only grounded issues.",
    "Use concise, natural Japanese for all review text."
  ].join("\n\n");
}

function buildGeminiResponseSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      overallScore: {
        type: "integer",
        minimum: 0,
        maximum: 100
      },
      summary: {
        type: "string"
      },
      issues: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            category: {
              type: "string",
              enum: [
                "layout",
                "visual_hierarchy",
                "cta",
                "form",
                "navigation",
                "copy",
                "accessibility",
                "mobile",
                "other"
              ]
            },
            severity: {
              type: "string",
              enum: ["high", "medium", "low"]
            },
            title: {
              type: "string"
            },
            reason: {
              type: "string"
            },
            suggestion: {
              type: "string"
            }
          },
          required: ["category", "severity", "title", "reason", "suggestion"]
        }
      }
    },
    required: ["overallScore", "summary", "issues"]
  };
}

function extractGeminiResponseText(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const candidates = value.candidates;

  if (!Array.isArray(candidates)) {
    return null;
  }

  for (const candidate of candidates) {
    if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
      continue;
    }

    for (const part of candidate.content.parts) {
      if (isRecord(part) && typeof part.text === "string" && part.text.trim()) {
        return part.text;
      }
    }
  }

  return null;
}

function validateGeminiReviewResult(value: unknown):
  | { ok: true; value: GeminiReviewResult }
  | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: "root value must be an object." };
  }

  if (!Number.isInteger(value.overallScore) || value.overallScore < 0 || value.overallScore > 100) {
    return { ok: false, message: "`overallScore` must be an integer between 0 and 100." };
  }

  if (typeof value.summary !== "string" || !value.summary.trim()) {
    return { ok: false, message: "`summary` must be a non-empty string." };
  }

  if (!Array.isArray(value.issues)) {
    return { ok: false, message: "`issues` must be an array." };
  }

  const issues: GeminiIssue[] = [];

  for (let index = 0; index < value.issues.length; index += 1) {
    const issue = value.issues[index];

    if (!isRecord(issue)) {
      return { ok: false, message: `issues[${index}] must be an object.` };
    }

    if (
      !isOneOf(issue.category, [
        "layout",
        "visual_hierarchy",
        "cta",
        "form",
        "navigation",
        "copy",
        "accessibility",
        "mobile",
        "other"
      ])
    ) {
      return { ok: false, message: `issues[${index}].category is invalid.` };
    }

    if (!isOneOf(issue.severity, ["high", "medium", "low"])) {
      return { ok: false, message: `issues[${index}].severity is invalid.` };
    }

    if (
      typeof issue.title !== "string" ||
      typeof issue.reason !== "string" ||
      typeof issue.suggestion !== "string"
    ) {
      return { ok: false, message: `issues[${index}] must contain string title, reason, and suggestion.` };
    }

    issues.push({
      category: issue.category,
      severity: issue.severity,
      title: issue.title,
      reason: issue.reason,
      suggestion: issue.suggestion
    });
  }

  return {
    ok: true,
    value: {
      overallScore: value.overallScore,
      summary: value.summary,
      issues
    }
  };
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

function guessMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  return "application/octet-stream";
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}
