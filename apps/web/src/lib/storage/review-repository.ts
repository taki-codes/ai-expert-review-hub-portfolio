import { prisma } from "@/lib/db/prisma";
import type { ReviewCompareDto, ReviewCompareItemDto } from "@/lib/contracts/review-compare";
import type {
  ReviewListDto,
  ReviewListItemDto,
  ReviewListSort,
  ReviewListStatusFilter
} from "@/lib/contracts/review-list";
import {
  createEmptyArtifactsByStep,
  createEmptyFindingsBySeverity,
  formatArtifactLabel,
  mapArtifactUsage,
  sortArtifactsForDisplay,
  sortFindingsForDisplay,
  sortStepsForDisplay,
  type ReviewArtifactType,
  type ReviewDetailArtifactDto,
  type ReviewDetailDto,
  type ReviewDetailFindingDto,
  type ReviewDetailStepDto,
  type ReviewLatestStepStatusDto
} from "@/lib/contracts/review-detail-mapper";
import type { ReviewFindingSeverity, ReviewStepName, ReviewStepStatus } from "@/lib/core/review-types";

export async function getReviewList(
  statusFilter: ReviewListStatusFilter = "all",
  keywordFilter = "",
  tagFilter = "",
  showArchived = false,
  page = 1,
  pageSize = 10,
  sort: ReviewListSort = "createdAt_desc"
): Promise<ReviewListDto> {
  const trimmedKeyword = keywordFilter.trim();
  const trimmedTag = tagFilter.trim();
  const currentPage = Math.max(1, page);
  const currentPageSize = Math.max(1, pageSize);
  const where = buildReviewListWhereClause(statusFilter, trimmedKeyword, trimmedTag, showArchived);
  const total = await prisma.reviewRun.count({ where });
  const totalPages = total === 0 ? 1 : Math.ceil(total / currentPageSize);
  const effectivePage = Math.min(currentPage, totalPages);
  const reviewRuns = await prisma.reviewRun.findMany({
    where,
    include: {
      inputs: {
        where: { inputType: "image" },
        orderBy: { createdAt: "asc" },
        take: 1
      },
      steps: { orderBy: { createdAt: "asc" } },
      _count: {
        select: {
          findings: true
        }
      }
    },
    orderBy: buildReviewListOrderBy(sort),
    skip: (effectivePage - 1) * currentPageSize,
    take: currentPageSize
  });

  const items: ReviewListItemDto[] = reviewRuns.map((reviewRun) => {
    const steps = sortStepsForDisplay(
      reviewRun.steps.map((step) => ({
        id: step.id,
        stepName: step.stepName as ReviewStepName,
        status: step.status,
        skippedReason: step.skippedReason,
        summaryText: step.summaryText,
        errorMessage: step.errorMessage,
        startedAt: step.startedAt?.toISOString() ?? null,
        finishedAt: step.finishedAt?.toISOString() ?? null
      }))
    );
    const latestStepStatus = resolveLatestStepStatus(steps);
    const inputImage = reviewRun.inputs[0] ?? null;

    return {
      id: reviewRun.id,
      archived: reviewRun.archived,
      title: reviewRun.title,
      memo: reviewRun.memo,
      tags: parseReviewRunTags(reviewRun.tagsJson),
      status: reviewRun.status,
      createdAt: reviewRun.createdAt.toISOString(),
      updatedAt: reviewRun.updatedAt.toISOString(),
      executiveSummary: reviewRun.executiveSummary,
      displaySummary: reviewRun.executiveSummary ?? latestStepStatus?.summaryText ?? "レビュー実行を作成しました。",
      latestStepStatus,
      inputImagePath: inputImage?.artifactPath ?? null,
      inputImageFileName: inputImage?.fileName ?? null,
      findingCount: reviewRun._count.findings
    };
  });

  return {
    items,
    total,
    totalPages,
    page: effectivePage,
    pageSize: currentPageSize,
    appliedStatusFilter: statusFilter,
    appliedKeywordFilter: trimmedKeyword,
    appliedTagFilter: trimmedTag,
    appliedShowArchived: showArchived,
    appliedSort: sort
  };
}

