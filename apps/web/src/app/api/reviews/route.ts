import { NextResponse } from "next/server";
import { createReviewRun } from "@/lib/queue/review-orchestrator";
import type { ApiSpecFormat } from "@/lib/adapters/zap/types";
import type { CodeqlMode, RepositoryVisibility } from "@/lib/adapters/codeql/types";
import {
  isReviewListStatusFilter,
  isReviewListSort,
  normalizeReviewListKeyword,
  normalizeReviewListTag,
  normalizeReviewListShowArchived,
  normalizeReviewListPage,
  normalizeReviewListPageSize
} from "@/lib/contracts/review-list";
import { getReviewList } from "@/lib/storage/review-repository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawStatus = searchParams.get("status")?.trim() ?? "all";
  const keyword = normalizeReviewListKeyword(searchParams.get("keyword"));
  const tag = normalizeReviewListTag(searchParams.get("tag"));
  const showArchived = normalizeReviewListShowArchived(searchParams.get("showArchived"));
  const rawSort = searchParams.get("sort")?.trim() ?? "createdAt_desc";
  const page = normalizeReviewListPage(searchParams.get("page"));
  const pageSize = normalizeReviewListPageSize(searchParams.get("pageSize"));

  if (!isReviewListStatusFilter(rawStatus)) {
    return NextResponse.json(
      { error: "status must be one of: all, draft, running, completed, partial_success, failed" },
      { status: 400 }
    );
  }

  if (keyword.length > 120) {
    return NextResponse.json(
      { error: "keyword must be 120 characters or fewer" },
      { status: 400 }
    );
  }

  if (tag.length > 24) {
    return NextResponse.json(
      { error: "tag must be 24 characters or fewer" },
      { status: 400 }
    );
  }

  if (tag.includes(",")) {
    return NextResponse.json(
      { error: "tag filter accepts one tag only" },
      { status: 400 }
    );
  }

  if (!isReviewListSort(rawSort)) {
    return NextResponse.json(
      { error: "sort must be one of: createdAt_desc, createdAt_asc, updatedAt_desc, updatedAt_asc" },
      { status: 400 }
    );
  }

  if (page > 100000) {
    return NextResponse.json({ error: "page must be 100000 or fewer" }, { status: 400 });
  }

  if (pageSize > 50) {
    return NextResponse.json({ error: "pageSize must be 50 or fewer" }, { status: 400 });
  }

  const list = await getReviewList(rawStatus, keyword, tag, showArchived, page, pageSize, rawSort);
  return NextResponse.json(list);
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const screenshot = formData.get("screenshot");
  const explanatoryText = formData.get("explanatoryText");
  const runTitle = formData.get("runTitle");
  const runMemo = formData.get("runMemo");
  const runTags = formData.get("runTags");
  const notebookId = formData.get("notebookId");
  const runFigma = formData.get("runFigma");
  const figmaUrl = formData.get("figmaUrl");
  const runFigmaMake = formData.get("runFigmaMake");
  const figmaMakeMode = formData.get("figmaMakeMode");
  const figmaCheckMode = formData.get("figmaCheckMode");
  const figmaMakePrompt = formData.get("figmaMakePrompt");
  const figmaMakeOutputText = formData.get("figmaMakeOutputText");
  const figmaCheckSummaryText = formData.get("figmaCheckSummaryText");
  const figmaCheckReportFile = formData.get("figmaCheckReportFile");
  const semgrepMode = formData.get("semgrepMode");
  const repositoryPath = formData.get("repositoryPath");
  const semgrepJsonPath = formData.get("semgrepJsonPath");
  const semgrepBin = formData.get("semgrepBin");
  const semgrepBinArgs = formData.get("semgrepBinArgs");
  const semgrepConfig = formData.get("semgrepConfig");
  const apiSpecFile = formData.get("apiSpecFile");
  const apiSpecFormat = formData.get("apiSpecFormat");
  const zapMode = formData.get("zapMode");
  const zapJsonPath = formData.get("zapJsonPath");
  const zapHtmlPath = formData.get("zapHtmlPath");
  const codeqlReportFile = formData.get("codeqlReportFile");
  const codeqlMode = formData.get("codeqlMode");
  const repositoryVisibility = formData.get("repositoryVisibility");
  let parsedSemgrepBinArgs: string[] | undefined;

  if (!(screenshot instanceof File)) {
    return NextResponse.json({ error: "screenshot is required" }, { status: 400 });
  }

  if (typeof explanatoryText !== "string" || !explanatoryText.trim()) {
    return NextResponse.json({ error: "explanatoryText is required" }, { status: 400 });
  }

  if (typeof runTitle === "string" && runTitle.trim().length > 120) {
    return NextResponse.json({ error: "runTitle must be 120 characters or fewer" }, { status: 400 });
  }

  if (typeof runMemo === "string" && runMemo.trim().length > 2000) {
    return NextResponse.json({ error: "runMemo must be 2000 characters or fewer" }, { status: 400 });
  }

  let parsedRunTags: string[] = [];

  try {
    parsedRunTags = parseRunTags(runTags);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "runTags are invalid" },
      { status: 400 }
    );
  }

  try {
    parsedSemgrepBinArgs = parseSemgrepBinArgs(semgrepBinArgs);
  } catch {
    return NextResponse.json(
      { error: "semgrepBinArgs must be a JSON string array or a space-separated string" },
      { status: 400 }
    );
  }

  if (
    typeof figmaMakeMode === "string" &&
    figmaMakeMode.trim() &&
    !isFigmaMakeMode(figmaMakeMode.trim())
  ) {
    return NextResponse.json(
      { error: "figmaMakeMode must be one of: disabled, manual_capture, mcp_assisted" },
      { status: 400 }
    );
  }

  if (
    typeof figmaCheckMode === "string" &&
    figmaCheckMode.trim() &&
    !isFigmaCheckMode(figmaCheckMode.trim())
  ) {
    return NextResponse.json(
      { error: "figmaCheckMode must be one of: disabled, manual_ingest" },
      { status: 400 }
    );
  }

  if (
    typeof apiSpecFormat === "string" &&
    apiSpecFormat.trim() &&
    !isApiSpecFormat(apiSpecFormat.trim())
  ) {
    return NextResponse.json(
      { error: "apiSpecFormat must be one of: openapi, soap, graphql" },
      { status: 400 }
    );
  }

  if (
    typeof codeqlMode === "string" &&
    codeqlMode.trim() &&
    !isCodeqlMode(codeqlMode.trim())
  ) {
    return NextResponse.json(
      { error: "codeqlMode must be one of: sarif_ingest, json_ingest" },
      { status: 400 }
    );
  }

  if (
    typeof repositoryVisibility === "string" &&
    repositoryVisibility.trim() &&
    !isRepositoryVisibility(repositoryVisibility.trim())
  ) {
    return NextResponse.json(
      { error: "repositoryVisibility must be one of: public, private" },
      { status: 400 }
    );
  }

  let result: Awaited<ReturnType<typeof createReviewRun>>;

  try {
    result = await createReviewRun({
      screenshot,
      explanatoryText: explanatoryText.trim(),
      runTitle: typeof runTitle === "string" && runTitle.trim() ? runTitle.trim() : undefined,
      runMemo: typeof runMemo === "string" && runMemo.trim() ? runMemo.trim() : undefined,
      runTags: parsedRunTags,
      notebookId: typeof notebookId === "string" && notebookId.trim() ? notebookId.trim() : undefined,
      runFigma: isTruthyField(runFigma),
      figmaUrl: typeof figmaUrl === "string" && figmaUrl.trim() ? figmaUrl.trim() : undefined,
      runFigmaMake: isTruthyField(runFigmaMake),
      figmaMakeMode:
        typeof figmaMakeMode === "string" && figmaMakeMode.trim() ? figmaMakeMode.trim() : undefined,
      figmaCheckMode:
        typeof figmaCheckMode === "string" && figmaCheckMode.trim() ? figmaCheckMode.trim() : undefined,
      figmaMakePrompt:
        typeof figmaMakePrompt === "string" && figmaMakePrompt.trim() ? figmaMakePrompt.trim() : undefined,
      figmaMakeOutputText:
        typeof figmaMakeOutputText === "string" && figmaMakeOutputText.trim()
          ? figmaMakeOutputText.trim()
          : undefined,
      figmaCheckSummaryText:
        typeof figmaCheckSummaryText === "string" && figmaCheckSummaryText.trim()
          ? figmaCheckSummaryText.trim()
          : undefined,
      figmaCheckReportFile: figmaCheckReportFile instanceof File ? figmaCheckReportFile : undefined,
      semgrepMode: typeof semgrepMode === "string" && semgrepMode.trim() ? semgrepMode.trim() : undefined,
      repositoryPath:
        typeof repositoryPath === "string" && repositoryPath.trim() ? repositoryPath.trim() : undefined,
      semgrepJsonPath:
        typeof semgrepJsonPath === "string" && semgrepJsonPath.trim() ? semgrepJsonPath.trim() : undefined,
      semgrepBin: typeof semgrepBin === "string" && semgrepBin.trim() ? semgrepBin.trim() : undefined,
      semgrepBinArgs: parsedSemgrepBinArgs,
      semgrepConfig:
        typeof semgrepConfig === "string" && semgrepConfig.trim() ? semgrepConfig.trim() : undefined,
      apiSpecFile: apiSpecFile instanceof File ? apiSpecFile : undefined,
      apiSpecFormat:
        typeof apiSpecFormat === "string" && apiSpecFormat.trim()
          ? (apiSpecFormat.trim() as ApiSpecFormat)
          : undefined,
      zapMode: typeof zapMode === "string" && zapMode.trim() ? zapMode.trim() : undefined,
      zapJsonPath: typeof zapJsonPath === "string" && zapJsonPath.trim() ? zapJsonPath.trim() : undefined,
      zapHtmlPath: typeof zapHtmlPath === "string" && zapHtmlPath.trim() ? zapHtmlPath.trim() : undefined,
      codeqlReportFile: codeqlReportFile instanceof File ? codeqlReportFile : undefined,
      codeqlMode:
        typeof codeqlMode === "string" && codeqlMode.trim()
          ? (codeqlMode.trim() as CodeqlMode)
          : undefined,
      repositoryVisibility:
        typeof repositoryVisibility === "string" && repositoryVisibility.trim()
          ? (repositoryVisibility.trim() as RepositoryVisibility)
          : undefined
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create review run";
    console.error(JSON.stringify({ scope: "api", route: "POST /api/reviews", message }));
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json(
    {
      reviewRunId: result.reviewRunId,
      location: `/reviews/${result.reviewRunId}`
    },
    { status: 201 }
  );
}

function isTruthyField(value: FormDataEntryValue | null) {
  return value === "true" || value === "on" || value === "1";
}

function parseSemgrepBinArgs(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;

    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  }

  return trimmed.split(/\s+/).filter(Boolean);
}

function parseRunTags(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }

  const normalized = Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );

  if (normalized.length > 10) {
    throw new Error("runTags must contain 10 tags or fewer");
  }

  for (const tag of normalized) {
    if (tag.length > 24) {
      throw new Error("each run tag must be 24 characters or fewer");
    }
  }

  return normalized;
}

function isApiSpecFormat(value: string) {
  return value === "openapi" || value === "soap" || value === "graphql";
}

function isFigmaMakeMode(value: string) {
  return value === "disabled" || value === "manual_capture" || value === "mcp_assisted";
}

function isFigmaCheckMode(value: string) {
  return value === "disabled" || value === "manual_ingest";
}

function isCodeqlMode(value: string) {
  return value === "sarif_ingest" || value === "json_ingest";
}

function isRepositoryVisibility(value: string) {
  return value === "public" || value === "private";
}
