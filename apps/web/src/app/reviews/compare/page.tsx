import Link from "next/link";
import {
  ReviewRunCompare,
  type ReviewRunCompareAuditDelta,
  type ReviewRunCompareFindingDeltaGroup,
  type ReviewRunCompareFindingDeltaRow,
  type ReviewRunCompareIntegratedLine,
  type ReviewRunCompareKeyDifference,
  type ReviewRunCompareProposalDelta
} from "@/components/review-run-compare";
import { normalizeReviewCompareId } from "@/lib/contracts/review-compare";
import { REVIEW_FINDING_SEVERITIES } from "@/lib/core/review-types";
import { getReviewCompare, getReviewDetail } from "@/lib/storage/review-repository";

export default async function ReviewComparePage({
  searchParams
}: {
  searchParams: Promise<{ left?: string; right?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const left = normalizeReviewCompareId(resolvedSearchParams.left);
  const right = normalizeReviewCompareId(resolvedSearchParams.right);

  if (!left || !right || left === right) {
    return (
      <main>
        <section className="panel" style={{ padding: "2.4rem", display: "grid", gap: "1rem" }}>
          <p style={eyebrowStyle}>2件比較</p>
          <h1 style={{ margin: 0, fontSize: "clamp(2rem, 4vw, 3.2rem)", color: "#16212b" }}>
            比較対象の実行を選択してください
          </h1>
          <p style={{ margin: 0, color: "#5f7288", lineHeight: 1.7, maxWidth: 760 }}>
            レビュー一覧から 2 件の実行を選択してから比較画面を開いてください。
          </p>
          <Link href="/reviews" style={linkStyle}>
            レビュー一覧に戻る
          </Link>
        </section>
      </main>
    );
  }

  const [compare, leftDetail, rightDetail] = await Promise.all([
    getReviewCompare(left, right),
    getReviewDetail(left),
    getReviewDetail(right)
  ]);

  if (!compare || !leftDetail || !rightDetail) {
    return (
      <main>
        <section className="panel" style={{ padding: "2.4rem", display: "grid", gap: "1rem" }}>
          <p style={eyebrowStyle}>2件比較</p>
          <h1 style={{ margin: 0, fontSize: "clamp(2rem, 4vw, 3.2rem)", color: "#16212b" }}>
            比較対象が見つかりません
          </h1>
          <p style={{ margin: 0, color: "#5f7288", lineHeight: 1.7, maxWidth: 760 }}>
            実行 ID を確認して、レビュー一覧から比較対象を選び直してください。
          </p>
          <Link href="/reviews" style={linkStyle}>
            レビュー一覧に戻る
          </Link>
        </section>
      </main>
    );
  }

  const findingDeltaGroups = buildFindingDeltaGroups(leftDetail.findings, rightDetail.findings);
  const figmaCheckDelta = buildFigmaCheckDelta(leftDetail.findings, rightDetail.findings);
  const figmaMakeDelta = buildFigmaMakeDelta(leftDetail.findings, rightDetail.findings);
  const backToListHref = `/reviews?compareLeft=${encodeURIComponent(left)}&compareRight=${encodeURIComponent(right)}`;
  const keyDifferences = buildKeyDifferences(
    compare,
    leftDetail.steps,
    rightDetail.steps,
    findingDeltaGroups,
    figmaCheckDelta,
    figmaMakeDelta
  );
  const integratedSummary = buildIntegratedSummary(
    leftDetail.findings,
    rightDetail.findings,
    figmaCheckDelta,
    figmaMakeDelta
  );

  return (
    <main>
      <ReviewRunCompare
        compare={compare}
        backToListHref={backToListHref}
        findingDeltaGroups={findingDeltaGroups}
        figmaCheckDelta={figmaCheckDelta}
        figmaMakeDelta={figmaMakeDelta}
        keyDifferences={keyDifferences}
        integratedSummary={integratedSummary}
      />
    </main>
  );
}

type FindingLike = {
  severity: string;
  sourceTool: string;
  category?: string | null;
  title?: string | null;
  description?: string | null;
  suggestion?: string | null;
};

function buildFindingDeltaGroups(
  leftFindings: FindingLike[],
  rightFindings: FindingLike[]
): ReviewRunCompareFindingDeltaGroup[] {
  const severityRows = REVIEW_FINDING_SEVERITIES.map((severity) =>
    createFindingDeltaRow(
      severity,
      leftFindings.filter((finding) => finding.severity === severity).length,
      rightFindings.filter((finding) => finding.severity === severity).length
    )
  );

  const sourceTools = Array.from(
    new Set([...leftFindings.map((finding) => finding.sourceTool), ...rightFindings.map((finding) => finding.sourceTool)])
  ).sort((leftValue, rightValue) => leftValue.localeCompare(rightValue));
  const sourceToolRows = sourceTools.map((sourceTool) =>
    createFindingDeltaRow(
      formatSourceToolLabel(sourceTool),
      leftFindings.filter((finding) => finding.sourceTool === sourceTool).length,
      rightFindings.filter((finding) => finding.sourceTool === sourceTool).length
    )
  );

  return [
    {
      title: "重要度別の差分",
      marker: severityRows.some((row) => row.delta !== 0) ? "重要度に差分があります" : "重要度の差分はありません",
      rows: severityRows
    },
    {
      title: "ツール別の差分",
      marker: sourceToolRows.some((row) => row.delta !== 0) ? "ツール構成に差分があります" : "ツール構成の差分はありません",
      rows: sourceToolRows
    }
  ];
}

function buildFigmaCheckDelta(leftFindings: FindingLike[], rightFindings: FindingLike[]): ReviewRunCompareAuditDelta | null {
  const leftAuditFindings = leftFindings.filter((finding) => finding.sourceTool === "figma_check");
  const rightAuditFindings = rightFindings.filter((finding) => finding.sourceTool === "figma_check");

  if (leftAuditFindings.length === 0 && rightAuditFindings.length === 0) {
    return null;
  }

  const severityRows = REVIEW_FINDING_SEVERITIES.map((severity) =>
    createFindingDeltaRow(
      severity,
      leftAuditFindings.filter((finding) => finding.severity === severity).length,
      rightAuditFindings.filter((finding) => finding.severity === severity).length
    )
  );

  const categories = Array.from(
    new Set(
      [...leftAuditFindings, ...rightAuditFindings]
        .map((finding) => normalizeCategory(finding.category))
        .filter((value): value is string => Boolean(value))
    )
  ).sort((leftValue, rightValue) => leftValue.localeCompare(rightValue));

  const categoryRows = categories.map((category) =>
    createFindingDeltaRow(
      category,
      leftAuditFindings.filter((finding) => normalizeCategory(finding.category) === category).length,
      rightAuditFindings.filter((finding) => normalizeCategory(finding.category) === category).length
    )
  );

  return {
    findingCountDelta: createFindingDeltaRow("figma_check", leftAuditFindings.length, rightAuditFindings.length),
    severityRows,
    categoryRows
  };
}

function buildFigmaMakeDelta(
  leftFindings: FindingLike[],
  rightFindings: FindingLike[]
): ReviewRunCompareProposalDelta | null {
  const leftProposalFindings = leftFindings.filter((finding) => finding.sourceTool === "figma_make");
  const rightProposalFindings = rightFindings.filter((finding) => finding.sourceTool === "figma_make");

  if (leftProposalFindings.length === 0 && rightProposalFindings.length === 0) {
    return null;
  }

  const themes = Array.from(
    new Set(
      [...leftProposalFindings, ...rightProposalFindings]
        .flatMap((finding) => deriveFigmaMakeThemes(finding))
        .filter((value): value is string => Boolean(value))
    )
  ).sort((leftValue, rightValue) => leftValue.localeCompare(rightValue));

  const themeRows = themes.map((theme) =>
    createFindingDeltaRow(
      theme,
      leftProposalFindings.filter((finding) => deriveFigmaMakeThemes(finding).includes(theme)).length,
      rightProposalFindings.filter((finding) => deriveFigmaMakeThemes(finding).includes(theme)).length
    )
  );

  return {
    findingCountDelta: createFindingDeltaRow("figma_make", leftProposalFindings.length, rightProposalFindings.length),
    themeRows
  };
}

function buildIntegratedSummary(
  leftFindings: FindingLike[],
  rightFindings: FindingLike[],
  figmaCheckDelta: ReviewRunCompareAuditDelta | null,
  figmaMakeDelta: ReviewRunCompareProposalDelta | null
): ReviewRunCompareIntegratedLine[] {
  const geminiLine = buildGeminiIntegratedLine(leftFindings, rightFindings);
  const figmaCheckLine = buildFigmaCheckIntegratedLine(figmaCheckDelta);
  const figmaMakeLine = buildFigmaMakeIntegratedLine(figmaMakeDelta);

  return [geminiLine, figmaCheckLine, figmaMakeLine].filter(
    (line): line is ReviewRunCompareIntegratedLine => Boolean(line)
  );
}

function buildGeminiIntegratedLine(leftFindings: FindingLike[], rightFindings: FindingLike[]) {
  const leftGemini = leftFindings.filter((finding) => finding.sourceTool === "gemini");
  const rightGemini = rightFindings.filter((finding) => finding.sourceTool === "gemini");

  if (leftGemini.length === 0 && rightGemini.length === 0) {
    return null;
  }

  const delta = leftGemini.length - rightGemini.length;
  const severityRows = REVIEW_FINDING_SEVERITIES.map((severity) =>
    createFindingDeltaRow(
      severity,
      leftGemini.filter((finding) => finding.severity === severity).length,
      rightGemini.filter((finding) => finding.severity === severity).length
    )
  );
  const summary = summarizeDeltaRows(severityRows, 2);

  return {
    label: "Gemini 主な指摘",
    text:
      delta === 0
        ? `Gemini の主な指摘は両者とも ${leftGemini.length} 件です。${summary ? ` ${summary}` : ""}`
        : `Gemini の主な指摘は${describeDeltaSide(delta)}です（左 ${leftGemini.length} 件 / 右 ${rightGemini.length} 件）。${summary ? ` ${summary}` : ""}`
  };
}

function buildFigmaCheckIntegratedLine(figmaCheckDelta: ReviewRunCompareAuditDelta | null) {
  if (!figmaCheckDelta) {
    return null;
  }

  const delta = figmaCheckDelta.findingCountDelta.delta;
  const severitySummary = summarizeDeltaRows(figmaCheckDelta.severityRows, 1);
  const categorySummary = summarizeDeltaRows(figmaCheckDelta.categoryRows, 2);
  const fragments = [severitySummary, categorySummary].filter(Boolean);

  return {
    label: "Figma Check 監査差分",
    text:
      delta === 0
        ? `Figma Check の監査指摘は両者とも ${figmaCheckDelta.findingCountDelta.leftCount} 件です。${fragments.join(" / ") || " 件数差分はありません。"}`
        : `Figma Check の監査指摘は${describeDeltaSide(delta)}です（左 ${figmaCheckDelta.findingCountDelta.leftCount} 件 / 右 ${figmaCheckDelta.findingCountDelta.rightCount} 件）。${fragments.join(" / ")}`
  };
}

function buildFigmaMakeIntegratedLine(figmaMakeDelta: ReviewRunCompareProposalDelta | null) {
  if (!figmaMakeDelta) {
    return null;
  }

  const delta = figmaMakeDelta.findingCountDelta.delta;
  const themeSummary = summarizeDeltaRows(figmaMakeDelta.themeRows, 2);

  return {
    label: "Figma Make 改善案差分",
    text:
      delta === 0
        ? `Figma Make の改善案は両者とも ${figmaMakeDelta.findingCountDelta.leftCount} 件です。${themeSummary || " テーマ差分はありません。"}`
        : `Figma Make の改善案は${describeDeltaSide(delta)}です（左 ${figmaMakeDelta.findingCountDelta.leftCount} 件 / 右 ${figmaMakeDelta.findingCountDelta.rightCount} 件）。${themeSummary}`
  };
}

function deriveFigmaMakeThemes(finding: FindingLike) {
  const sourceText = `${finding.title ?? ""} ${finding.description ?? ""} ${finding.suggestion ?? ""}`.toLowerCase();
  const themes: string[] = [];

  if (/cta|call to action|button/.test(sourceText)) {
    themes.push("cta");
  }

  if (/hierarchy|focal|focus|emphasis|priority/.test(sourceText)) {
    themes.push("hierarchy");
  }

  if (/spacing|space|margin|padding/.test(sourceText)) {
    themes.push("spacing");
  }

  if (/contrast/.test(sourceText)) {
    themes.push("contrast");
  }

  if (/hero|width|layout/.test(sourceText)) {
    themes.push("layout");
  }

  if (themes.length === 0) {
    themes.push("other");
  }

  return themes;
}

function normalizeCategory(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function createFindingDeltaRow(label: string, leftCount: number, rightCount: number): ReviewRunCompareFindingDeltaRow {
  return {
    label,
    leftCount,
    rightCount,
    delta: leftCount - rightCount
  };
}

function buildKeyDifferences(
  compare: {
    left: { status: string; findingCount: number; archived: boolean };
    right: { status: string; findingCount: number; archived: boolean };
  },
  leftSteps: Array<{ stepName: string; status: string }>,
  rightSteps: Array<{ stepName: string; status: string }>,
  findingDeltaGroups: ReviewRunCompareFindingDeltaGroup[],
  figmaCheckDelta: ReviewRunCompareAuditDelta | null,
  figmaMakeDelta: ReviewRunCompareProposalDelta | null
): ReviewRunCompareKeyDifference[] {
  const statusLine =
    compare.left.status === compare.right.status
      ? `ステータスは両者とも ${formatStatusLabel(compare.left.status)} です。`
      : `ステータスは左が ${formatStatusLabel(compare.left.status)}、右が ${formatStatusLabel(compare.right.status)} です。`;

  const findingDelta = compare.left.findingCount - compare.right.findingCount;
  const findingCountLine =
    findingDelta === 0
      ? `指摘件数は両者とも ${compare.left.findingCount} 件です。`
      : `指摘件数は${describeDeltaSide(findingDelta)}です（左 ${compare.left.findingCount} 件 / 右 ${compare.right.findingCount} 件）。`;

  const severityLine = buildFindingMixLine("重要度", findingDeltaGroups[0]);
  const sourceToolLine = buildFindingMixLine("ツール", findingDeltaGroups[1]);
  const figmaCheckLine = buildFigmaCheckKeyDifference(figmaCheckDelta);
  const figmaMakeLine = buildFigmaMakeKeyDifference(figmaMakeDelta);
  const archiveLine = buildArchiveStateLine(compare);
  const optionalFailureLine = buildOptionalFailureLine(leftSteps, rightSteps);

  return [
    statusLine,
    findingCountLine,
    severityLine,
    sourceToolLine,
    figmaCheckLine,
    figmaMakeLine,
    archiveLine,
    optionalFailureLine
  ]
    .filter(Boolean)
    .map((text) => ({ text }));
}

function buildFigmaCheckKeyDifference(figmaCheckDelta: ReviewRunCompareAuditDelta | null) {
  if (!figmaCheckDelta) {
    return "";
  }

  const countDelta = figmaCheckDelta.findingCountDelta.delta;
  const countLine =
    countDelta === 0
      ? `Figma Check の監査指摘は両者とも ${figmaCheckDelta.findingCountDelta.leftCount} 件です。`
      : `Figma Check の監査指摘は${describeDeltaSide(countDelta)}です（左 ${figmaCheckDelta.findingCountDelta.leftCount} 件 / 右 ${figmaCheckDelta.findingCountDelta.rightCount} 件）。`;

  const severitySummary = summarizeDeltaRows(figmaCheckDelta.severityRows, 1);
  const categorySummary = summarizeDeltaRows(figmaCheckDelta.categoryRows, 2);
  const details = [severitySummary, categorySummary].filter(Boolean).join(" / ");

  return details ? `${countLine} ${details}` : countLine;
}

function buildFigmaMakeKeyDifference(figmaMakeDelta: ReviewRunCompareProposalDelta | null) {
  if (!figmaMakeDelta) {
    return "";
  }

  const countDelta = figmaMakeDelta.findingCountDelta.delta;
  const countLine =
    countDelta === 0
      ? `Figma Make の改善案は両者とも ${figmaMakeDelta.findingCountDelta.leftCount} 件です。`
      : `Figma Make の改善案は${describeDeltaSide(countDelta)}です（左 ${figmaMakeDelta.findingCountDelta.leftCount} 件 / 右 ${figmaMakeDelta.findingCountDelta.rightCount} 件）。`;

  const themeSummary = summarizeDeltaRows(figmaMakeDelta.themeRows, 2);
  return themeSummary ? `${countLine} ${themeSummary}` : countLine;
}

function buildArchiveStateLine(compare: {
  left: { archived: boolean };
  right: { archived: boolean };
}) {
  if (compare.left.archived === compare.right.archived) {
    return compare.left.archived
      ? "アーカイブ状態は両者ともアーカイブ済みです。"
      : "アーカイブ状態は両者とも有効です。";
  }

  return compare.left.archived
    ? "アーカイブ状態は左がアーカイブ済み、右が有効です。"
    : "アーカイブ状態は右がアーカイブ済み、左が有効です。";
}

function buildFindingMixLine(prefix: string, group: ReviewRunCompareFindingDeltaGroup | undefined) {
  if (!group) {
    return "";
  }

  const importantRows = group.rows
    .filter((row) => row.delta !== 0)
    .sort((leftValue, rightValue) => Math.abs(rightValue.delta) - Math.abs(leftValue.delta))
    .slice(0, 2);

  if (importantRows.length === 0) {
    return `${prefix}の大きな差分はありません。`;
  }

  const summary = importantRows
    .map((row) =>
      row.delta > 0
        ? `左の${formatBucketLabel(row.label)}が ${row.delta} 件多い`
        : `右の${formatBucketLabel(row.label)}が ${Math.abs(row.delta)} 件多い`
    )
    .join("、");

  return `${prefix}の差分: ${summary}`;
}

function summarizeDeltaRows(rows: ReviewRunCompareFindingDeltaRow[], maxItems: number) {
  const importantRows = rows
    .filter((row) => row.delta !== 0)
    .sort((leftValue, rightValue) => Math.abs(rightValue.delta) - Math.abs(leftValue.delta))
    .slice(0, maxItems);

  if (importantRows.length === 0) {
    return "";
  }

  return importantRows
    .map((row) =>
      row.delta > 0
        ? `左の${formatBucketLabel(row.label)}が ${row.delta} 件多い`
        : `右の${formatBucketLabel(row.label)}が ${Math.abs(row.delta)} 件多い`
    )
    .join("、");
}

function buildOptionalFailureLine(
  leftSteps: Array<{ stepName: string; status: string }>,
  rightSteps: Array<{ stepName: string; status: string }>
) {
  const leftFailed = leftSteps.filter((step) => step.status === "failed").map((step) => step.stepName);
  const rightFailed = rightSteps.filter((step) => step.status === "failed").map((step) => step.stepName);

  if (leftFailed.length === 0 && rightFailed.length === 0) {
    return "失敗ステップはどちらにもありません。";
  }

  if (leftFailed.length > 0 && rightFailed.length === 0) {
    return `失敗ステップは左のみです: ${leftFailed.join("、")}。`;
  }

  if (leftFailed.length === 0 && rightFailed.length > 0) {
    return `失敗ステップは右のみです: ${rightFailed.join("、")}。`;
  }

  return `失敗ステップは左が ${leftFailed.join("、")}、右が ${rightFailed.join("、")} です。`;
}

function describeDeltaSide(delta: number) {
  return delta > 0 ? `左が ${delta} 件多い` : `右が ${Math.abs(delta)} 件多い`;
}

function formatBucketLabel(label: string) {
  const labels: Record<string, string> = {
    high: "高",
    medium: "中",
    low: "低",
    cta: "CTA",
    hierarchy: "階層",
    spacing: "余白",
    contrast: "コントラスト",
    layout: "レイアウト",
    other: "その他"
  };

  return labels[label] ?? label.replaceAll("_", " ");
}

function formatSourceToolLabel(sourceTool: string) {
  if (sourceTool === "figma_make") {
    return "figma_make / 改善案";
  }

  if (sourceTool === "figma_check") {
    return "figma_check / 監査指摘";
  }

  const labels: Record<string, string> = {
    gemini: "gemini / 指摘",
    gpt: "gpt / 優先アクション",
    figma: "figma / 補足所見",
    semgrep: "semgrep / セキュリティ指摘",
    zap: "zap / セキュリティ指摘",
    codeql: "codeql / セキュリティ指摘"
  };

  return labels[sourceTool] ?? sourceTool.replaceAll("_", " ");
}

function formatStatusLabel(status: string) {
  const labels: Record<string, string> = {
    completed: "完了",
    partial_success: "一部成功",
    failed: "失敗",
    skipped: "スキップ",
    success: "成功",
    error: "エラー",
    warning: "注意",
    running: "実行中",
    draft: "下書き",
    pending: "待機中"
  };

  return labels[status] ?? status.replaceAll("_", " ");
}

const eyebrowStyle = {
  margin: 0,
  color: "#4d78c9",
  fontSize: "0.84rem",
  textTransform: "uppercase" as const,
  letterSpacing: "0.14em",
  fontWeight: 700
};

const linkStyle = {
  color: "#2f6fed",
  fontWeight: 700,
  textDecoration: "none"
};