export async function getReviewCompare(leftId: string, rightId: string): Promise<ReviewCompareDto | null> {
  const reviewRuns = await prisma.reviewRun.findMany({
    where: {
      id: {
        in: [leftId, rightId]
      }
    },
    include: {
      steps: { orderBy: { createdAt: "asc" } },
      _count: {
        select: {
          findings: true
        }
      }
    }
  });

  if (reviewRuns.length !== 2) {
    return null;
  }

  const byId = new Map(reviewRuns.map((reviewRun) => [reviewRun.id, reviewRun]));
  const left = byId.get(leftId);
  const right = byId.get(rightId);

  if (!left || !right) {
    return null;
  }

  return {
    left: mapReviewCompareItem(left),
    right: mapReviewCompareItem(right)
  };
}

export async function getReviewDetail(reviewRunId: string): Promise<ReviewDetailDto | null> {
  const reviewRun = await prisma.reviewRun.findUnique({
    where: { id: reviewRunId },
    include: {
      inputs: { orderBy: { createdAt: "asc" } },
      steps: { orderBy: { createdAt: "asc" } },
      findings: { orderBy: { createdAt: "asc" } },
      artifacts: { orderBy: { createdAt: "asc" } }
    }
  });

  if (!reviewRun) {
    return null;
  }

  const steps: ReviewDetailStepDto[] = sortStepsForDisplay(
    reviewRun.steps.map((step) => ({
      id: step.id,
      stepName: step.stepName as ReviewStepName,
      status: step.status as ReviewStepStatus,
      skippedReason: step.skippedReason,
      summaryText: step.summaryText,
      errorMessage: step.errorMessage,
      startedAt: step.startedAt?.toISOString() ?? null,
      finishedAt: step.finishedAt?.toISOString() ?? null
    }))
  );

  const findings: ReviewDetailFindingDto[] = sortFindingsForDisplay(
    reviewRun.findings.map((finding) => ({
      id: finding.id,
      sourceTool: finding.sourceTool,
      category: finding.category,
      severity: finding.severity as ReviewFindingSeverity,
      title: finding.title,
      description: finding.description,
      reason: finding.reason,
      suggestion: finding.suggestion,
      targetRef: finding.targetRef,
      confidence: finding.confidence
    }))
  );

  const artifacts: ReviewDetailArtifactDto[] = sortArtifactsForDisplay(
    reviewRun.artifacts.map((artifact) => {
      const artifactType = artifact.artifactType as ReviewArtifactType;

      return {
        id: artifact.id,
        stepName: artifact.stepName as ReviewStepName,
        artifactType,
        usage: mapArtifactUsage(artifactType),
        label: formatArtifactLabel(artifactType),
        path: artifact.path,
        contentType: artifact.contentType
      };
    })
  );

  const artifactsByStep = createEmptyArtifactsByStep();
  for (const artifact of artifacts) {
    artifactsByStep[artifact.stepName].push(artifact);
  }

  const findingsBySeverity = createEmptyFindingsBySeverity();
  for (const finding of findings) {
    findingsBySeverity[finding.severity].push(finding);
  }

  const knowledgeSummaryArtifact = artifacts.find((artifact) => artifact.artifactType === "knowledge_summary");
  const latestStepStatus = resolveLatestStepStatus(steps);
  const displaySummary = reviewRun.executiveSummary ?? latestStepStatus?.summaryText ?? "レビュー実行を作成しました。";

  return {
    run: {
      id: reviewRun.id,
      status: reviewRun.status,
      archived: reviewRun.archived,
      title: reviewRun.title,
      memo: reviewRun.memo,
      tags: parseReviewRunTags(reviewRun.tagsJson),
      executiveSummary: reviewRun.executiveSummary,
      createdAt: reviewRun.createdAt.toISOString(),
      updatedAt: reviewRun.updatedAt.toISOString(),
      inputs: reviewRun.inputs.map((input) => ({
        id: input.id,
        inputType: input.inputType,
        textContent: input.textContent,
        fileName: input.fileName,
        mimeType: input.mimeType,
        artifactPath: input.artifactPath
      }))
    },
    steps,
    findings,
    artifacts,
    artifactsByStep,
    findingsBySeverity,
    latestStepStatus,
    executiveSummary: reviewRun.executiveSummary,
    knowledgeSummaryArtifactPath: knowledgeSummaryArtifact?.path ?? null,
    displaySummary
  };
}

