"use client";

import Link from "next/link";
import { useState } from "react";
import type { CSSProperties } from "react";
import type { ReviewDetailArtifactDto, ReviewDetailFindingDto, ReviewDetailStepDto } from "@/lib/contracts/review-detail";
import type { ReviewArtifactUsage } from "@/lib/contracts/review-detail-mapper";
import type { ReviewRunStatus, ReviewStepName, ReviewStepStatus } from "@/lib/core/review-types";
import { REVIEW_STEP_NAMES } from "@/lib/core/review-types";

type ArtifactWithPresentation = ReviewDetailArtifactDto & {
  absolutePath: string;
  previewKind: "json" | "text" | null;
  previewText: string | null;
  previewNote: string | null;
};

const usagePriority: Record<ReviewArtifactUsage, number> = {
  request: 0,
  response: 1,
  report: 2,
  knowledge: 3,
  output: 4,
  input: 5
};

const usageMeta: Record<
  ReviewArtifactUsage,
  {
    label: string;
    shortLabel: string;
    description: string;
    background: string;
    border: string;
    accent: string;
    strong: string;
  }
> = {
  request: {
    label: "request",
    shortLabel: "request",
    description: "送信内容の確認向け",
    background: "rgba(234, 243, 255, 0.96)",
    border: "rgba(47, 111, 237, 0.18)",
    accent: "#2f6fed",
    strong: "#173b76"
  },
  response: {
    label: "response",
    shortLabel: "response",
    description: "返却内容の確認向け",
    background: "rgba(232, 248, 252, 0.96)",
    border: "rgba(22, 151, 166, 0.18)",
    accent: "#1697a6",
    strong: "#0e6570"
  },
  report: {
    label: "report",
    shortLabel: "report",
    description: "スキャン結果や解析レポート",
    background: "rgba(255, 247, 232, 0.96)",
    border: "rgba(194, 136, 38, 0.2)",
    accent: "#c28826",
    strong: "#7b5312"
  },
  knowledge: {
    label: "knowledge",
    shortLabel: "knowledge",
    description: "補助コンテキストや前提情報",
    background: "rgba(240, 245, 238, 0.96)",
    border: "rgba(82, 123, 83, 0.18)",
    accent: "#527b53",
    strong: "#305132"
  },
  output: {
    label: "output",
    shortLabel: "output",
    description: "最終出力や整形済み成果物",
    background: "rgba(247, 242, 255, 0.96)",
    border: "rgba(116, 84, 181, 0.16)",
    accent: "#7454b5",
    strong: "#4a317a"
  },
  input: {
    label: "input",
    shortLabel: "input",
    description: "元の入力素材や添付ファイル",
    background: "rgba(245, 246, 248, 0.96)",
    border: "rgba(111, 138, 164, 0.18)",
    accent: "#6f8aa4",
    strong: "#43586d"
  }
};

const usageFilterOptions: Array<{ value: ReviewArtifactUsage | "all"; label: string }> = [
  { value: "all", label: "すべての用途" },
  { value: "request", label: "request" },
  { value: "response", label: "response" },
  { value: "report", label: "report" },
  { value: "knowledge", label: "knowledge" },
  { value: "output", label: "output" },
  { value: "input", label: "input" }
];

const stepFilterOptions: Array<{ value: ReviewStepName | "all"; label: string }> = [
  { value: "all", label: "すべてのステップ" },
  ...REVIEW_STEP_NAMES.map((stepName) => ({
    value: stepName,
    label: formatStepName(stepName)
  }))
];

