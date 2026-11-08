"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { ReviewDetailDto, ReviewDetailFindingDto, ReviewDetailStepDto } from "@/lib/contracts/review-detail";
import type { ReviewFindingSeverity, ReviewRunStatus, ReviewStepStatus } from "@/lib/core/review-types";
import { REVIEW_FINDING_SEVERITIES } from "@/lib/core/review-types";

const severityOrder: ReviewFindingSeverity[] = REVIEW_FINDING_SEVERITIES;
const severityRank: Record<ReviewFindingSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2
};

export function ReviewRunDetail(props: { detail: ReviewDetailDto; artifactsHref: string }) {
  const { detail, artifactsHref } = props;
  const router = useRouter();
  const [sourceToolFilter, setSourceToolFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<ReviewFindingSeverity | "all">("all");
  const [archivePending, setArchivePending] = useState(false);
  const imageInput = detail.run.inputs.find((input) => input.inputType === "image");
  const textInput = detail.run.inputs.find((input) => input.inputType === "text");
  const figmaStep = detail.steps.find((step) => step.stepName === "figma");
  const figmaStepHint = figmaStep ? getFigmaStepHint(figmaStep) : null;
  const sourceToolOptions = useMemo(
    () => Array.from(new Set(detail.findings.map((finding) => finding.sourceTool))).sort(),
    [detail.findings]
  );

  const filteredFindings = useMemo(() => {
    return detail.findings.filter((finding) => {
      const matchesSource = sourceToolFilter === "all" || finding.sourceTool === sourceToolFilter;
      const matchesSeverity = severityFilter === "all" || finding.severity === severityFilter;
      return matchesSource && matchesSeverity;
    });
  }, [detail.findings, severityFilter, sourceToolFilter]);

  const filteredFindingsBySeverity = useMemo(() => {
    return {
      high: filteredFindings.filter((finding) => finding.severity === "high"),
      medium: filteredFindings.filter((finding) => finding.severity === "medium"),
      low: filteredFindings.filter((finding) => finding.severity === "low")
    };
  }, [filteredFindings]);

  const highlightedFindings = useMemo(() => {
    return [...filteredFindings]
      .sort((left, right) => {
        const severityDelta = severityRank[left.severity] - severityRank[right.severity];
        if (severityDelta !== 0) {
          return severityDelta;
        }
        return left.title.localeCompare(right.title);
      })
      .slice(0, 3);
  }, [filteredFindings]);

  async function onToggleArchive() {
    setArchivePending(true);

    try {
      const response = await fetch(`/api/reviews/${detail.run.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ archived: !detail.run.archived })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "アーカイブ状態の更新に失敗しました。");
      }

      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "アーカイブ状態の更新に失敗しました。");
    } finally {
      setArchivePending(false);
    }
  }

  return (
    <section className="panel" style={{ padding: "2.2rem", display: "grid", gap: "1.7rem" }}>
      <header style={{ display: "grid", gap: "1.1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "0.4rem" }}>
            <p style={eyebrowStyle}>レビュー詳細</p>
            <h1 style={{ margin: 0, fontSize: "clamp(1.9rem, 3.6vw, 3rem)", color: "#16212b" }}>
              {detail.run.title ?? detail.run.id}
            </h1>
            {detail.run.title ? <p style={idMetaStyle}>実行ID: {detail.run.id}</p> : null}
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              <StatusBadge kind="run" status={detail.run.status} />
              {detail.run.archived ? <span style={archivedPillStyle}>アーカイブ済み</span> : null}
              {detail.latestStepStatus ? (
                <span style={{ color: "#6b5a47" }}>
                  最新ステップ <strong>{detail.latestStepStatus.stepName}</strong>
                </span>
              ) : null}
            </div>
          </div>
          <div style={{ alignSelf: "start" }}>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
              <Link href="/">ホームへ戻る</Link>
              <Link href={artifactsHref} style={developerLinkStyle}>
                開発者向け成果物を見る
              </Link>
              <button onClick={onToggleArchive} style={archiveButtonStyle} type="button" disabled={archivePending}>
                {archivePending ? "更新中..." : detail.run.archived ? "アーカイブを解除" : "アーカイブする"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <MetricCard label="ステータス" value={formatStatusLabel(detail.run.status)} />
          <MetricCard
            label="最新ステップのステータス"
            value={detail.latestStepStatus ? formatStatusLabel(detail.latestStepStatus.status) : "保留"}
            supportingText={detail.latestStepStatus?.summaryText ?? "まだステップの実行はありません。"}
          />
          <MetricCard
            label="表示中の指摘"
            value={String(filteredFindings.length)}
            supportingText={`高 ${filteredFindingsBySeverity.high.length} 件 / 中 ${filteredFindingsBySeverity.medium.length} 件 / 低 ${filteredFindingsBySeverity.low.length} 件`}
          />
          <MetricCard
            label="保存済み成果物"
            value={String(detail.artifacts.length)}
            supportingText="一覧は開発者向け成果物画面で確認できます。"
          />
        </div>
      </header>

      <article style={overviewCardStyle}>
        <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "minmax(0, 1.6fr) minmax(280px, 1fr)" }}>
          <div style={{ display: "grid", gap: "0.9rem" }}>
            <div>
              <p style={eyebrowStyle}>概要</p>
              <h2 style={{ margin: "0.35rem 0 0", fontSize: "1.55rem" }}>総評</h2>
            </div>
            <div style={metadataOverviewStyle}>
              <p style={smallLabelStyle}>実行情報</p>
              <div style={metadataOverviewGridStyle}>
                <MetadataItem label={detail.run.title ? "タイトル" : "実行ID"} value={detail.run.title ?? detail.run.id} />
                {detail.run.title ? <MetadataItem label="実行ID" value={detail.run.id} mono /> : null}
                <MetadataItem label="アーカイブ状態" value={detail.run.archived ? "アーカイブ済み" : "有効"} />
                {detail.run.tags.length > 0 ? (
                  <div style={{ display: "grid", gap: "0.38rem", gridColumn: "1 / -1" }}>
                    <p style={smallLabelStyle}>タグ</p>
                    <div style={tagWrapStyle}>
                      {detail.run.tags.map((tag) => (
                        <span key={tag} style={tagPillStyle}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {detail.run.memo ? (
                  <div style={{ display: "grid", gap: "0.38rem", gridColumn: "1 / -1" }}>
                    <p style={smallLabelStyle}>メモ</p>
                    <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.65, color: "#4f4032" }}>
                      {detail.run.memo}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
            <p style={{ margin: 0, fontSize: "1.05rem", lineHeight: 1.78, color: "#233242" }}>{detail.displaySummary}</p>
            {detail.executiveSummary && detail.executiveSummary !== detail.displaySummary ? (
              <div style={subtlePanelStyle}>
                <p style={smallLabelStyle}>要約</p>
                <p style={{ margin: "0.4rem 0 0", lineHeight: 1.65 }}>{detail.executiveSummary}</p>
              </div>
            ) : null}
          </div>

          <div style={{ display: "grid", gap: "0.8rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
              <div>
                <p style={eyebrowStyle}>主な指摘</p>
                <h3 style={{ margin: "0.35rem 0 0" }}>先に確認したい項目</h3>
              </div>
              <span style={{ color: "#6b5a47", alignSelf: "end" }}>{highlightedFindings.length} 件表示</span>
            </div>
            {highlightedFindings.length === 0 ? (
              <div style={subtlePanelStyle}>
                <p style={{ margin: 0, color: "#6b5a47" }}>現在の条件に一致する指摘はありません。</p>
              </div>
            ) : (
              highlightedFindings.map((finding) => <KeyFindingRow key={finding.id} finding={finding} />)
            )}
          </div>
        </div>
      </article>

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <article style={sectionCardStyle}>
          <h2 style={sectionTitleStyle}>入力</h2>
          <div style={{ display: "grid", gap: "0.8rem" }}>
            <InfoRow label="画像" value={imageInput?.fileName ?? "なし"} />
            <InfoRow label="作成日時" value={formatTimestamp(detail.run.createdAt)} />
          </div>
          <div style={{ marginTop: "1rem" }}>
            <p style={smallLabelStyle}>説明テキスト</p>
            <p style={{ margin: "0.45rem 0 0", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
              {textInput?.textContent ?? "なし"}
            </p>
          </div>
        </article>

        <article style={sectionCardStyle}>
          <h2 style={sectionTitleStyle}>コンテキスト</h2>
          <div style={{ display: "grid", gap: "0.8rem" }}>
            <InfoRow label="最新ステップ" value={detail.latestStepStatus?.stepName ?? "なし"} />
            <InfoRow label="Figma ステップ" value={figmaStep?.status ? formatStatusLabel(figmaStep.status) : "未実行"} />
            {figmaStepHint ? <InfoRow label="Figma 判定" value={figmaStepHint.label} /> : null}
            {figmaStep?.summaryText ? <InfoRow label="Figma 要約" value={figmaStep.summaryText} /> : null}
            {detail.latestStepStatus?.errorMessage ? (
              <InfoRow label="最新エラー" value={detail.latestStepStatus.errorMessage} />
            ) : null}
          </div>
          <div style={{ marginTop: "1rem" }}>
            <div style={developerNoteStyle}>
              <div style={{ display: "grid", gap: "0.35rem" }}>
                <p style={smallLabelStyle}>開発者向け成果物</p>
                <p style={{ margin: 0, color: "#5f7288", lineHeight: 1.6 }}>
                  request / response / report / knowledge などの保存ファイルは専用画面に分離しています。
                </p>
              </div>
              <Link href={artifactsHref} style={developerActionButtonStyle}>
                開発者向け成果物を見る
              </Link>
            </div>
          </div>
        </article>
      </div>

      <article style={sectionCardStyle}>
        <h2 style={sectionTitleStyle}>ステップ状況</h2>
        <div style={{ display: "grid", gap: "0.85rem" }}>
          {detail.steps.map((step) => (
            <StepCard key={step.id} step={step} />
          ))}
        </div>
      </article>

      <article style={sectionCardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ ...sectionTitleStyle, marginBottom: "0.35rem" }}>指摘</h2>
            <p style={{ margin: 0, color: "#6b5a47" }}>ツールと重要度で絞り込めます。</p>
          </div>
          <span style={{ color: "#6b5a47", alignSelf: "center" }}>{filteredFindings.length} 件表示中</span>
        </div>

        <div style={filterToolbarStyle}>
          <FilterControl
            label="ツール"
            value={sourceToolFilter}
            onChange={setSourceToolFilter}
            options={[
              { label: "すべてのツール", value: "all" },
              ...sourceToolOptions.map((sourceTool) => ({
                label: formatFindingSourceLabel(sourceTool),
                value: sourceTool
              }))
            ]}
          />
          <FilterControl
            label="重要度"
            value={severityFilter}
            onChange={(value) => setSeverityFilter(value as ReviewFindingSeverity | "all")}
            options={[
              { label: "すべての重要度", value: "all" },
              ...severityOrder.map((severity) => ({ label: formatSeverityLabel(severity), value: severity }))
            ]}
          />
          <button
            type="button"
            onClick={() => {
              setSourceToolFilter("all");
              setSeverityFilter("all");
            }}
            style={secondaryButtonStyle}
          >
            フィルタをリセット
          </button>
        </div>

        <div style={{ display: "grid", gap: "1rem" }}>
          {filteredFindings.length === 0 ? <p style={{ margin: 0 }}>現在の条件に一致する指摘はありません。</p> : null}
          {severityOrder.map((severity) =>
            filteredFindingsBySeverity[severity].length > 0 ? (
              <section key={severity} style={{ display: "grid", gap: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                  <SeverityBadge severity={severity} />
                  <span style={{ color: "#6b5a47" }}>{filteredFindingsBySeverity[severity].length} 件</span>
                </div>
                <div style={{ display: "grid", gap: "0.75rem" }}>
                  {filteredFindingsBySeverity[severity].map((finding) => (
                    <FindingCard key={finding.id} finding={finding} />
                  ))}
                </div>
              </section>
            ) : null
          )}
        </div>
      </article>
    </section>
  );
}

function MetricCard(props: { label: string; value: string; supportingText?: string }) {
  return (
    <article style={metricCardStyle}>
      <p style={smallLabelStyle}>{props.label}</p>
      <p style={{ margin: "0.35rem 0 0", fontSize: "1.35rem", fontWeight: 700 }}>{props.value}</p>
      {props.supportingText ? (
        <p style={{ margin: "0.4rem 0 0", color: "#6f8297", lineHeight: 1.55 }}>{props.supportingText}</p>
      ) : null}
    </article>
  );
}

function MetadataItem(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "grid", gap: "0.35rem" }}>
      <p style={smallLabelStyle}>{props.label}</p>
      <p
        style={{
          margin: 0,
          color: "#203040",
          lineHeight: 1.55,
          wordBreak: "break-word",
          fontFamily: props.mono ? "Consolas, monospace" : undefined
        }}
      >
        {props.value}
      </p>
    </div>
  );
}

function FilterControl(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <label style={{ display: "grid", gap: "0.35rem", minWidth: 200 }}>
      <span style={smallLabelStyle}>{props.label}</span>
      <select value={props.value} onChange={(event) => props.onChange(event.target.value)} style={selectStyle}>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StepCard({ step }: { step: ReviewDetailStepDto }) {
  const tone = getStatusTone(step.status);
  const figmaHint = step.stepName === "figma" ? getFigmaStepHint(step) : null;

  return (
    <div
      style={{
        padding: "1rem",
        borderRadius: 18,
        background: tone.panelBackground,
        border: `1px solid ${tone.border}`
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <strong>{step.stepName}</strong>
          <StatusBadge kind="step" status={step.status} />
        </div>
        <span style={{ color: "#6b5a47" }}>{formatStepTiming(step.startedAt, step.finishedAt)}</span>
      </div>
      {figmaHint ? <FigmaHintBanner hint={figmaHint} /> : null}
      {step.summaryText ? <p style={{ marginBottom: 0, lineHeight: 1.6 }}>{step.summaryText}</p> : null}
      {step.skippedReason ? (
        <p style={{ marginBottom: 0, color: "#7b5f2a" }}>
          <strong>スキップ理由:</strong> {step.skippedReason}
        </p>
      ) : null}
      {step.errorMessage ? (
        <p style={{ marginBottom: 0, color: "#ab2f2f" }}>
          <strong>エラー:</strong> {step.errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function FindingCard({ finding }: { finding: ReviewDetailFindingDto }) {
  return (
    <div
      style={{
        padding: "1rem",
        borderRadius: 16,
        background: "rgba(246, 239, 226, 0.72)",
        border: "1px solid rgba(61, 44, 28, 0.08)"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <strong>{finding.title}</strong>
          <ToolPill sourceTool={finding.sourceTool} />
        </div>
        {typeof finding.confidence === "number" ? (
          <span style={{ color: "#6b5a47" }}>信頼度 {Math.round(finding.confidence * 100)}%</span>
        ) : null}
      </div>
      {finding.description ? <p style={{ lineHeight: 1.6 }}>{finding.description}</p> : null}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <p style={{ margin: 0, color: "#6b5a47" }}>カテゴリ: {finding.category}</p>
        {finding.targetRef ? <code style={inlineCodeStyle}>{finding.targetRef}</code> : null}
      </div>
      <p style={{ margin: "0.6rem 0 0", lineHeight: 1.6 }}>
        <strong>改善案:</strong> {finding.suggestion}
      </p>
    </div>
  );
}

function KeyFindingRow({ finding }: { finding: ReviewDetailFindingDto }) {
  return (
    <div style={subtlePanelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" }}>
          <SeverityBadge severity={finding.severity} />
          <ToolPill sourceTool={finding.sourceTool} />
        </div>
        {finding.targetRef ? <code style={inlineCodeStyle}>{finding.targetRef}</code> : null}
      </div>
      <p style={{ margin: "0.55rem 0 0", fontWeight: 700 }}>{finding.title}</p>
      <p style={{ margin: "0.35rem 0 0", lineHeight: 1.55, color: "#5f4c3c" }}>{finding.suggestion}</p>
    </div>
  );
}

function FigmaHintBanner(props: { hint: FigmaStepHint }) {
  return (
    <div
      style={{
        marginTop: "0.8rem",
        padding: "0.75rem 0.9rem",
        borderRadius: 14,
        border: `1px solid ${props.hint.tone.border}`,
        background: props.hint.tone.background,
        color: props.hint.tone.text
      }}
    >
      <p style={{ margin: 0, fontWeight: 700 }}>{props.hint.label}</p>
      {props.hint.supportingText ? (
        <p style={{ margin: "0.35rem 0 0", lineHeight: 1.55 }}>{props.hint.supportingText}</p>
      ) : null}
    </div>
  );
}

function InfoRow(props: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p style={smallLabelStyle}>{props.label}</p>
      <p
        style={{
          margin: "0.35rem 0 0",
          lineHeight: 1.55,
          wordBreak: "break-all",
          fontFamily: props.mono ? "Consolas, monospace" : undefined
        }}
      >
        {props.value}
      </p>
    </div>
  );
}

type FigmaStepHint = {
  label: string;
  supportingText: string | null;
  tone: {
    background: string;
    border: string;
    text: string;
  };
};

function getFigmaStepHint(step: ReviewDetailStepDto): FigmaStepHint | null {
  if (step.status === "skipped") {
    const reason = step.skippedReason?.toLowerCase() ?? "";

    if (
      reason.includes("url was not provided") ||
      (step.skippedReason ?? "").includes("Figma URL が指定されていません")
    ) {
      return {
        label: "URL未指定",
        supportingText: "Figma URL が未指定のため、この実行では read-only 取得を行っていません。",
        tone: {
          background: "rgba(255, 245, 214, 0.92)",
          border: "rgba(166, 122, 41, 0.28)",
          text: "#7b5f2a"
        }
      };
    }

    return {
      label: "Figma 取得は未実行",
      supportingText: step.skippedReason ?? null,
      tone: {
        background: "rgba(255, 245, 214, 0.92)",
        border: "rgba(166, 122, 41, 0.28)",
        text: "#7b5f2a"
      }
    };
  }

  if (step.status !== "failed" || !step.errorMessage) {
    return null;
  }

  const error = step.errorMessage.toLowerCase();

  if (error.includes("403 forbidden") || error.includes("invalid token")) {
    return {
      label: "認証エラー",
      supportingText: "トークン不正、scope 不足、または認証まわりの失敗を疑ってください。",
      tone: {
        background: "rgba(255, 232, 232, 0.92)",
        border: "rgba(171, 47, 47, 0.22)",
        text: "#ab2f2f"
      }
    };
  }

  if (error.includes("404 not found") || error.includes("not found")) {
    return {
      label: "アクセス不可または参照不可ファイル",
      supportingText: "file 権限不足、削除、移動、または URL 不整合の可能性があります。",
      tone: {
        background: "rgba(255, 239, 225, 0.92)",
        border: "rgba(184, 94, 39, 0.24)",
        text: "#9a4d1c"
      }
    };
  }

  return {
    label: "Figma 取得エラー",
    supportingText: "詳細は raw error と artifacts を確認してください。",
    tone: {
      background: "rgba(255, 232, 232, 0.92)",
      border: "rgba(171, 47, 47, 0.22)",
      text: "#ab2f2f"
    }
  };
}

function StatusBadge(props: { kind: "run" | "step"; status: ReviewRunStatus | ReviewStepStatus }) {
  const tone = getStatusTone(props.status);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.45rem",
        padding: "0.32rem 0.76rem",
        borderRadius: 999,
        background: tone.background,
        color: tone.color,
        border: `1px solid ${tone.border}`,
        fontWeight: 700,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.55)"
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

function SeverityBadge(props: { severity: ReviewFindingSeverity }) {
  const tone = severityTone[props.severity];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.45rem",
        padding: "0.28rem 0.7rem",
        borderRadius: 999,
        background: tone.background,
        color: tone.color,
        border: `1px solid ${tone.border}`,
        fontWeight: 700
      }}
    >
      {formatSeverityLabel(props.severity)}
    </span>
  );
}

function ToolPill(props: { sourceTool: string }) {
  return <span style={getToolPillStyle(props.sourceTool)}>{formatFindingSourceLabel(props.sourceTool)}</span>;
}

function formatFindingSourceLabel(sourceTool: string) {
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

  return labels[sourceTool] ?? sourceTool;
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
    pending: "保留"
  };

  return labels[status] ?? status.replaceAll("_", " ");
}

function formatSeverityLabel(severity: ReviewFindingSeverity) {
  const labels: Record<ReviewFindingSeverity, string> = {
    high: "高",
    medium: "中",
    low: "低"
  };

  return labels[severity];
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "なし";
  }

  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatStepTiming(startedAt: string | null, finishedAt: string | null) {
  if (startedAt && finishedAt) {
    return `${formatTimestamp(startedAt)} -> ${formatTimestamp(finishedAt)}`;
  }

  if (startedAt) {
    return `開始: ${formatTimestamp(startedAt)}`;
  }

  if (finishedAt) {
    return `完了: ${formatTimestamp(finishedAt)}`;
  }

  return "未実行";
}

function getStatusTone(status: ReviewRunStatus | ReviewStepStatus) {
  const tones: Record<
    string,
    { background: string; border: string; color: string; panelBackground: string }
  > = {
    completed: {
      background: "rgba(219, 242, 232, 0.92)",
      border: "rgba(44, 126, 88, 0.22)",
      color: "#1f6b48",
      panelBackground: "rgba(243, 252, 247, 0.98)"
    },
    partial_success: {
      background: "rgba(255, 243, 214, 0.96)",
      border: "rgba(181, 132, 42, 0.24)",
      color: "#8a5d10",
      panelBackground: "rgba(255, 250, 239, 0.98)"
    },
    failed: {
      background: "rgba(255, 232, 232, 0.95)",
      border: "rgba(171, 47, 47, 0.22)",
      color: "#ab2f2f",
      panelBackground: "rgba(255, 246, 246, 0.98)"
    },
    skipped: {
      background: "rgba(239, 241, 245, 0.95)",
      border: "rgba(108, 122, 138, 0.22)",
      color: "#5f6a76",
      panelBackground: "rgba(249, 250, 252, 0.98)"
    },
    success: {
      background: "rgba(219, 242, 232, 0.92)",
      border: "rgba(44, 126, 88, 0.22)",
      color: "#1f6b48",
      panelBackground: "rgba(243, 252, 247, 0.98)"
    },
    running: {
      background: "rgba(223, 236, 255, 0.96)",
      border: "rgba(47, 111, 237, 0.22)",
      color: "#2f6fed",
      panelBackground: "rgba(246, 249, 255, 0.98)"
    },
    pending: {
      background: "rgba(239, 241, 245, 0.95)",
      border: "rgba(108, 122, 138, 0.22)",
      color: "#5f6a76",
      panelBackground: "rgba(249, 250, 252, 0.98)"
    }
  };

  return tones[status] ?? tones.pending;
}

const severityTone: Record<ReviewFindingSeverity, { background: string; border: string; color: string }> = {
  high: {
    background: "rgba(255, 232, 232, 0.95)",
    border: "rgba(171, 47, 47, 0.22)",
    color: "#ab2f2f"
  },
  medium: {
    background: "rgba(255, 243, 214, 0.96)",
    border: "rgba(181, 132, 42, 0.24)",
    color: "#8a5d10"
  },
  low: {
    background: "rgba(223, 236, 255, 0.96)",
    border: "rgba(47, 111, 237, 0.22)",
    color: "#2f6fed"
  }
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

const overviewCardStyle: CSSProperties = {
  padding: "1.5rem",
  borderRadius: 24,
  border: "1px solid rgba(111, 138, 164, 0.12)",
  background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(247,250,253,0.98))",
  boxShadow: "0 14px 28px rgba(27, 55, 89, 0.05)"
};

const sectionCardStyle: CSSProperties = {
  padding: "1.35rem",
  borderRadius: 22,
  background: "rgba(255,255,255,0.98)",
  border: "1px solid rgba(111, 138, 164, 0.12)",
  boxShadow: "0 12px 24px rgba(27, 55, 89, 0.04)"
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.2rem",
  color: "#16212b"
};

const metadataOverviewStyle: CSSProperties = {
  padding: "1rem",
  borderRadius: 18,
  background: "rgba(246, 249, 253, 0.94)",
  border: "1px solid rgba(111, 138, 164, 0.12)"
};

const metadataOverviewGridStyle: CSSProperties = {
  display: "grid",
  gap: "0.9rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))"
};

const subtlePanelStyle: CSSProperties = {
  padding: "0.95rem 1rem",
  borderRadius: 16,
  background: "rgba(247, 250, 253, 0.95)",
  border: "1px solid rgba(111, 138, 164, 0.12)"
};

const smallLabelStyle: CSSProperties = {
  margin: 0,
  color: "#70839a",
  fontSize: "0.82rem",
  fontWeight: 700,
  letterSpacing: "0.04em"
};

const tagWrapStyle: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  flexWrap: "wrap"
};

const tagPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.28rem 0.7rem",
  borderRadius: 999,
  background: "rgba(47, 111, 237, 0.1)",
  border: "1px solid rgba(47, 111, 237, 0.18)",
  color: "#2556bc",
  fontWeight: 700
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

const inlineCodeStyle: CSSProperties = {
  display: "inline-block",
  padding: "0.22rem 0.48rem",
  borderRadius: 10,
  background: "rgba(30, 41, 57, 0.06)",
  fontFamily: "Consolas, monospace"
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

const secondaryButtonStyle: CSSProperties = {
  minHeight: 42,
  padding: "0.7rem 1rem",
  borderRadius: 12,
  border: "1px solid rgba(111, 138, 164, 0.16)",
  background: "#fff",
  color: "#233242",
  fontWeight: 700,
  cursor: "pointer"
};

const archiveButtonStyle: CSSProperties = {
  ...secondaryButtonStyle,
  background: "rgba(246, 249, 253, 0.95)"
};

function getToolPillStyle(sourceTool: string): CSSProperties {
  if (sourceTool === "figma_make") {
    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "0.24rem 0.6rem",
      borderRadius: 999,
      fontWeight: 700,
      background: "rgba(95, 96, 190, 0.12)",
      border: "1px solid rgba(95, 96, 190, 0.2)",
      color: "#4b4db0"
    };
  }

  if (sourceTool === "figma_check") {
    return {
      display: "inline-flex",
      alignItems: "center",
      padding: "0.24rem 0.6rem",
      borderRadius: 999,
      fontWeight: 700,
      background: "rgba(36, 140, 124, 0.12)",
      border: "1px solid rgba(36, 140, 124, 0.2)",
      color: "#1f7367"
    };
  }

  const toneByTool: Record<string, CSSProperties> = {
    gemini: {
      background: "rgba(47, 111, 237, 0.1)",
      border: "1px solid rgba(47, 111, 237, 0.18)",
      color: "#245dd1"
    },
    gpt: {
      background: "rgba(22, 151, 166, 0.12)",
      border: "1px solid rgba(22, 151, 166, 0.2)",
      color: "#156d78"
    },
    figma: {
      background: "rgba(214, 146, 54, 0.14)",
      border: "1px solid rgba(214, 146, 54, 0.24)",
      color: "#9b5f10"
    },
    semgrep: {
      background: "rgba(123, 142, 162, 0.12)",
      border: "1px solid rgba(123, 142, 162, 0.2)",
      color: "#5d6c7c"
    },
    zap: {
      background: "rgba(123, 142, 162, 0.12)",
      border: "1px solid rgba(123, 142, 162, 0.2)",
      color: "#5d6c7c"
    },
    codeql: {
      background: "rgba(123, 142, 162, 0.12)",
      border: "1px solid rgba(123, 142, 162, 0.2)",
      color: "#5d6c7c"
    }
  };

  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.24rem 0.6rem",
    borderRadius: 999,
    fontWeight: 700,
    ...(toneByTool[sourceTool] ?? toneByTool.semgrep)
  };
}

const metricCardStyle: CSSProperties = {
  padding: "1rem",
  borderRadius: 18,
  border: "1px solid rgba(111, 138, 164, 0.12)",
  background: "rgba(255, 255, 255, 0.98)",
  boxShadow: "0 12px 24px rgba(27, 55, 89, 0.04)"
};

const developerNoteStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "0.9rem",
  alignItems: "center",
  flexWrap: "wrap",
  padding: "0.95rem 1rem",
  borderRadius: 16,
  background: "rgba(240, 247, 255, 0.95)",
  border: "1px solid rgba(47, 111, 237, 0.16)"
};

const developerLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.66rem 0.95rem",
  borderRadius: 12,
  background: "rgba(240, 247, 255, 0.95)",
  border: "1px solid rgba(47, 111, 237, 0.16)",
  color: "#2556bc",
  fontWeight: 700,
  textDecoration: "none"
};

const developerActionButtonStyle: CSSProperties = {
  ...developerLinkStyle
};
