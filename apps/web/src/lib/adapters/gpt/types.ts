import type { GeminiReviewResult } from "@/lib/adapters/gemini/types";
import type { ProviderExecution } from "@/lib/adapters/provider-runtime";

export type GptPriority = {
  priority: "p0" | "p1" | "p2";
  title: string;
  whyItMatters: string;
};

export type GptAction = {
  target: "ui" | "figma" | "security" | "content";
  action: string;
};

export type GptReviewPlan = {
  executiveSummary: string;
  priorities: GptPriority[];
  actions: GptAction[];
};

export type GptNormalizeInput = {
  geminiReview: GeminiReviewResult;
  knowledgeSummary: string;
  explanatoryText?: string;
  reviewFocus?: "normalization" | "figma_supplement";
  figmaContextSummary?: string | null;
};

export type GptNormalizeExecution = ProviderExecution<GptReviewPlan>;

export interface GptNormalizer {
  normalize(input: GptNormalizeInput): Promise<GptNormalizeExecution>;
}
