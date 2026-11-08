import {
  REVIEW_FINDING_SEVERITIES,
  REVIEW_STEP_NAMES,
  type ReviewFindingSeverity,
  type ReviewRunStatus,
  type ReviewStepName,
  type ReviewStepStatus
} from "@/lib/core/review-types";

export type ReviewArtifactType =
  | "input_image"
  | "api_spec_file"
  | "codeql_report_file"
  | "figma_context_json"
  | "figma_context_summary"
  | "figma_make_request"
  | "figma_make_response"
  | "figma_make_summary"
  | "figma_check_report"
  | "figma_check_summary"
  | "input_payload"
  | "knowledge_summary"
  | "request_json"
  | "response_json"
  | "semgrep_raw_json"
  | "zap_raw_json"
  | "zap_html_report"
  | "codeql_sarif_report"
  | "codeql_json_report"
  | "executive_summary"
  | "normalized_findings";

export type ReviewArtifactUsage = "input" | "knowledge" | "request" | "response" | "report" | "output";

export type ReviewDetailInputDto = {
  id: string;
  inputType: "image" | "text";
  textContent: string | null;
  fileName: string | null;
  mimeType: string | null;
  artifactPath: string | null;
};

export type ReviewDetailRunDto = {
  id: string;
  status: ReviewRunStatus;
  archived: boolean;
  title: string | null;
  memo: string | null;
  tags: string[];
  executiveSummary: string | null;
  createdAt: string;
  updatedAt: string;
  inputs: ReviewDetailInputDto[];
};

export type ReviewDetailStepDto = {
  id: string;
  stepName: ReviewStepName;
  status: ReviewStepStatus;
  skippedReason: string | null;
  summaryText: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type ReviewDetailFindingDto = {
  id: string;
  sourceTool: string;
  category: string;
  severity: ReviewFindingSeverity;
  title: string;
  description: string | null;
  reason: string;
  suggestion: string;
  targetRef: string | null;
  confidence: number | null;
};

export type ReviewDetailArtifactDto = {
  id: string;
  stepName: ReviewStepName;
  artifactType: ReviewArtifactType;
  usage: ReviewArtifactUsage;
  label: string;
  path: string;
  contentType: string | null;
};

export type ReviewLatestStepStatusDto = {
  stepName: ReviewStepName;
  status: ReviewStepStatus;
  summaryText: string | null;
  skippedReason: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
} | null;

export type ReviewDetailDto = {
  run: ReviewDetailRunDto;
  steps: ReviewDetailStepDto[];
  findings: ReviewDetailFindingDto[];
  artifacts: ReviewDetailArtifactDto[];
  artifactsByStep: Record<ReviewStepName, ReviewDetailArtifactDto[]>;
  findingsBySeverity: Record<ReviewFindingSeverity, ReviewDetailFindingDto[]>;
  latestStepStatus: ReviewLatestStepStatusDto;
  executiveSummary: string | null;
  knowledgeSummaryArtifactPath: string | null;
  displaySummary: string;
};

export function createEmptyArtifactsByStep(): Record<ReviewStepName, ReviewDetailArtifactDto[]> {
  return {
    ingest: [],
    gemini: [],
    gpt: [],
    figma: [],
    figmaMake: [],
    figmaCheckDesigns: [],
    semgrep: [],
    zap: [],
    codeql: [],
    finalize: []
  };
}

export function createEmptyFindingsBySeverity(): Record<ReviewFindingSeverity, ReviewDetailFindingDto[]> {
  return {
    high: [],
    medium: [],
    low: []
  };
}

export function sortStepsForDisplay(steps: ReviewDetailStepDto[]) {
  const order = new Map(REVIEW_STEP_NAMES.map((stepName, index) => [stepName, index]));

  return [...steps].sort((left, right) => (order.get(left.stepName) ?? 99) - (order.get(right.stepName) ?? 99));
}

export function sortArtifactsForDisplay(artifacts: ReviewDetailArtifactDto[]) {
  const stepOrder = new Map(REVIEW_STEP_NAMES.map((stepName, index) => [stepName, index]));
  const usageOrder = new Map<ReviewArtifactUsage, number>([
    ["input", 0],
    ["knowledge", 1],
    ["request", 2],
    ["response", 3],
    ["report", 4],
    ["output", 5]
  ]);

  return [...artifacts].sort((left, right) => {
    const stepDelta = (stepOrder.get(left.stepName) ?? 99) - (stepOrder.get(right.stepName) ?? 99);

    if (stepDelta !== 0) {
      return stepDelta;
    }

    const usageDelta = (usageOrder.get(left.usage) ?? 99) - (usageOrder.get(right.usage) ?? 99);

    if (usageDelta !== 0) {
      return usageDelta;
    }

    return left.label.localeCompare(right.label);
  });
}

export function sortFindingsForDisplay(findings: ReviewDetailFindingDto[]) {
  const severityOrder = new Map(REVIEW_FINDING_SEVERITIES.map((severity, index) => [severity, index]));

  return [...findings].sort((left, right) => {
    const severityDelta =
      (severityOrder.get(left.severity) ?? 99) - (severityOrder.get(right.severity) ?? 99);

    if (severityDelta !== 0) {
      return severityDelta;
    }

    return left.title.localeCompare(right.title);
  });
}

export function formatArtifactLabel(artifactType: ReviewArtifactType) {
  const labels: Record<ReviewArtifactType, string> = {
    input_image: "Uploaded image",
    api_spec_file: "API spec file",
    codeql_report_file: "CodeQL input report",
    figma_context_json: "Figma raw context",
    figma_context_summary: "Figma context summary",
    figma_make_request: "Figma Make request",
    figma_make_response: "Figma Make response",
    figma_make_summary: "Figma Make summary",
    figma_check_report: "Figma Check report",
    figma_check_summary: "Figma Check summary",
    input_payload: "Input payload",
    knowledge_summary: "Knowledge summary snapshot",
    request_json: "Request payload",
    response_json: "Response payload",
    semgrep_raw_json: "Semgrep raw report",
    zap_raw_json: "ZAP raw report",
    zap_html_report: "ZAP HTML report",
    codeql_sarif_report: "CodeQL SARIF report",
    codeql_json_report: "CodeQL JSON report",
    executive_summary: "Executive summary",
    normalized_findings: "Normalized findings"
  };

  return labels[artifactType];
}

export function mapArtifactUsage(artifactType: ReviewArtifactType): ReviewArtifactUsage {
  const usageByType: Record<ReviewArtifactType, ReviewArtifactUsage> = {
    input_image: "input",
    api_spec_file: "input",
    codeql_report_file: "input",
    figma_context_json: "report",
    figma_context_summary: "output",
    figma_make_request: "request",
    figma_make_response: "response",
    figma_make_summary: "output",
    figma_check_report: "report",
    figma_check_summary: "output",
    input_payload: "input",
    knowledge_summary: "knowledge",
    request_json: "request",
    response_json: "response",
    semgrep_raw_json: "report",
    zap_raw_json: "report",
    zap_html_report: "report",
    codeql_sarif_report: "report",
    codeql_json_report: "report",
    executive_summary: "output",
    normalized_findings: "output"
  };

  return usageByType[artifactType];
}
