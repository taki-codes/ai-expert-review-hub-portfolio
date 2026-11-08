import { open, stat } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { ReviewRunArtifacts } from "@/components/review-run-artifacts";
import type { ReviewDetailArtifactDto, ReviewDetailFindingDto } from "@/lib/contracts/review-detail";
import type { ReviewArtifactUsage } from "@/lib/contracts/review-detail-mapper";
import type { ReviewStepName } from "@/lib/core/review-types";
import { REVIEW_STEP_NAMES } from "@/lib/core/review-types";
import { resolveArtifactAbsolutePath } from "@/lib/storage/artifact-writer";
import { getReviewDetail } from "@/lib/storage/review-repository";

type ArtifactPreviewKind = "json" | "text" | null;

type ArtifactWithPresentation = ReviewDetailArtifactDto & {
  absolutePath: string;
  previewKind: ArtifactPreviewKind;
  previewText: string | null;
  previewNote: string | null;
};

export type ReviewArtifactPreviewItem = ArtifactWithPresentation;
export type ReviewArtifactsFigmaCheckFindingItem = ReviewDetailFindingDto;

const PREVIEWABLE_EXTENSIONS = new Set([".json", ".txt", ".log", ".md", ".yaml", ".yml", ".sarif"]);
const MAX_PREVIEW_FILE_SIZE = 256_000;
const MAX_PREVIEW_BYTES = 6_000;
const MAX_PREVIEW_LINES = 8;
const MAX_PREVIEW_CHARS = 900;

export default async function ReviewRunArtifactsPage({
  params,
  searchParams
}: {
  params: Promise<{ reviewRunId: string }>;
  searchParams: Promise<{ step?: string; usage?: string }>;
}) {
  const { reviewRunId } = await params;
  const resolvedSearchParams = await searchParams;
  const detail = await getReviewDetail(reviewRunId);

  if (!detail) {
    notFound();
  }

  const artifactsByStepEntries = await Promise.all(
    REVIEW_STEP_NAMES.map(async (stepName) => {
      const artifacts = await Promise.all(
        detail.artifactsByStep[stepName].map(async (artifact) => {
          const absolutePath = resolveArtifactAbsolutePath(artifact.path);
          const preview = await buildArtifactPreview(artifact, absolutePath);

          return {
            ...artifact,
            absolutePath,
            ...preview
          };
        })
      );

      return [stepName, artifacts] as const;
    })
  );

  const artifactsByStep = Object.fromEntries(artifactsByStepEntries) as Record<
    ReviewStepName,
    ArtifactWithPresentation[]
  >;

  return (
    <main>
      <ReviewRunArtifacts
        run={{
          id: detail.run.id,
          title: detail.run.title,
          status: detail.run.status,
          archived: detail.run.archived
        }}
        steps={detail.steps}
        artifactsByStep={artifactsByStep}
        figmaCheckArtifacts={artifactsByStep.figmaCheckDesigns}
        figmaCheckFindings={detail.findings.filter((finding) => finding.sourceTool === "figma_check")}
        detailHref={`/reviews/${encodeURIComponent(detail.run.id)}`}
        currentPathname={`/reviews/${encodeURIComponent(detail.run.id)}/artifacts`}
        initialStepFilter={normalizeStepFilter(resolvedSearchParams.step)}
        initialUsageFilter={normalizeUsageFilter(resolvedSearchParams.usage)}
      />
    </main>
  );
}

function normalizeStepFilter(value: string | undefined): ReviewStepName | "all" {
  if (!value || value === "all") {
    return "all";
  }

  return REVIEW_STEP_NAMES.includes(value as ReviewStepName) ? (value as ReviewStepName) : "all";
}

function normalizeUsageFilter(value: string | undefined): ReviewArtifactUsage | "all" {
  if (
    value === "input" ||
    value === "knowledge" ||
    value === "request" ||
    value === "response" ||
    value === "report" ||
    value === "output"
  ) {
    return value;
  }

  return "all";
}

async function buildArtifactPreview(
  artifact: ReviewDetailArtifactDto,
  absolutePath: string
): Promise<Pick<ArtifactWithPresentation, "previewKind" | "previewText" | "previewNote">> {
  const previewKind = detectPreviewKind(artifact, absolutePath);
  if (!previewKind) {
    return {
      previewKind: null,
      previewText: null,
      previewNote: null
    };
  }

  try {
    const fileStats = await stat(absolutePath);
    if (fileStats.size > MAX_PREVIEW_FILE_SIZE) {
      return {
        previewKind,
        previewText: null,
        previewNote: "ファイルが大きいため、軽量プレビューは省略しています。"
      };
    }

    const handle = await open(absolutePath, "r");

    try {
      const buffer = Buffer.alloc(Math.min(MAX_PREVIEW_BYTES, Math.max(1, fileStats.size)));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const rawText = buffer.toString("utf8", 0, bytesRead);

      if (rawText.includes("\u0000")) {
        return {
          previewKind,
          previewText: null,
          previewNote: "バイナリ判定のため、軽量プレビューは表示していません。"
        };
      }

      const previewText = formatPreviewText(rawText);

      return {
        previewKind,
        previewText,
        previewNote: previewText ? "先頭数行のみを表示しています。" : "表示できるテキストが見つかりませんでした。"
      };
    } finally {
      await handle.close();
    }
  } catch {
    return {
      previewKind,
      previewText: null,
      previewNote: "プレビューを読み込めませんでした。必要に応じて絶対パスをコピーして直接確認してください。"
    };
  }
}

function detectPreviewKind(artifact: ReviewDetailArtifactDto, absolutePath: string): ArtifactPreviewKind {
  const extension = path.extname(absolutePath).toLowerCase();
  const contentType = (artifact.contentType ?? "").toLowerCase();

  if (extension === ".json" || extension === ".sarif" || contentType.includes("json")) {
    return "json";
  }

  if (
    PREVIEWABLE_EXTENSIONS.has(extension) ||
    contentType.startsWith("text/") ||
    contentType.includes("yaml") ||
    contentType.includes("xml")
  ) {
    return "text";
  }

  return null;
}

function formatPreviewText(rawText: string) {
  const normalized = rawText.replaceAll("\r\n", "\n").trim();
  if (!normalized) {
    return null;
  }

  const allLines = normalized.split("\n");
  const limitedLines = allLines.slice(0, MAX_PREVIEW_LINES);
  let preview = limitedLines.join("\n");
  let truncated = allLines.length > MAX_PREVIEW_LINES;

  if (preview.length > MAX_PREVIEW_CHARS) {
    preview = preview.slice(0, MAX_PREVIEW_CHARS).trimEnd();
    truncated = true;
  }

  return truncated ? `${preview}\n...` : preview;
}