function resolveLatestStepStatus(steps: ReviewDetailStepDto[]): ReviewLatestStepStatusDto {
  const withActivity = steps.filter((step) => step.finishedAt || step.startedAt);
  const latestStep = withActivity.length === 0 ? (steps.at(-1) ?? null) : withActivity.reduce<ReviewDetailStepDto | null>((latest, step) => {
    if (!latest) {
      return step;
    }

    const latestTime = Date.parse(latest.finishedAt ?? latest.startedAt ?? "");
    const currentTime = Date.parse(step.finishedAt ?? step.startedAt ?? "");

    if (Number.isNaN(latestTime)) {
      return step;
    }

    if (Number.isNaN(currentTime)) {
      return latest;
    }

    return currentTime >= latestTime ? step : latest;
  }, null);

  if (!latestStep) {
    return null;
  }

  return {
    stepName: latestStep.stepName,
    status: latestStep.status,
    summaryText: latestStep.summaryText,
    skippedReason: latestStep.skippedReason,
    errorMessage: latestStep.errorMessage,
    startedAt: latestStep.startedAt,
    finishedAt: latestStep.finishedAt
  };
}

function buildReviewListWhereClause(
  statusFilter: ReviewListStatusFilter,
  keywordFilter: string,
  tagFilter: string,
  showArchived: boolean
) {
  const clauses: Array<Record<string, unknown>> = [];

  if (!showArchived) {
    clauses.push({ archived: false });
  }

  if (statusFilter !== "all") {
    clauses.push({ status: statusFilter });
  }

  if (keywordFilter) {
    clauses.push({
      OR: [
        { id: { contains: keywordFilter } },
        { title: { contains: keywordFilter } },
        { memo: { contains: keywordFilter } },
        { tagsJson: { contains: keywordFilter } },
        { executiveSummary: { contains: keywordFilter } },
        {
          steps: {
            some: {
              OR: [
                { summaryText: { contains: keywordFilter } },
                { errorMessage: { contains: keywordFilter } },
                { skippedReason: { contains: keywordFilter } }
              ]
            }
          }
        }
      ]
    });
  }

  if (tagFilter) {
    clauses.push({
      tagsJson: {
        contains: JSON.stringify(tagFilter)
      }
    });
  }

  if (clauses.length === 0) {
    return undefined;
  }

  if (clauses.length === 1) {
    return clauses[0];
  }

  return { AND: clauses };
}

function buildReviewListOrderBy(sort: ReviewListSort) {
  switch (sort) {
    case "createdAt_asc":
      return { createdAt: "asc" as const };
    case "updatedAt_desc":
      return { updatedAt: "desc" as const };
    case "updatedAt_asc":
      return { updatedAt: "asc" as const };
    case "createdAt_desc":
    default:
      return { createdAt: "desc" as const };
  }
}

function mapReviewCompareItem(reviewRun: {
  id: string;
  archived: boolean;
  title: string | null;
  memo: string | null;
  tagsJson: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  executiveSummary: string | null;
  steps: Array<{
    id: string;
    stepName: string;
    status: string;
    skippedReason: string | null;
    summaryText: string | null;
    errorMessage: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
  }>;
  _count: {
    findings: number;
  };
}): ReviewCompareItemDto {
  const steps = sortStepsForDisplay(
    reviewRun.steps.map((step) => ({
      id: step.id,
      stepName: step.stepName as ReviewStepName,
      status: step.status as ReviewStepStatus,
      skippedReason: step.skippedReason,
      summaryText: step.summaryText,
      errorMessage: step.errorMessage,
      startedAt: step.startedAt?.toISOString() ?? null,
      finishedAt: step.finishedAt?.toISOString() ?? null
    }))
  );
  const latestStepStatus = resolveLatestStepStatus(steps);

  return {
    id: reviewRun.id,
    archived: reviewRun.archived,
    title: reviewRun.title,
    memo: reviewRun.memo,
    tags: parseReviewRunTags(reviewRun.tagsJson),
    status: reviewRun.status as ReviewListItemDto["status"],
    createdAt: reviewRun.createdAt.toISOString(),
    updatedAt: reviewRun.updatedAt.toISOString(),
    executiveSummary: reviewRun.executiveSummary,
    displaySummary: reviewRun.executiveSummary ?? latestStepStatus?.summaryText ?? "レビュー実行を作成しました。",
    latestStepStatus,
    findingCount: reviewRun._count.findings
  };
}

export async function updateReviewRunArchiveState(reviewRunId: string, archived: boolean) {
  try {
    const reviewRun = await prisma.reviewRun.update({
      where: { id: reviewRunId },
      data: { archived },
      select: {
        id: true,
        archived: true
      }
    });

    return reviewRun;
  } catch {
    return null;
  }
}

function parseReviewRunTags(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    // Ignore malformed stored tags and fall back to an empty list.
  }

  return [];
}
