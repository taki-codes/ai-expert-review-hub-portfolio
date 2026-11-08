import type { ProviderExecution } from "@/lib/adapters/provider-runtime";

export type GeminiIssue = {
  category:
    | "layout"
    | "visual_hierarchy"
    | "cta"
    | "form"
    | "navigation"
    | "copy"
    | "accessibility"
    | "mobile"
    | "other";
  severity: "high" | "medium" | "low";
  title: string;
  reason: string;
  suggestion: string;
};

export type GeminiReviewResult = {
  overallScore: number;
  summary: string;
  issues: GeminiIssue[];
};

export type GeminiReviewInput = {
  screenshotArtifactPath: string;
  explanatoryText: string;
  knowledgeSummary: string;
};

export type GeminiReviewExecution = ProviderExecution<GeminiReviewResult>;

export interface GeminiReviewer {
  review(input: GeminiReviewInput): Promise<GeminiReviewExecution>;
}
