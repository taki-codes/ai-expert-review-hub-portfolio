import type {
  ReviewRunStatus,
  ReviewStepName,
  ReviewStepStatus
} from "@/lib/core/review-types";

export type ReviewCompareLatestStepStatusDto = {
  stepName: ReviewStepName;
  status: ReviewStepStatus;
  summaryText: string | null;
  skippedReason: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
} | null;

export type ReviewCompareItemDto = {
  id: string;
  archived: boolean;
  title: string | null;
  memo: string | null;
  tags: string[];
  status: ReviewRunStatus;
  createdAt: string;
  updatedAt: string;
  executiveSummary: string | null;
  displaySummary: string;
  latestStepStatus: ReviewCompareLatestStepStatusDto;
  findingCount: number;
};

export type ReviewCompareDto = {
  left: ReviewCompareItemDto;
  right: ReviewCompareItemDto;
};

export function normalizeReviewCompareId(value: string | null | undefined) {
  return value?.trim() ?? "";
}
