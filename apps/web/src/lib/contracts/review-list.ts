import type {
  ReviewRunStatus,
  ReviewStepName,
  ReviewStepStatus
} from "@/lib/core/review-types";

export type ReviewListStatusFilter = ReviewRunStatus | "all";
export type ReviewListSort =
  | "createdAt_desc"
  | "createdAt_asc"
  | "updatedAt_desc"
  | "updatedAt_asc";

export type ReviewListLatestStepStatusDto = {
  stepName: ReviewStepName;
  status: ReviewStepStatus;
  summaryText: string | null;
  skippedReason: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
} | null;

export type ReviewListItemDto = {
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
  latestStepStatus: ReviewListLatestStepStatusDto;
  inputImagePath: string | null;
  inputImageFileName: string | null;
  findingCount: number;
};

export type ReviewListDto = {
  items: ReviewListItemDto[];
  total: number;
  totalPages: number;
  page: number;
  pageSize: number;
  appliedStatusFilter: ReviewListStatusFilter;
  appliedKeywordFilter: string;
  appliedTagFilter: string;
  appliedShowArchived: boolean;
  appliedSort: ReviewListSort;
};

export function isReviewListStatusFilter(value: string): value is ReviewListStatusFilter {
  return (
    value === "all" ||
    value === "draft" ||
    value === "running" ||
    value === "completed" ||
    value === "partial_success" ||
    value === "failed"
  );
}

export function normalizeReviewListKeyword(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function normalizeReviewListTag(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function normalizeReviewListShowArchived(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized === "true" || normalized === "1" || normalized === "on";
}

export function isReviewListSort(value: string): value is ReviewListSort {
  return (
    value === "createdAt_desc" ||
    value === "createdAt_asc" ||
    value === "updatedAt_desc" ||
    value === "updatedAt_asc"
  );
}

export function normalizeReviewListPage(value: string | null | undefined, fallback = 1) {
  const parsed = Number.parseInt(value?.trim() ?? "", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

export function normalizeReviewListPageSize(value: string | null | undefined, fallback = 10) {
  const parsed = Number.parseInt(value?.trim() ?? "", 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}