export function ReviewRunArtifacts(props: {
  run: {
    id: string;
    title: string | null;
    status: ReviewRunStatus;
    archived: boolean;
  };
  steps: ReviewDetailStepDto[];
  artifactsByStep: Record<ReviewStepName, ArtifactWithPresentation[]>;
  figmaCheckArtifacts: ArtifactWithPresentation[];
  figmaCheckFindings: ReviewDetailFindingDto[];
  detailHref: string;
  currentPathname: string;
  initialStepFilter: ReviewStepName | "all";
  initialUsageFilter: ReviewArtifactUsage | "all";
}) {
  const {
    run,
    steps,
    artifactsByStep,
    detailHref,
    currentPathname,
    initialStepFilter,
    initialUsageFilter
  } = props;

  const totalArtifacts = REVIEW_STEP_NAMES.reduce((sum, stepName) => sum + artifactsByStep[stepName].length, 0);
  const focusCounts = countArtifactsByUsage(artifactsByStep);
  const figmaCheckReportArtifact = props.figmaCheckArtifacts.find((artifact) => artifact.artifactType === "figma_check_report") ?? null;
  const figmaCheckSummaryArtifact = props.figmaCheckArtifacts.find((artifact) => artifact.artifactType === "figma_check_summary") ?? null;
  const figmaCheckReportFlavor = detectFigmaCheckReportFlavor(figmaCheckReportArtifact, figmaCheckSummaryArtifact);

  const filteredSections = REVIEW_STEP_NAMES.flatMap((stepName) => {
    if (initialStepFilter !== "all" && initialStepFilter !== stepName) {
      return [];
    }

    const step = steps.find((entry) => entry.stepName === stepName);
    const artifacts = artifactsByStep[stepName]
      .filter((artifact) => initialUsageFilter === "all" || artifact.usage === initialUsageFilter)
      .sort(sortArtifactsForDeveloperView);

    if (artifacts.length === 0) {
      return [];
    }

    return [{ stepName, step, artifacts }] as const;
  });

  const filteredArtifactCount = filteredSections.reduce((sum, section) => sum + section.artifacts.length, 0);
  const activeFilters = [
    initialStepFilter !== "all" ? `ステップ: ${formatStepName(initialStepFilter)}` : null,
    initialUsageFilter !== "all" ? `用途: ${formatUsageLabel(initialUsageFilter)}` : null
  ].filter(Boolean) as string[];

  return (
    <section className="panel" style={{ padding: "2.2rem", display: "grid", gap: "1.5rem" }}>
      <header style={{ display: "grid", gap: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "0.4rem" }}>
            <p style={eyebrowStyle}>開発者向け成果物</p>
            <h1 style={{ margin: 0, fontSize: "clamp(1.85rem, 3.4vw, 2.8rem)", color: "#16212b" }}>
              {run.title ?? run.id}
            </h1>
            {run.title ? <p style={idMetaStyle}>実行ID: {run.id}</p> : null}
            <div style={{ display: "flex", gap: "0.7rem", alignItems: "center", flexWrap: "wrap" }}>
              <StatusBadge status={run.status} />
              {run.archived ? <span style={archivedPillStyle}>アーカイブ済み</span> : null}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "start", flexWrap: "wrap" }}>
            <Link href={detailHref} style={secondaryLinkStyle}>
              詳細に戻る
            </Link>
          </div>
        </div>

        <article style={developerBannerStyle}>
          <div style={{ display: "grid", gap: "0.35rem" }}>
            <strong style={{ color: "#173b76" }}>この画面は開発者 / 運用担当向けです。</strong>
            <p style={{ margin: 0, color: "#47627f", lineHeight: 1.6 }}>
              表示は相対パスのまま維持し、コピー時のみ絶対パスをクリップボードへ入れます。Explorer や
              VS Code にそのまま貼り付けて開けます。
            </p>
          </div>
          <div style={{ display: "grid", gap: "0.35rem", minWidth: 240 }}>
            <span style={smallLabelStyle}>絞り込み後の件数</span>
            <strong style={{ fontSize: "1.25rem", color: "#16212b" }}>
              {filteredArtifactCount} 件 / 全 {totalArtifacts} 件
            </strong>
          </div>
        </article>

        <div style={focusStripStyle}>
          <FocusCard
            label="よく見る request"
            description={usageMeta.request.description}
            count={focusCounts.request}
            href={buildArtifactsHref(currentPathname, initialStepFilter, "request")}
            active={initialUsageFilter === "request"}
            tone={usageMeta.request}
          />
          <FocusCard
            label="よく見る response"
            description={usageMeta.response.description}
            count={focusCounts.response}
            href={buildArtifactsHref(currentPathname, initialStepFilter, "response")}
            active={initialUsageFilter === "response"}
            tone={usageMeta.response}
          />
          <FocusCard
            label="よく見る report"
            description={usageMeta.report.description}
            count={focusCounts.report}
            href={buildArtifactsHref(currentPathname, initialStepFilter, "report")}
            active={initialUsageFilter === "report"}
            tone={usageMeta.report}
          />
        </div>

        <form method="get" action={currentPathname} style={filterToolbarStyle}>
          <label style={{ display: "grid", gap: "0.35rem", minWidth: 220 }}>
            <span style={smallLabelStyle}>ステップで絞り込み</span>
            <select name="step" defaultValue={initialStepFilter} style={selectStyle}>
              {stepFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: "0.35rem", minWidth: 220 }}>
            <span style={smallLabelStyle}>用途で絞り込み</span>
            <select name="usage" defaultValue={initialUsageFilter} style={selectStyle}>
              {usageFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" style={primaryButtonStyle}>
            絞り込みを適用
          </button>
          <Link href={currentPathname} style={secondaryLinkStyle}>
            絞り込みを解除
          </Link>
        </form>

        <div style={activeFilterPanelStyle}>
          <div style={{ display: "grid", gap: "0.2rem" }}>
            <span style={smallLabelStyle}>現在の絞り込み</span>
            <strong style={{ color: "#16212b" }}>
              {activeFilters.length > 0 ? `${filteredArtifactCount} 件を表示中` : "絞り込みなし"}
            </strong>
          </div>
          <div style={{ display: "flex", gap: "0.55rem", flexWrap: "wrap" }}>
            {activeFilters.length > 0 ? (
              activeFilters.map((filter) => (
                <span key={filter} style={activeFilterPillStyle}>
                  {filter}
                </span>
              ))
            ) : (
              <span style={inactiveFilterHintStyle}>すべてのステップ / すべての用途を表示しています。</span>
            )}
          </div>
        </div>
        {props.figmaCheckArtifacts.length > 0 || props.figmaCheckFindings.length > 0 ? (
          <section style={figmaCheckAuditSectionStyle}>
            <div style={{ display: "grid", gap: "0.35rem" }}>
              <p style={eyebrowStyle}>Figma Check ingest</p>
              <h2 style={{ margin: 0, color: "#16212b", fontSize: "1.2rem" }}>元レポートと抽出結果の対応</h2>
              <p style={{ margin: 0, color: "#5f7288", lineHeight: 1.65 }}>
                manual_ingest した元テキストと、そこから抽出した監査指摘を同じ画面で見比べられます。
              </p>
            </div>

            <div style={figmaCheckMetaGridStyle}>
              <AuditSummaryCard
                title="入力形式"
                headline={figmaCheckReportFlavor.label}
                detail={figmaCheckReportFlavor.description}
              />
              <AuditSummaryCard
                title="抽出結果"
                headline={`${props.figmaCheckFindings.length} 件`}
                detail="title / severity / category / recommendation を拾えたものは構造化表示しています。"
              />
              <AuditSummaryCard
                title="元レポート"
                headline={
                  figmaCheckReportArtifact
                    ? formatArtifactLabel(figmaCheckReportArtifact.artifactType, figmaCheckReportArtifact.label)
                    : "未保存"
                }
                detail={figmaCheckReportArtifact?.path ?? "report artifact は見つかりませんでした。"}
              />
            </div>

            <div style={figmaCheckGridStyle}>
              <article style={figmaCheckPanelStyle}>
                <div style={{ display: "grid", gap: "0.4rem" }}>
                  <h3 style={figmaCheckPanelHeadingStyle}>元レポートプレビュー</h3>
                  <p style={figmaCheckPanelHintStyle}>
                    structured markdown / summary text / JSON の違いが分かるように、検出した形式を表示しています。
                  </p>
                </div>
                {figmaCheckReportArtifact ? (
                  <FigmaCheckSourceCard artifact={figmaCheckReportArtifact} label="report" flavorLabel={figmaCheckReportFlavor.label} />
                ) : (
                  <EmptyAuditBox text="report artifact はありません。" />
                )}
                {figmaCheckSummaryArtifact ? (
                  <FigmaCheckSourceCard artifact={figmaCheckSummaryArtifact} label="summary" flavorLabel="summary text" />
                ) : null}
              </article>

              <article style={figmaCheckPanelStyle}>
                <div style={{ display: "grid", gap: "0.4rem" }}>
                  <h3 style={figmaCheckPanelHeadingStyle}>抽出された監査指摘</h3>
                  <p style={figmaCheckPanelHintStyle}>
                    各カードで severity / category / recommendation を確認し、元レポートとの対応を追えます。
                  </p>
                </div>
                {props.figmaCheckFindings.length > 0 ? (
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    {props.figmaCheckFindings.map((finding) => (
                      <FigmaCheckFindingCard key={finding.id} finding={finding} />
                    ))}
                  </div>
                ) : (
                  <EmptyAuditBox text="抽出された figma_check finding はありません。" />
                )}
              </article>
            </div>
          </section>
        ) : null}
      </header>

      <div style={{ display: "grid", gap: "1rem" }}>
        {filteredSections.length === 0 ? (
          <section style={emptyStateStyle}>
            <strong>現在の条件に一致する成果物はありません。</strong>
            <p style={{ margin: 0, color: "#5f7288", lineHeight: 1.6 }}>
              ステップまたは用途の条件を緩めて、再度確認してください。
            </p>
          </section>
        ) : null}
        {filteredSections.map(({ stepName, step, artifacts }) => (
          <section
            key={stepName}
            style={{
              ...artifactGroupStyle,
              borderColor: getStatusTone(step?.status ?? "pending").border
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: "1.08rem", color: "#16212b" }}>{formatStepName(stepName)}</h2>
                <StatusBadge status={step?.status ?? "pending"} />
              </div>
              <span style={{ color: "#5f7288", alignSelf: "center" }}>{artifacts.length} 件</span>
            </div>
            {step?.summaryText ? (
              <p style={{ margin: "0.65rem 0 0", color: "#4d5f74", lineHeight: 1.6 }}>{step.summaryText}</p>
            ) : null}
            <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.9rem" }}>
              {artifacts.map((artifact) => (
                <ArtifactRow key={artifact.id} artifact={artifact} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function ArtifactRow(props: { artifact: ArtifactWithPresentation }) {
  const { artifact } = props;
  const [copied, setCopied] = useState(false);
  const tone = usageMeta[artifact.usage];

  async function copyPath() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(artifact.absolutePath);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }
    } catch {
      setCopied(false);
    }
  }

  return (
    <article
      style={{
        ...artifactCardStyle,
        background: tone.background,
        borderColor: tone.border,
        boxShadow: `inset 4px 0 0 ${tone.accent}`
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: "0.45rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
            <strong style={{ color: "#16212b" }}>{formatArtifactLabel(artifact.artifactType, artifact.label)}</strong>
            <span style={{ ...usagePillStyle, borderColor: tone.border, background: "#fff", color: tone.strong }}>
              {formatUsageLabel(artifact.usage)}
            </span>
          </div>
          <span style={{ color: tone.strong, fontWeight: 600, fontSize: "0.92rem" }}>{tone.description}</span>
          {artifact.contentType ? <span style={{ color: "#6b5a47" }}>{artifact.contentType}</span> : null}
        </div>
        <button type="button" onClick={copyPath} style={copyButtonStyle} data-copy-path={artifact.absolutePath}>
          {copied ? "絶対パスをコピー済み" : "パスをコピー"}
        </button>
      </div>

      <div
        style={{
          marginTop: "0.75rem",
          padding: "0.85rem 0.95rem",
          borderRadius: 14,
          background: "rgba(39, 34, 29, 0.06)"
        }}
      >
        <code style={{ display: "block", wordBreak: "break-all", lineHeight: 1.55 }}>{artifact.path}</code>
      </div>
      <p style={{ margin: "0.5rem 0 0", color: "#70839a", fontSize: "0.88rem" }}>
        表示は相対パス / コピーは絶対パス
      </p>

      {artifact.previewText || artifact.previewNote ? (
        <section
          style={{
            marginTop: "0.9rem",
            padding: "0.95rem 1rem",
            borderRadius: 16,
            background: "rgba(255,255,255,0.78)",
            border: `1px solid ${tone.border}`,
            display: "grid",
            gap: "0.45rem"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
            <strong style={{ color: tone.strong }}>{formatPreviewLabel(artifact.previewKind)}</strong>
            {artifact.previewNote ? <span style={previewNoteStyle}>{artifact.previewNote}</span> : null}
          </div>
          {artifact.previewText ? (
            <pre
              style={{
                margin: 0,
                fontSize: "0.88rem",
                lineHeight: 1.6,
                color: "#22303d",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "Consolas, 'Courier New', monospace"
              }}
            >
              {artifact.previewText}
            </pre>
          ) : null}
        </section>
      ) : null}
    </article>
  );
}

function FigmaCheckSourceCard(props: {
  artifact: ArtifactWithPresentation;
  label: string;
  flavorLabel: string;
}) {
  return (
    <div style={figmaCheckSourceCardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: "0.3rem" }}>
          <strong style={{ color: "#16212b" }}>{props.label}</strong>
          <span style={figmaCheckSourceMetaStyle}>{props.flavorLabel}</span>
          <code style={figmaCheckPathStyle}>{props.artifact.path}</code>
        </div>
        <span style={figmaCheckUsagePillStyle}>{formatUsageLabel(props.artifact.usage)}</span>
      </div>
      {props.artifact.previewText ? (
        <pre style={figmaCheckPreviewStyle}>{props.artifact.previewText}</pre>
      ) : (
        <EmptyAuditBox text={props.artifact.previewNote ?? "プレビューはありません。"} />
      )}
      {props.artifact.previewNote ? <p style={figmaCheckSourceNoteStyle}>{props.artifact.previewNote}</p> : null}
    </div>
  );
}

function FigmaCheckFindingCard(props: { finding: ReviewDetailFindingDto }) {
  return (
    <article style={figmaCheckFindingCardStyle}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
        <strong style={{ color: "#16212b", fontSize: "0.98rem" }}>{props.finding.title}</strong>
        <span style={getFigmaCheckSeverityPillStyle(props.finding.severity)}>{props.finding.severity}</span>
        <span style={figmaCheckCategoryPillStyle}>{props.finding.category || "other"}</span>
      </div>
      {props.finding.description ? <p style={figmaCheckBodyStyle}>{props.finding.description}</p> : null}
      <div style={{ display: "grid", gap: "0.35rem" }}>
        <div>
          <span style={figmaCheckLabelStyle}>Recommendation</span>
          <p style={figmaCheckBodyStyle}>{props.finding.suggestion}</p>
        </div>
        {props.finding.targetRef ? (
          <div>
            <span style={figmaCheckLabelStyle}>Target</span>
            <p style={figmaCheckBodyStyle}>{props.finding.targetRef}</p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function AuditSummaryCard(props: { title: string; headline: string; detail: string }) {
  return (
    <article style={auditSummaryCardStyle}>
      <p style={smallLabelStyle}>{props.title}</p>
      <strong style={{ color: "#16212b", fontSize: "1rem" }}>{props.headline}</strong>
      <p style={{ margin: 0, color: "#5f7288", lineHeight: 1.6 }}>{props.detail}</p>
    </article>
  );
}

function EmptyAuditBox(props: { text: string }) {
  return <div style={emptyAuditBoxStyle}>{props.text}</div>;
}

function FocusCard(props: {
  label: string;
  description: string;
  count: number;
  href: string;
  active: boolean;
  tone: (typeof usageMeta)[ReviewArtifactUsage];
}) {
  return (
    <Link
      href={props.href}
      style={{
        ...focusCardStyle,
        borderColor: props.active ? props.tone.border : "rgba(111, 138, 164, 0.12)",
        background: props.active ? props.tone.background : "rgba(255,255,255,0.98)",
        boxShadow: props.active ? `0 12px 24px ${withAlpha(props.tone.accent, 0.12)}` : focusCardStyle.boxShadow
      }}
    >
      <span style={smallLabelStyle}>{props.label}</span>
      <strong style={{ fontSize: "1.15rem", color: props.tone.strong }}>{props.count} 件</strong>
      <span style={{ color: "#5f7288", fontSize: "0.88rem", lineHeight: 1.5 }}>{props.description}</span>
    </Link>
  );
}

function countArtifactsByUsage(artifactsByStep: Record<ReviewStepName, ArtifactWithPresentation[]>) {
  const counts: Record<ReviewArtifactUsage, number> = {
    input: 0,
    knowledge: 0,
    request: 0,
    response: 0,
    report: 0,
    output: 0
  };

  for (const stepName of REVIEW_STEP_NAMES) {
    for (const artifact of artifactsByStep[stepName]) {
      counts[artifact.usage] += 1;
    }
  }

  return counts;
}

function sortArtifactsForDeveloperView(left: ArtifactWithPresentation, right: ArtifactWithPresentation) {
  const usageDelta = usagePriority[left.usage] - usagePriority[right.usage];
  if (usageDelta !== 0) {
    return usageDelta;
  }

  if (left.previewText && !right.previewText) {
    return -1;
  }

  if (!left.previewText && right.previewText) {
    return 1;
  }

  return left.label.localeCompare(right.label);
}

function detectFigmaCheckReportFlavor(
  reportArtifact: ArtifactWithPresentation | null,
  summaryArtifact: ArtifactWithPresentation | null
) {
  if (reportArtifact?.previewKind === "json" || reportArtifact?.contentType?.includes("json")) {
    return {
      label: "structured JSON",
      description: "JSON の findings / issues / results などを元に抽出した監査指摘です。"
    };
  }

  const reportPreview = `${reportArtifact?.previewText ?? ""}\n${summaryArtifact?.previewText ?? ""}`;
  if (/^##\s/m.test(reportPreview) || /(Severity|Category|Recommendation|Description):/i.test(reportPreview)) {
    return {
      label: "structured markdown / summary text",
      description: "見出しや key-value 行を含むテキストから抽出した監査指摘です。"
    };
  }

  if (reportArtifact || summaryArtifact) {
    return {
      label: "free text fallback",
      description: "自由記述テキストから fallback で抽出した監査指摘です。"
    };
  }

  return {
    label: "unknown",
    description: "入力形式を判定できませんでした。"
  };
}

function buildArtifactsHref(
  currentPathname: string,
  step: ReviewStepName | "all",
  usage: ReviewArtifactUsage | "all"
) {
  const searchParams = new URLSearchParams();

  if (step !== "all") {
    searchParams.set("step", step);
  }

  if (usage !== "all") {
    searchParams.set("usage", usage);
  }

  const query = searchParams.toString();
  return query ? `${currentPathname}?${query}` : currentPathname;
}

function formatArtifactLabel(artifactType: ReviewDetailArtifactDto["artifactType"], fallbackLabel: string) {
  if (artifactType === "figma_make_request") {
    return "Figma Make リクエスト";
  }

  if (artifactType === "figma_make_response") {
    return "Figma Make 出力";
  }

  if (artifactType === "figma_make_summary") {
    return "Figma Make 要約";
  }

  if (artifactType === "figma_check_report") {
    return "Figma Check レポート";
  }

  if (artifactType === "figma_check_summary") {
    return "Figma Check 要約";
  }

  const labels: Partial<Record<ReviewDetailArtifactDto["artifactType"], string>> = {
    input_image: "入力画像",
    api_spec_file: "API 仕様ファイル",
    codeql_report_file: "CodeQL 取込レポート",
    figma_context_json: "Figma コンテキスト JSON",
    figma_context_summary: "Figma コンテキスト要約",
    input_payload: "入力ペイロード",
    knowledge_summary: "ナレッジ要約",
    request_json: "リクエスト JSON",
    response_json: "レスポンス JSON",
    semgrep_raw_json: "Semgrep 生レポート",
    zap_raw_json: "ZAP 生レポート",
    zap_html_report: "ZAP HTML レポート",
    codeql_sarif_report: "CodeQL SARIF レポート",
    codeql_json_report: "CodeQL JSON レポート",
    executive_summary: "総評テキスト",
    normalized_findings: "正規化済み指摘"
  };

  return labels[artifactType] ?? fallbackLabel;
}

function formatUsageLabel(usage: ReviewArtifactUsage) {
  return usageMeta[usage].label;
}

function formatPreviewLabel(previewKind: ArtifactWithPresentation["previewKind"]) {
  if (previewKind === "json") {
    return "JSON プレビュー";
  }

  if (previewKind === "text") {
    return "テキストプレビュー";
  }

  return "軽量プレビュー";
}

function formatStepName(stepName: ReviewStepName) {
  if (stepName === "figmaMake") {
    return "figmaMake";
  }

  if (stepName === "figmaCheckDesigns") {
    return "figmaCheckDesigns";
  }

  const labels: Record<ReviewStepName, string> = {
    ingest: "ingest",
    gemini: "gemini",
    gpt: "gpt",
    figma: "figma",
    figmaMake: "figmaMake",
    figmaCheckDesigns: "figmaCheckDesigns",
    semgrep: "semgrep",
    zap: "zap",
    codeql: "codeql",
    finalize: "finalize"
  };

  return labels[stepName];
}

function getFigmaCheckSeverityPillStyle(severity: ReviewDetailFindingDto["severity"]): CSSProperties {
  const tones: Record<ReviewDetailFindingDto["severity"], CSSProperties> = {
    high: {
      background: "rgba(255, 232, 232, 0.95)",
      border: "1px solid rgba(171, 47, 47, 0.22)",
      color: "#ab2f2f"
    },
    medium: {
      background: "rgba(255, 243, 214, 0.96)",
      border: "1px solid rgba(181, 132, 42, 0.24)",
      color: "#8a5d10"
    },
    low: {
      background: "rgba(223, 236, 255, 0.96)",
      border: "1px solid rgba(47, 111, 237, 0.22)",
      color: "#2f6fed"
    }
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.18rem 0.55rem",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: "0.78rem",
    ...tones[severity]
  };
}

function StatusBadge(props: { status: ReviewRunStatus | ReviewStepStatus }) {
  const tone = getStatusTone(props.status);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.45rem",
        padding: "0.3rem 0.72rem",
        borderRadius: 999,
        background: tone.background,
        color: tone.color,
        border: `1px solid ${tone.border}`,
        fontWeight: 700
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: tone.color
        }}
      />
      {formatStatusLabel(props.status)}
    </span>
  );
}

function formatStatusLabel(status: ReviewRunStatus | ReviewStepStatus) {
  const labels: Record<string, string> = {
    completed: "完了",
    partial_success: "一部成功",
    failed: "失敗",
    skipped: "スキップ",
    success: "成功",
    error: "エラー",
    warning: "注意",
    running: "実行中",
    pending: "待機中"
  };

  return labels[status] ?? status.replaceAll("_", " ");
}

function getStatusTone(status: ReviewRunStatus | ReviewStepStatus) {
  const tones: Record<string, { background: string; border: string; color: string }> = {
    completed: {
      background: "rgba(219, 242, 232, 0.92)",
      border: "rgba(44, 126, 88, 0.22)",
      color: "#1f6b48"
    },
    partial_success: {
      background: "rgba(255, 243, 214, 0.96)",
      border: "rgba(181, 132, 42, 0.24)",
      color: "#8a5d10"
    },
    failed: {
      background: "rgba(255, 232, 232, 0.95)",
      border: "rgba(171, 47, 47, 0.22)",
      color: "#ab2f2f"
    },
    skipped: {
      background: "rgba(239, 241, 245, 0.95)",
      border: "rgba(108, 122, 138, 0.22)",
      color: "#5f6a76"
    },
    success: {
      background: "rgba(219, 242, 232, 0.92)",
      border: "rgba(44, 126, 88, 0.22)",
      color: "#1f6b48"
    },
    running: {
      background: "rgba(223, 236, 255, 0.96)",
      border: "rgba(47, 111, 237, 0.22)",
      color: "#2f6fed"
    },
    pending: {
      background: "rgba(239, 241, 245, 0.95)",
      border: "rgba(108, 122, 138, 0.22)",
      color: "#5f6a76"
    }
  };

  return tones[status] ?? tones.pending;
}

function withAlpha(hexColor: string, alpha: number) {
  const sanitized = hexColor.replace("#", "");
  const red = Number.parseInt(sanitized.slice(0, 2), 16);
  const green = Number.parseInt(sanitized.slice(2, 4), 16);
  const blue = Number.parseInt(sanitized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

const figmaCheckAuditSectionStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
  padding: "1.15rem 1.2rem",
  borderRadius: 20,
  background: "linear-gradient(145deg, rgba(248, 251, 255, 0.98), rgba(240, 247, 255, 0.95))",
  border: "1px solid rgba(47, 111, 237, 0.16)"
};

const figmaCheckMetaGridStyle: CSSProperties = {
  display: "grid",
  gap: "0.85rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
};

const auditSummaryCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
  padding: "0.9rem 1rem",
  borderRadius: 16,
  border: "1px solid rgba(111, 138, 164, 0.12)",
  background: "rgba(255,255,255,0.96)"
};

const figmaCheckGridStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))"
};

const figmaCheckPanelStyle: CSSProperties = {
  display: "grid",
  gap: "0.85rem",
  padding: "1rem",
  borderRadius: 18,
  border: "1px solid rgba(111, 138, 164, 0.12)",
  background: "rgba(255,255,255,0.98)"
};

const figmaCheckPanelHeadingStyle: CSSProperties = {
  margin: 0,
  color: "#16212b",
  fontSize: "1rem"
};

const figmaCheckPanelHintStyle: CSSProperties = {
  margin: 0,
  color: "#617488",
  lineHeight: 1.6
};

const figmaCheckSourceCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.65rem",
  padding: "0.9rem 0.95rem",
  borderRadius: 16,
  border: "1px solid rgba(111, 138, 164, 0.12)",
  background: "rgba(247, 250, 254, 0.9)"
};

const figmaCheckSourceMetaStyle: CSSProperties = {
  color: "#4d78c9",
  fontWeight: 700,
  fontSize: "0.84rem"
};

const figmaCheckUsagePillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.2rem 0.55rem",
  borderRadius: 999,
  border: "1px solid rgba(47, 111, 237, 0.16)",
  background: "rgba(47, 111, 237, 0.1)",
  color: "#245dd1",
  fontWeight: 700,
  fontSize: "0.78rem"
};

const figmaCheckPathStyle: CSSProperties = {
  display: "block",
  color: "#70839a",
  fontSize: "0.84rem",
  wordBreak: "break-all"
};

const figmaCheckPreviewStyle: CSSProperties = {
  margin: 0,
  padding: "0.85rem 0.9rem",
  borderRadius: 14,
  background: "rgba(27, 35, 46, 0.04)",
  color: "#22303d",
  fontSize: "0.88rem",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: "Consolas, 'Courier New', monospace"
};

const figmaCheckSourceNoteStyle: CSSProperties = {
  margin: 0,
  color: "#70839a",
  fontSize: "0.84rem"
};

const figmaCheckFindingCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.55rem",
  padding: "0.9rem 0.95rem",
  borderRadius: 16,
  border: "1px solid rgba(111, 138, 164, 0.12)",
  background: "rgba(255,255,255,0.98)"
};

const figmaCheckCategoryPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.18rem 0.55rem",
  borderRadius: 999,
  background: "rgba(22, 151, 166, 0.1)",
  border: "1px solid rgba(22, 151, 166, 0.16)",
  color: "#0d7682",
  fontWeight: 700,
  fontSize: "0.78rem"
};

const figmaCheckLabelStyle: CSSProperties = {
  color: "#70839a",
  fontSize: "0.8rem",
  fontWeight: 700,
  letterSpacing: "0.03em"
};

const figmaCheckBodyStyle: CSSProperties = {
  margin: 0,
  color: "#22303d",
  lineHeight: 1.6
};

const emptyAuditBoxStyle: CSSProperties = {
  padding: "0.85rem 0.9rem",
  borderRadius: 14,
  background: "rgba(247, 250, 254, 0.84)",
  border: "1px dashed rgba(111, 138, 164, 0.22)",
  color: "#617488",
  lineHeight: 1.6
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: "#4d78c9",
  fontSize: "0.84rem",
  letterSpacing: "0.14em",
  fontWeight: 700,
  textTransform: "uppercase"
};

const idMetaStyle: CSSProperties = {
  margin: 0,
  color: "#70839a",
  fontFamily: "Consolas, monospace"
};

const smallLabelStyle: CSSProperties = {
  margin: 0,
  color: "#70839a",
  fontSize: "0.82rem",
  fontWeight: 700,
  letterSpacing: "0.04em"
};

const archivedPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.28rem 0.7rem",
  borderRadius: 999,
  background: "rgba(239, 241, 245, 0.95)",
  border: "1px solid rgba(108, 122, 138, 0.22)",
  color: "#5f6a76",
  fontWeight: 700
};

const secondaryLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.68rem 0.95rem",
  borderRadius: 12,
  border: "1px solid rgba(111, 138, 164, 0.16)",
  background: "#fff",
  color: "#233242",
  fontWeight: 700,
  textDecoration: "none"
};

const primaryButtonStyle: CSSProperties = {
  minHeight: 42,
  padding: "0.7rem 1rem",
  borderRadius: 12,
  border: "1px solid rgba(47, 111, 237, 0.18)",
  background: "#2f6fed",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer"
};

const developerBannerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
  alignItems: "center",
  padding: "1rem 1.1rem",
  borderRadius: 18,
  background: "rgba(240, 247, 255, 0.95)",
  border: "1px solid rgba(47, 111, 237, 0.16)"
};

const focusStripStyle: CSSProperties = {
  display: "grid",
  gap: "0.85rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))"
};

const focusCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem",
  padding: "0.95rem 1rem",
  borderRadius: 16,
  background: "rgba(255,255,255,0.98)",
  border: "1px solid rgba(111, 138, 164, 0.12)",
  boxShadow: "0 10px 22px rgba(27, 55, 89, 0.04)",
  textDecoration: "none"
};

const filterToolbarStyle: CSSProperties = {
  display: "flex",
  gap: "0.85rem",
  flexWrap: "wrap",
  alignItems: "end",
  padding: "0.95rem",
  borderRadius: 18,
  background: "rgba(246, 249, 253, 0.94)",
  border: "1px solid rgba(111, 138, 164, 0.12)"
};

