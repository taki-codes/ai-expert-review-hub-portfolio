import {
  ProviderCallError,
  type ProviderMode,
  logProviderEvent,
  resolveBaseUrl,
  resolveTimeoutMs,
  summarizeUnknownError
} from "@/lib/adapters/provider-runtime";
import type {
  GptAction,
  GptNormalizeExecution,
  GptNormalizeInput,
  GptNormalizer,
  GptPriority,
  GptReviewPlan
} from "@/lib/adapters/gpt/types";

type OpenAiConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  organization: string | null;
  project: string | null;
  providerMode: ProviderMode;
};

export class RealGptNormalizer implements GptNormalizer {
  private readonly config: OpenAiConfig;

  constructor(config: OpenAiConfig) {
    this.config = config;
  }

  async normalize(input: GptNormalizeInput): Promise<GptNormalizeExecution> {
    const url = `${this.config.baseUrl}/responses`;
    const requestBody = {
      model: this.config.model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: buildSystemInstruction()
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildUserPrompt(input)
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "gpt_review_plan_minimal",
          strict: true,
          schema: buildGptResponseSchema()
        }
      },
      temperature: 0.2
    };
    const rawRequest = {
      provider: "openai",
      mode: this.config.providerMode,
      model: this.config.model,
      request: {
        method: "POST",
        url,
        headers: {
          Authorization: "Bearer [redacted]",
          "Content-Type": "application/json",
          ...(this.config.organization ? { "OpenAI-Organization": this.config.organization } : {}),
          ...(this.config.project ? { "OpenAI-Project": this.config.project } : {})
        },
        body: requestBody
      }
    };

    logProviderEvent("info", {
      event: "provider_request_started",
      provider: "openai",
      mode: this.config.providerMode,
      model: this.config.model
    });

    let response: Response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          ...(this.config.organization ? { "OpenAI-Organization": this.config.organization } : {}),
          ...(this.config.project ? { "OpenAI-Project": this.config.project } : {})
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.config.timeoutMs)
      });
    } catch (error) {
      throw this.toProviderError({
        message:
          error instanceof Error && error.name === "TimeoutError"
            ? `[real:${this.config.model}] GPT normalization timed out after ${this.config.timeoutMs}ms.`
            : `[real:${this.config.model}] GPT normalization could not reach the API endpoint. Check OPENAI_BASE_URL and network access.`,
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
      provider: "openai",
      mode: this.config.providerMode,
      model: this.config.model,
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: pickResponseHeaders(response.headers, [
          "content-type",
          "x-request-id",
          "openai-processing-ms"
        ]),
        body: responseBody ?? rawText
      }
    };

    if (!response.ok) {
      throw this.toProviderError({
        message: `[real:${this.config.model}] GPT normalization failed with ${response.status} ${response.statusText}. Check OPENAI_API_KEY, OPENAI_MODEL, and project access.`,
        rawRequest,
        rawResponse,
        statusCode: response.status
      });
    }

    const responseErrorMessage = extractOpenAiResponseError(responseBody);

    if (responseErrorMessage) {
      throw this.toProviderError({
        message: `[real:${this.config.model}] GPT normalization returned an API error: ${responseErrorMessage}`,
        rawRequest,
        rawResponse
      });
    }

    const refusal = extractOpenAiRefusal(responseBody);

    if (refusal) {
      throw this.toProviderError({
        message: `[real:${this.config.model}] GPT refused to produce a structured normalization response.`,
        rawRequest,
        rawResponse
      });
    }

    const incompleteReason = extractIncompleteReason(responseBody);

    if (incompleteReason) {
      throw this.toProviderError({
        message: `[real:${this.config.model}] GPT normalization finished incomplete: ${incompleteReason}.`,
        rawRequest,
        rawResponse
      });
    }

    const responseText = extractOpenAiResponseText(responseBody);

    if (!responseText) {
      throw this.toProviderError({
        message: `[real:${this.config.model}] GPT did not return structured normalization text.`,
        rawRequest,
        rawResponse
      });
    }

    const parsedOutput = safeParseJson(responseText);

    if (!parsedOutput) {
      throw this.toProviderError({
        message: `[real:${this.config.model}] GPT returned non-JSON structured output.`,
        rawRequest,
        rawResponse
      });
    }

    const validation = validateGptReviewPlan(parsedOutput);

    if (!validation.ok) {
      throw this.toProviderError({
        message: `[real:${this.config.model}] GPT returned JSON that did not match the normalization contract: ${validation.message}`,
        rawRequest,
        rawResponse
      });
    }

    logProviderEvent("info", {
      event: "provider_request_succeeded",
      provider: "openai",
      mode: this.config.providerMode,
      model: this.config.model,
      priorityCount: validation.value.priorities.length,
      actionCount: validation.value.actions.length
    });

    return {
      output: validation.value,
      rawRequest,
      rawResponse,
      providerMode: this.config.providerMode,
      providerName: "openai",
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
      provider: "openai",
      mode: this.config.providerMode,
      model: this.config.model,
      statusCode: input.statusCode ?? null,
      message: input.message
    });

    return new ProviderCallError({
      message: input.message,
      providerName: "openai",
      providerMode: this.config.providerMode,
      model: this.config.model,
      rawRequest: input.rawRequest,
      rawResponse: input.rawResponse,
      statusCode: input.statusCode ?? null
    });
  }
}

