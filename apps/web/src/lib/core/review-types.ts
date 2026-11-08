export type ReviewStepName =
  | "ingest"
  | "gemini"
  | "gpt"
  | "figma"
  | "figmaMake"
  | "figmaCheckDesigns"
  | "semgrep"
  | "zap"
  | "codeql"
  | "finalize";
export type ReviewRunStatus = "draft" | "running" | "completed" | "partial_success" | "failed";
export type ReviewStepStatus = "pending" | "running" | "success" | "failed" | "skipped";
export type ReviewFindingSeverity = "high" | "medium" | "low";

export const REVIEW_STEP_NAMES: ReviewStepName[] = [
  "ingest",
  "gemini",
  "gpt",
  "figma",
  "figmaMake",
  "figmaCheckDesigns",
  "semgrep",
  "zap",
  "codeql",
  "finalize"
];
export const REVIEW_FINDING_SEVERITIES: ReviewFindingSeverity[] = ["high", "medium", "low"];

export type KnowledgeSummarySnapshot = {
  notebookId: string | null;
  summary: string;
  source: "env-default" | "request-default";
  capturedAt: string;
};