const selectStyle: CSSProperties = {
  minHeight: 42,
  padding: "0.55rem 0.8rem",
  borderRadius: 12,
  border: "1px solid rgba(111, 138, 164, 0.16)",
  background: "#fff",
  color: "#233242"
};

const activeFilterPanelStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "0.85rem",
  flexWrap: "wrap",
  alignItems: "center",
  padding: "0.9rem 1rem",
  borderRadius: 18,
  background: "rgba(255,255,255,0.98)",
  border: "1px solid rgba(111, 138, 164, 0.12)"
};

const activeFilterPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.28rem 0.7rem",
  borderRadius: 999,
  background: "rgba(47, 111, 237, 0.12)",
  border: "1px solid rgba(47, 111, 237, 0.16)",
  color: "#1f57c3",
  fontWeight: 700
};

const inactiveFilterHintStyle: CSSProperties = {
  color: "#70839a",
  fontSize: "0.9rem"
};

const artifactGroupStyle: CSSProperties = {
  padding: "1.05rem 1.1rem",
  borderRadius: 20,
  background: "rgba(255,255,255,0.98)",
  border: "1px solid rgba(111, 138, 164, 0.12)",
  boxShadow: "0 12px 24px rgba(27, 55, 89, 0.04)"
};

const artifactCardStyle: CSSProperties = {
  padding: "0.95rem 1rem",
  borderRadius: 14,
  border: "1px solid rgba(61, 44, 28, 0.08)"
};

const usagePillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.22rem 0.55rem",
  borderRadius: 999,
  fontWeight: 700
};

const copyButtonStyle: CSSProperties = {
  minHeight: 42,
  padding: "0.7rem 1rem",
  borderRadius: 12,
  border: "1px solid rgba(47, 111, 237, 0.16)",
  background: "rgba(240, 247, 255, 0.95)",
  color: "#2556bc",
  fontWeight: 700,
  cursor: "pointer"
};

const previewNoteStyle: CSSProperties = {
  color: "#70839a",
  fontSize: "0.84rem"
};

const emptyStateStyle: CSSProperties = {
  padding: "1.15rem 1.2rem",
  borderRadius: 18,
  background: "rgba(255,255,255,0.98)",
  border: "1px solid rgba(111, 138, 164, 0.12)"
};