export function loadOpenAiConfig(providerMode: ProviderMode): OpenAiConfig {
  return {
    providerMode,
    apiKey: process.env.OPENAI_API_KEY?.trim() ?? "",
    baseUrl: resolveBaseUrl(process.env.OPENAI_BASE_URL, "https://api.openai.com/v1"),
    model: process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini",
    timeoutMs: resolveTimeoutMs(process.env.OPENAI_TIMEOUT_MS, 45000),
    organization: process.env.OPENAI_ORGANIZATION?.trim() || null,
    project: process.env.OPENAI_PROJECT?.trim() || null
  };
}

function buildSystemInstruction() {
  return [
    "You are the GPT normalization step for AI Review Hub.",
    "Return only JSON that matches the provided schema.",
    "Use the provided review JSON as the primary source.",
    "Do not invent findings that are not supported by the provided review JSON, the explanatory text, the figma context summary, or the knowledge summary.",
    "Keep the executive summary concise and actionable.",
    "Write every user-facing text field in natural Japanese suitable for a Japanese business review tool.",
    "The JSON keys stay in English, but the values for executiveSummary, priorities, and actions must be Japanese."
  ].join(" ");
}

function buildUserPrompt(input: GptNormalizeInput) {
  const focusLabel = input.reviewFocus === "figma_supplement" ? "figma_supplement" : "normalization";

  return [
    `Task focus: ${focusLabel}`,
    "Normalize the provided review into an executive summary, priorities, and actions.",
    input.explanatoryText ? `Explanatory text: ${input.explanatoryText}` : null,
    input.figmaContextSummary ? `Figma context summary: ${input.figmaContextSummary}` : null,
    `Knowledge summary: ${input.knowledgeSummary}`,
    `Review JSON:\n${JSON.stringify(input.geminiReview, null, 2)}`,
    "Use concise, natural Japanese that reads cleanly in a Japanese SaaS review UI."
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n\n");
}

function buildGptResponseSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      executiveSummary: {
        type: "string"
      },
      priorities: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            priority: {
              type: "string",
              enum: ["p0", "p1", "p2"]
            },
            title: {
              type: "string"
            },
            whyItMatters: {
              type: "string"
            }
          },
          required: ["priority", "title", "whyItMatters"]
        }
      },
      actions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            target: {
              type: "string",
              enum: ["ui", "figma", "security", "content"]
            },
            action: {
              type: "string"
            }
          },
          required: ["target", "action"]
        }
      }
    },
    required: ["executiveSummary", "priorities", "actions"]
  };
}

function extractOpenAiResponseError(value: unknown) {
  if (!isRecord(value) || !isRecord(value.error) || typeof value.error.message !== "string") {
    return null;
  }

  return value.error.message;
}

function extractIncompleteReason(value: unknown) {
  if (!isRecord(value) || value.status !== "incomplete" || !isRecord(value.incomplete_details)) {
    return null;
  }

  return typeof value.incomplete_details.reason === "string"
    ? value.incomplete_details.reason
    : "unknown";
}

function extractOpenAiRefusal(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.output)) {
    return null;
  }

  for (const item of value.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (isRecord(content) && typeof content.refusal === "string" && content.refusal.trim()) {
        return content.refusal;
      }

      if (isRecord(content) && content.type === "refusal" && typeof content.text === "string") {
        return content.text;
      }
    }
  }

  return null;
}

function extractOpenAiResponseText(value: unknown) {
  if (isRecord(value) && typeof value.output_text === "string" && value.output_text.trim()) {
    return value.output_text;
  }

  if (!isRecord(value) || !Array.isArray(value.output)) {
    return null;
  }

  for (const item of value.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (!isRecord(content)) {
        continue;
      }

      if (typeof content.text === "string" && content.text.trim()) {
        return content.text;
      }
    }
  }

  return null;
}

function validateGptReviewPlan(value: unknown):
  | { ok: true; value: GptReviewPlan }
  | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: "root value must be an object." };
  }

  if (typeof value.executiveSummary !== "string" || !value.executiveSummary.trim()) {
    return { ok: false, message: "`executiveSummary` must be a non-empty string." };
  }

  if (!Array.isArray(value.priorities)) {
    return { ok: false, message: "`priorities` must be an array." };
  }

  if (!Array.isArray(value.actions)) {
    return { ok: false, message: "`actions` must be an array." };
  }

  const priorities: GptPriority[] = [];
  const actions: GptAction[] = [];

  for (let index = 0; index < value.priorities.length; index += 1) {
    const priority = value.priorities[index];

    if (!isRecord(priority)) {
      return { ok: false, message: `priorities[${index}] must be an object.` };
    }

    if (!isOneOf(priority.priority, ["p0", "p1", "p2"])) {
      return { ok: false, message: `priorities[${index}].priority is invalid.` };
    }

    if (typeof priority.title !== "string" || typeof priority.whyItMatters !== "string") {
      return { ok: false, message: `priorities[${index}] must contain string title and whyItMatters.` };
    }

    priorities.push({
      priority: priority.priority,
      title: priority.title,
      whyItMatters: priority.whyItMatters
    });
  }

  for (let index = 0; index < value.actions.length; index += 1) {
    const action = value.actions[index];

    if (!isRecord(action)) {
      return { ok: false, message: `actions[${index}] must be an object.` };
    }

    if (!isOneOf(action.target, ["ui", "figma", "security", "content"])) {
      return { ok: false, message: `actions[${index}].target is invalid.` };
    }

    if (typeof action.action !== "string") {
      return { ok: false, message: `actions[${index}].action must be a string.` };
    }

    actions.push({
      target: action.target,
      action: action.action
    });
  }

  return {
    ok: true,
    value: {
      executiveSummary: value.executiveSummary,
      priorities,
      actions
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

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}
