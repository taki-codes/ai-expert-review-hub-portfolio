"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { ReviewCompareDto, ReviewCompareItemDto } from "@/lib/contracts/review-compare";
import type { ReviewRunStatus, ReviewStepStatus } from "@/lib/core/review-types";

export type ReviewRunCompareFindingDeltaRow = {
  label: string;
  leftCount: number;
  rightCount: number;
  delta: number;
};

export type ReviewRunCompareFindingDeltaGroup = {
  title: string;
  marker: string;
  rows: ReviewRunCompareFindingDeltaRow[];
};

export type ReviewRunCompareKeyDifference = {
  text: string;
};

export type ReviewRunCompareIntegratedLine = {
  label: string;
  text: string;
};

export type ReviewRunCompareAuditDelta = {
  findingCountDelta: ReviewRunCompareFindingDeltaRow;
  severityRows: ReviewRunCompareFindingDeltaRow[];
  categoryRows: ReviewRunCompareFindingDeltaRow[];
};

export type ReviewRunCompareProposalDelta = {
  findingCountDelta: ReviewRunCompareFindingDeltaRow;
  themeRows: ReviewRunCompareFindingDeltaRow[];
};

export function ReviewRunCompare(props: {
  compare: ReviewCompareDto;
  findingDeltaGroups: ReviewRunCompareFindingDeltaGroup[];
  figmaCheckDelta?: ReviewRunCompareAuditDelta | null;
  figmaMakeDelta?: ReviewRunCompareProposalDelta | null;
  keyDifferences: ReviewRunCompareKeyDifference[];
  integratedSummary: ReviewRunCompareIntegratedLine[];
  backToListHref: string;
}) {
  const left = props.compare.left;
  const right = props.compare.right;
  const commonTags = left.tags.filter((tag) => right.tags.includes(tag));
  const leftOnlyTags = left.tags.filter((tag) => !right.tags.includes(tag));
  const rightOnlyTags = right.tags.filter((tag) => !left.tags.includes(tag));
  const statusChanged = left.status !== right.status;
  const findingDelta = left.findingCount - right.findingCount;
  const latestStepSummaryChanged =
    normalizeText(left.latestStepStatus?.summaryText) !== normalizeText(right.latestStepStatus?.summaryText);
  const executiveSummaryChanged = normalizeText(resolveSummary(left)) !== normalizeText(resolveSummary(right));
  const memoChanged = normalizeText(left.memo) !== normalizeText(right.memo);
  const figmaCheckSeverityChanged = (props.figmaCheckDelta?.severityRows ?? []).some((row) => row.delta !== 0);
  const figmaCheckCategoryChanged = (props.figmaCheckDelta?.categoryRows ?? []).some((row) => row.delta !== 0);
  const hasFigmaCheckDiff =
    (props.figmaCheckDelta?.findingCountDelta.delta ?? 0) !== 0 || figmaCheckSeverityChanged || figmaCheckCategoryChanged;
  const figmaMakeThemeChanged = (props.figmaMakeDelta?.themeRows ?? []).some((row) => row.delta !== 0);
  const hasFigmaMakeDiff = (props.figmaMakeDelta?.findingCountDelta.delta ?? 0) !== 0 || figmaMakeThemeChanged;

  return (
    <section className="panel" style={{ padding: "2.2rem", display: "grid", gap: "1.7rem" }}>
      <header style={{ display: "grid", gap: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "0.45rem" }}>
            <p style={eyebrowStyle}>2件比較</p>
            <h1 style={{ margin: 0, fontSize: "clamp(2rem, 4vw, 3.2rem)", color: "#16212b" }}>2件比較</h1>
            <p style={{ margin: 0, color: "#617488", lineHeight: 1.7, maxWidth: 760 }}>
              実行結果、監査差分、改善案の差分を並べて比較し、どの観点で差が出ているかを短時間で把握できます。
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "start" }}>
            <Link href={props.backToListHref} style={backLinkStyle}>
              選択した実行一覧に戻る
            </Link>
          </div>
        </div>

        <section style={targetsWrapStyle}>
          <h2 style={sectionHeadingStyle}>比較対象</h2>
          <div style={overviewGridStyle}>
            <RunOverviewCard item={left} title="左の実行" detailLabel="左の詳細を見る" side="left" />
            <RunOverviewCard item={right} title="右の実行" detailLabel="右の詳細を見る" side="right" />
          </div>
        </section>
      </header>

      <section style={{ display: "grid", gap: "0.9rem" }} aria-label="統合差分要約">
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={sectionHeadingStyle}>統合差分要約</h2>
          <DeltaPill tone="changed">{props.integratedSummary.length} 行で全体像を確認</DeltaPill>
        </div>
        <article style={integratedSummaryStyle}>
          {props.integratedSummary.map((item) => (
            <div key={`${item.label}-${item.text}`} style={integratedLineStyle}>
              <p style={integratedLabelStyle}>{item.label}</p>
              <p style={integratedTextStyle}>{item.text}</p>
            </div>
          ))}
        </article>
      </section>

      <section style={{ display: "grid", gap: "0.9rem" }} aria-label="主な差分">
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={sectionHeadingStyle}>主な差分</h2>
          <DeltaPill tone="changed">{props.keyDifferences.length} 項目を確認</DeltaPill>
        </div>
        <article style={keyDifferencesStyle}>
          {props.keyDifferences.map((item) => (
            <p key={item.text} style={keyDifferenceLineStyle}>
              {item.text}
            </p>
          ))}
        </article>
      </section>

      <section style={{ display: "grid", gap: "0.95rem" }} aria-label="差分の要約">
        <h2 style={sectionHeadingStyle}>差分の要約</h2>
        <div style={deltaGridStyle}>
          <DeltaCard
            title="ステータス差分"
            tone={statusChanged ? "changed" : "same"}
            headline={
              statusChanged
                ? `${formatStatusLabel(left.status)} → ${formatStatusLabel(right.status)}`
                : `同一ステータス: ${formatStatusLabel(left.status)}`
            }
            detail={
              statusChanged
                ? `左は ${formatStatusLabel(left.status)}、右は ${formatStatusLabel(right.status)} です。`
                : "両者とも同じステータスです。"
            }
          />
          <DeltaCard
            title="指摘件数差分"
            tone={findingDelta === 0 ? "same" : "changed"}
            headline={formatFindingDeltaHeadline(findingDelta)}
            detail={`左: ${left.findingCount} 件 / 右: ${right.findingCount} 件`}
          />
          <DeltaCard
            title="最新ステップ概要"
            tone={latestStepSummaryChanged ? "changed" : "same"}
            headline={latestStepSummaryChanged ? "最新ステップ概要に差分があります" : "最新ステップ概要は同じです"}
            detail={`左: ${left.latestStepStatus?.stepName ?? "なし"} / 右: ${right.latestStepStatus?.stepName ?? "なし"}`}
          />
        </div>
      </section>

      {props.figmaCheckDelta ? (
        <section style={{ display: "grid", gap: "0.95rem" }} aria-label="Figma Check 監査差分">
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={sectionHeadingStyle}>Figma Check 監査差分</h2>
            <DeltaPill tone={hasFigmaCheckDiff ? "changed" : "same"}>
              {hasFigmaCheckDiff ? "監査差分があります" : "監査差分はありません"}
            </DeltaPill>
          </div>
          <div style={deltaGridStyle}>
            <DeltaCard
              title="Figma Check 件数差分"
              tone={props.figmaCheckDelta.findingCountDelta.delta === 0 ? "same" : "changed"}
              headline={formatFindingDeltaHeadline(props.figmaCheckDelta.findingCountDelta.delta)}
              detail={`左: ${props.figmaCheckDelta.findingCountDelta.leftCount} 件 / 右: ${props.figmaCheckDelta.findingCountDelta.rightCount} 件`}
            />
            <DeltaCard
              title="Figma Check 重要度差分"
              tone={figmaCheckSeverityChanged ? "changed" : "same"}
              headline={figmaCheckSeverityChanged ? summarizeDeltaRows(props.figmaCheckDelta.severityRows, 1) : "重要度差分はありません"}
              detail={summarizeDeltaRows(props.figmaCheckDelta.severityRows, 3, true)}
            />
            <DeltaCard
              title="Figma Check カテゴリ差分"
              tone={figmaCheckCategoryChanged ? "changed" : "same"}
              headline={figmaCheckCategoryChanged ? summarizeDeltaRows(props.figmaCheckDelta.categoryRows, 1) : "カテゴリ差分はありません"}
              detail={summarizeDeltaRows(props.figmaCheckDelta.categoryRows, 3, true)}
            />
          </div>
          <div style={{ display: "grid", gap: "1rem" }}>
            <FindingDeltaGroupView
              group={{
                title: "Figma Check 重要度別の差分",
                marker: figmaCheckSeverityChanged ? "監査重要度に差分があります" : "監査重要度の差分はありません",
                rows: props.figmaCheckDelta.severityRows
              }}
              leftId={left.id}
              rightId={right.id}
            />
            <FindingDeltaGroupView
              group={{
                title: "Figma Check カテゴリ別の差分",
                marker: figmaCheckCategoryChanged ? "監査カテゴリに差分があります" : "監査カテゴリの差分はありません",
                rows: props.figmaCheckDelta.categoryRows
              }}
              leftId={left.id}
              rightId={right.id}
            />
          </div>
        </section>
      ) : null}

      {props.figmaMakeDelta ? (
        <section style={{ display: "grid", gap: "0.95rem" }} aria-label="Figma Make 改善案差分">
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={sectionHeadingStyle}>Figma Make 改善案差分</h2>
            <DeltaPill tone={hasFigmaMakeDiff ? "changed" : "same"}>
              {hasFigmaMakeDiff ? "改善案差分があります" : "改善案差分はありません"}
            </DeltaPill>
          </div>
          <div style={deltaGridStyle}>
            <DeltaCard
              title="Figma Make 件数差分"
              tone={props.figmaMakeDelta.findingCountDelta.delta === 0 ? "same" : "changed"}
              headline={formatFindingDeltaHeadline(props.figmaMakeDelta.findingCountDelta.delta)}
              detail={`左: ${props.figmaMakeDelta.findingCountDelta.leftCount} 件 / 右: ${props.figmaMakeDelta.findingCountDelta.rightCount} 件`}
            />
            <DeltaCard
              title="Figma Make テーマ差分"
              tone={figmaMakeThemeChanged ? "changed" : "same"}
              headline={figmaMakeThemeChanged ? summarizeDeltaRows(props.figmaMakeDelta.themeRows, 1) : "テーマ差分はありません"}
              detail={summarizeDeltaRows(props.figmaMakeDelta.themeRows, 3, true)}
            />
            <DeltaCard
              title="改善案の傾向"
              tone={figmaMakeThemeChanged ? "changed" : "same"}
              headline={buildProposalThemeHeadline(props.figmaMakeDelta.themeRows)}
              detail="CTA、階層、余白、コントラスト、レイアウトの観点で改善案の偏りを確認できます。"
            />
          </div>
          <div style={{ display: "grid", gap: "1rem" }}>
            <FindingDeltaGroupView
              group={{
                title: "Figma Make テーマ別の差分",
                marker: figmaMakeThemeChanged ? "改善案テーマに差分があります" : "改善案テーマの差分はありません",
                rows: props.figmaMakeDelta.themeRows
              }}
              leftId={left.id}
              rightId={right.id}
            />
          </div>
        </section>
      ) : null}

      <section style={{ display: "grid", gap: "0.9rem" }} aria-label="タグ比較">
        <h2 style={sectionHeadingStyle}>タグ比較</h2>
        <div style={gridStyle}>
          <TagGroupCard title="共通タグ" tags={commonTags} emptyText="共通タグはありません。" tone="common" />
          <TagGroupCard title="左のみのタグ" tags={leftOnlyTags} emptyText="左のみのタグはありません。" tone="left" />
          <TagGroupCard title="右のみのタグ" tags={rightOnlyTags} emptyText="右のみのタグはありません。" tone="right" />
        </div>
      </section>

      <section style={{ display: "grid", gap: "0.9rem" }}>
        <h2 style={sectionHeadingStyle}>指摘差分</h2>
        <div style={{ display: "grid", gap: "1rem" }}>
          {props.findingDeltaGroups.map((group) => (
            <FindingDeltaGroupView key={group.title} group={group} leftId={left.id} rightId={right.id} />
          ))}
        </div>
      </section>

      <CompareTextSection
        title="総評"
        marker={executiveSummaryChanged ? "差分があります" : "同じ内容です"}
        markerTone={executiveSummaryChanged ? "changed" : "same"}
        leftTitle={formatRunPanelTitle("左の実行", left)}
        rightTitle={formatRunPanelTitle("右の実行", right)}
        leftText={resolveSummary(left)}
        rightText={resolveSummary(right)}
      />

      <CompareTextSection
        title="メモ比較"
        marker={memoChanged ? "メモに差分があります" : "メモは同じです"}
        markerTone={memoChanged ? "changed" : "same"}
        leftTitle={formatRunPanelTitle("左の実行", left)}
        rightTitle={formatRunPanelTitle("右の実行", right)}
        leftText={left.memo ?? "この実行にはメモがありません。"}
        rightText={right.memo ?? "この実行にはメモがありません。"}
      />

      <CompareTextSection
        title="最新ステップ概要"
        marker={latestStepSummaryChanged ? "概要に差分があります" : "概要は同じです"}
        markerTone={latestStepSummaryChanged ? "changed" : "same"}
        leftTitle={`${formatRunPanelTitle("左の実行", left)} / ${formatLatestStepTitle(left)}`}
        rightTitle={`${formatRunPanelTitle("右の実行", right)} / ${formatLatestStepTitle(right)}`}
        leftText={left.latestStepStatus?.summaryText ?? "この実行には最新ステップ概要がありません。"}
        rightText={right.latestStepStatus?.summaryText ?? "この実行には最新ステップ概要がありません。"}
        leftMeta={<StatusBadge status={left.latestStepStatus?.status ?? "pending"} />}
        rightMeta={<StatusBadge status={right.latestStepStatus?.status ?? "pending"} />}
      />

      <section style={{ display: "grid", gap: "0.9rem" }}>
        <h2 style={sectionHeadingStyle}>実行情報</h2>
        <div style={factsGridStyle}>
          <FactColumn item={left} title={formatRunPanelTitle("左の実行", left)} />
          <FactColumn item={right} title={formatRunPanelTitle("右の実行", right)} />
        </div>
      </section>
    </section>
  );
}

function TagGroupCard(props: {
  title: string;
  tags: string[];
  emptyText: string;
  tone: "common" | "left" | "right";
}) {
  return (
    <article style={tagGroupCardStyle}>
      <p style={smallLabelStyle}>{props.title}</p>
      {props.tags.length === 0 ? (
        <p style={emptyTagTextStyle}>{props.emptyText}</p>
      ) : (
        <div style={tagWrapStyle}>
          {props.tags.map((tag) => (
            <span key={`${props.title}-${tag}`} style={getTagToneStyle(props.tone)}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function RunOverviewCard(input: {
  title: string;
  detailLabel: string;
  item: ReviewCompareItemDto;
  side: "left" | "right";
}) {
  const { item, title, detailLabel, side } = input;

  return (
    <article style={getOverviewCardStyle(side)}>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        <p style={smallLabelStyle}>{title}</p>
        <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
          <StatusBadge status={item.status} />
          {item.archived ? <span style={archivedPillStyle}>アーカイブ済み</span> : null}
          <span style={{ color: "#72849a" }}>更新: {formatTimestamp(item.updatedAt)}</span>
        </div>
        <h2 style={{ margin: 0, fontSize: "1.08rem", lineHeight: 1.45, color: "#16212b", wordBreak: "break-word" }}>
          {item.title ?? item.id}
        </h2>
        {item.title ? <p style={idMetaStyle}>実行ID: {item.id}</p> : null}
        {item.tags.length > 0 ? (
          <div style={tagWrapStyle}>
            {item.tags.map((tag) => (
              <span key={tag} style={tagPillStyle}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {item.memo ? (
          <div style={memoPreviewStyle}>
            <p style={smallLabelStyle}>メモ</p>
            <p style={{ margin: "0.35rem 0 0", color: "#678194", lineHeight: 1.65 }}>{truncateText(item.memo, 140)}</p>
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Link href={`/reviews/${item.id}`} style={primaryLinkStyle}>
          {detailLabel}
        </Link>
      </div>
    </article>
  );
}

function CompareTextSection(props: {
  title: string;
  marker: string;
  markerTone: DeltaTone;
  leftTitle: string;
  rightTitle: string;
  leftText: string;
  rightText: string;
  leftMeta?: ReactNode;
  rightMeta?: ReactNode;
}) {
  return (
    <section style={{ display: "grid", gap: "0.9rem" }}>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={sectionHeadingStyle}>{props.title}</h2>
        <DeltaPill tone={props.markerTone}>{props.marker}</DeltaPill>
      </div>
      <div style={gridStyle}>
        <TextPanel title={props.leftTitle} meta={props.leftMeta} text={props.leftText} tone="left" />
        <TextPanel title={props.rightTitle} meta={props.rightMeta} text={props.rightText} tone="right" />
      </div>
    </section>
  );
}

function TextPanel(props: { title: string; text: string; meta?: ReactNode; tone: "left" | "right" }) {
  return (
    <article style={getTextPanelStyle(props.tone)}>
      <div style={{ display: "grid", gap: "0.45rem" }}>
        <p style={smallLabelStyle}>{props.title}</p>
        {props.meta ? <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>{props.meta}</div> : null}
      </div>
      <p style={{ margin: 0, color: "#203040", lineHeight: 1.78, whiteSpace: "pre-wrap" }}>{props.text}</p>
    </article>
  );
}

function FindingDeltaGroupView(props: {
  group: ReviewRunCompareFindingDeltaGroup;
  leftId: string;
  rightId: string;
}) {
  const markerTone = props.group.rows.some((row) => row.delta !== 0) ? "changed" : "same";

  return (
    <article style={findingGroupStyle}>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, color: "#16212b", fontSize: "1rem" }}>{props.group.title}</h3>
        <DeltaPill tone={markerTone}>{props.group.marker}</DeltaPill>
      </div>
      <div style={{ display: "grid", gap: "0.55rem" }}>
        <div style={findingTableHeaderStyle}>
          <span>分類</span>
          <span>{formatRunHeading("左", { id: props.leftId })}</span>
          <span>{formatRunHeading("右", { id: props.rightId })}</span>
          <span>差分</span>
        </div>
        {props.group.rows.map((row) => (
          <FindingDeltaRowView key={row.label} row={row} />
        ))}
      </div>
    </article>
  );
}

function FindingDeltaRowView(props: { row: ReviewRunCompareFindingDeltaRow }) {
  const hasDelta = props.row.delta !== 0;
  const deltaTone = hasDelta ? "changed" : "same";

  return (
    <div
      style={{
        ...findingRowStyle,
        borderColor: hasDelta ? "rgba(47, 111, 237, 0.18)" : "rgba(111, 138, 164, 0.1)"
      }}
    >
      <span style={{ fontWeight: 700, color: "#203040" }}>{formatBucketLabel(props.row.label)}</span>
      <span style={countCellStyle}>{props.row.leftCount}</span>
      <span style={countCellStyle}>{props.row.rightCount}</span>
      <DeltaPill tone={deltaTone}>{formatSignedDelta(props.row.delta)}</DeltaPill>
    </div>
  );
}

function FactColumn(props: { item: ReviewCompareItemDto; title: string }) {
  const { item } = props;

  return (
    <article style={factColumnStyle}>
      <p style={smallLabelStyle}>{props.title}</p>
      <InfoRow label="ステータス" valueNode={<StatusBadge status={item.status} />} />
      <InfoRow label="アーカイブ状態" value={item.archived ? "アーカイブ済み" : "有効"} />
      <InfoRow label="指摘件数" value={`${item.findingCount} 件`} />
      <InfoRow label="作成日時" value={formatTimestamp(item.createdAt)} />
      <InfoRow label="更新日時" value={formatTimestamp(item.updatedAt)} />
      <InfoRow label="最新ステップ" value={item.latestStepStatus?.stepName ?? "なし"} />
      <InfoRow
        label="最新ステップのステータス"
        valueNode={<StatusBadge status={item.latestStepStatus?.status ?? "pending"} />}
      />
    </article>
  );
}

function InfoRow(props: { label: string; value?: string; valueNode?: ReactNode }) {
  return (
    <div>
      <p style={smallLabelStyle}>{props.label}</p>
      <div style={{ marginTop: "0.35rem", color: "#203040", lineHeight: 1.6 }}>
        {props.valueNode ?? props.value ?? "未設定"}
      </div>
    </div>
  );
}

function DeltaCard(props: { title: string; headline: string; detail: string; tone: DeltaTone }) {
  const tone = getDeltaTone(props.tone);

  return (
    <article
      style={{
        display: "grid",
        gap: "0.45rem",
        padding: "1rem 1.05rem",
        borderRadius: 20,
        border: `1px solid ${tone.border}`,
        background: tone.background,
        boxShadow: "0 12px 24px rgba(27, 55, 89, 0.04)"
      }}
    >
      <p style={smallLabelStyle}>{props.title}</p>
      <p style={{ margin: 0, color: tone.color, fontSize: "1.02rem", fontWeight: 800, lineHeight: 1.45 }}>
        {props.headline}
      </p>
      <p style={{ margin: 0, color: "#617488", lineHeight: 1.58 }}>{props.detail}</p>
    </article>
  );
}

function DeltaPill(props: { tone: DeltaTone; children: ReactNode }) {
  const tone = getDeltaTone(props.tone);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        width: "fit-content",
        padding: "0.32rem 0.72rem",
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.background,
        color: tone.color,
        fontWeight: 700
      }}
    >
      {props.children}
    </span>
  );
}

function StatusBadge(props: { status: ReviewRunStatus | ReviewStepStatus }) {
  const tone = getStatusTone(props.status);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.45rem",
        width: "fit-content",
        padding: "0.4rem 0.84rem",
        borderRadius: 999,
        border: `1px solid ${tone.border}`,
        background: tone.background,
        color: tone.color,
        fontWeight: 700,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.55), 0 8px 18px ${tone.shadow}`
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 9,
          height: 9,
          borderRadius: 999,
          background: tone.dot,
          boxShadow: `0 0 0 3px ${tone.dotHalo}`
        }}
      />
      {formatStatusLabel(props.status)}
    </span>
  );
}

function resolveSummary(item: ReviewCompareItemDto) {
  return item.executiveSummary ?? item.displaySummary ?? "この実行には総評が保存されていません。";
}

function formatLatestStepTitle(item: ReviewCompareItemDto) {
  if (!item.latestStepStatus) {
    return "最新ステップなし";
  }

  return `${item.latestStepStatus.stepName} ステップ`;
}

function formatFindingDeltaHeadline(delta: number) {
  if (delta === 0) {
    return "件数差分はありません";
  }

  if (delta > 0) {
    return `左が ${delta} 件多い`;
  }

  return `右が ${Math.abs(delta)} 件多い`;
}

function summarizeDeltaRows(rows: ReviewRunCompareFindingDeltaRow[], maxItems: number, withFallback = false) {
  const importantRows = rows
    .filter((row) => row.delta !== 0)
    .sort((leftValue, rightValue) => Math.abs(rightValue.delta) - Math.abs(leftValue.delta))
    .slice(0, maxItems);

  if (importantRows.length === 0) {
    return withFallback ? "大きな差分はありません。" : "";
  }

  return importantRows
    .map((row) =>
      row.delta > 0
        ? `左の${formatBucketLabel(row.label)}が ${row.delta} 件多い`
        : `右の${formatBucketLabel(row.label)}が ${Math.abs(row.delta)} 件多い`
    )
    .join("、");
}

function buildProposalThemeHeadline(rows: ReviewRunCompareFindingDeltaRow[]) {
  const summary = summarizeDeltaRows(rows, 1);
  return summary || "テーマ差分はありません";
}

function formatRunHeading(sideLabel: string, item: Pick<ReviewCompareItemDto, "id">) {
  return `${sideLabel} / ${shortId(item.id)}`;
}

function formatRunPanelTitle(sideLabel: string, item: Pick<ReviewCompareItemDto, "id" | "title">) {
  return item.title ? `${sideLabel} / ${item.title} (${shortId(item.id)})` : formatRunHeading(sideLabel, item);
}

function shortId(value: string) {
  return value.length > 12 ? value.slice(0, 12) : value;
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

function formatSignedDelta(value: number) {
  if (value === 0) {
    return "0";
  }

  return value > 0 ? `+${value}` : String(value);
}

function normalizeText(value?: string | null) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function formatStatusLabel(status: ReviewRunStatus | ReviewStepStatus) {
  const labels: Record<string, string> = {
    completed: "完了",
    partial_success: "一部成功",
    failed: "失敗",
    skipped: "スキップ",
    success: "成功",
    warning: "注意",
    error: "エラー",
    running: "実行中",
    draft: "下書き",
    pending: "待機中"
  };

  return labels[status] ?? status.replaceAll("_", " ");
}

type DeltaTone = "same" | "changed";

function getDeltaTone(tone: DeltaTone) {
  if (tone === "changed") {
    return {
      background: "rgba(47, 111, 237, 0.08)",
      border: "rgba(47, 111, 237, 0.18)",
      color: "#245dd1"
    };
  }

  return {
    background: "rgba(22, 151, 166, 0.08)",
    border: "rgba(22, 151, 166, 0.18)",
    color: "#0d7682"
  };
}

function getStatusTone(status: ReviewRunStatus | ReviewStepStatus) {
  const toneByStatus: Record<
    ReviewRunStatus | ReviewStepStatus,
    { background: string; color: string; border: string; dot: string; dotHalo: string; shadow: string }
  > = {
    draft: {
      background: "rgba(123, 142, 162, 0.12)",
      color: "#5d6c7c",
      border: "rgba(123, 142, 162, 0.2)",
      dot: "#7f93a9",
      dotHalo: "rgba(127, 147, 169, 0.16)",
      shadow: "rgba(100, 123, 146, 0.12)"
    },
    running: {
      background: "rgba(47, 111, 237, 0.12)",
      color: "#245dd1",
      border: "rgba(47, 111, 237, 0.22)",
      dot: "#2f6fed",
      dotHalo: "rgba(47, 111, 237, 0.16)",
      shadow: "rgba(47, 111, 237, 0.16)"
    },
    completed: {
      background: "rgba(22, 151, 166, 0.12)",
      color: "#0d7682",
      border: "rgba(22, 151, 166, 0.22)",
      dot: "#1697a6",
      dotHalo: "rgba(22, 151, 166, 0.16)",
      shadow: "rgba(22, 151, 166, 0.16)"
    },
    partial_success: {
      background: "rgba(214, 146, 54, 0.14)",
      color: "#9b5f10",
      border: "rgba(214, 146, 54, 0.24)",
      dot: "#d69236",
      dotHalo: "rgba(214, 146, 54, 0.16)",
      shadow: "rgba(214, 146, 54, 0.16)"
    },
    failed: {
      background: "rgba(198, 63, 89, 0.12)",
      color: "#a7374f",
      border: "rgba(198, 63, 89, 0.22)",
      dot: "#c63f59",
      dotHalo: "rgba(198, 63, 89, 0.16)",
      shadow: "rgba(198, 63, 89, 0.16)"
    },
    pending: {
      background: "rgba(123, 142, 162, 0.12)",
      color: "#5d6c7c",
      border: "rgba(123, 142, 162, 0.2)",
      dot: "#7b8ea2",
      dotHalo: "rgba(123, 142, 162, 0.14)",
      shadow: "rgba(123, 142, 162, 0.12)"
    },
    success: {
      background: "rgba(22, 151, 166, 0.12)",
      color: "#0d7682",
      border: "rgba(22, 151, 166, 0.22)",
      dot: "#1697a6",
      dotHalo: "rgba(22, 151, 166, 0.16)",
      shadow: "rgba(22, 151, 166, 0.16)"
    },
    skipped: {
      background: "rgba(122, 137, 155, 0.1)",
      color: "#697a8d",
      border: "rgba(122, 137, 155, 0.2)",
      dot: "#7a899b",
      dotHalo: "rgba(122, 137, 155, 0.14)",
      shadow: "rgba(122, 137, 155, 0.14)"
    }
  };

  return toneByStatus[status];
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: "#4d78c9",
  fontSize: "0.8rem",
  textTransform: "uppercase",
  letterSpacing: "0.16em",
  fontWeight: 800
};

const sectionHeadingStyle: CSSProperties = {
  margin: 0,
  color: "#16212b",
  fontSize: "1.14rem"
};

const smallLabelStyle: CSSProperties = {
  margin: 0,
  color: "#6d8095",
  fontSize: "0.76rem",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  fontWeight: 700
};

const idMetaStyle: CSSProperties = {
  margin: 0,
  color: "#72849a",
  fontSize: "0.92rem",
  wordBreak: "break-word",
  fontFamily: "Consolas, 'SFMono-Regular', monospace"
};

const tagWrapStyle: CSSProperties = {
  display: "flex",
  gap: "0.45rem",
  flexWrap: "wrap"
};

const tagPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.28rem 0.72rem",
  borderRadius: 999,
  border: "1px solid rgba(96, 134, 174, 0.16)",
  background: "rgba(47, 111, 237, 0.07)",
  color: "#34577a",
  fontSize: "0.82rem",
  fontWeight: 700
};

const archivedPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.22rem 0.58rem",
  borderRadius: 999,
  border: "1px solid rgba(127, 144, 160, 0.2)",
  background: "rgba(125, 142, 163, 0.12)",
  color: "#55687b",
  fontSize: "0.8rem",
  fontWeight: 700
};

const gridStyle: CSSProperties = {
  display: "grid",
  gap: "1.1rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))"
};

const overviewGridStyle: CSSProperties = {
  display: "grid",
  gap: "1.1rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))"
};

const deltaGridStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
};

const targetsWrapStyle: CSSProperties = {
  display: "grid",
  gap: "1rem"
};

const memoPreviewStyle: CSSProperties = {
  padding: "0.9rem 1rem",
  borderRadius: 16,
  border: "1px solid rgba(109, 164, 174, 0.16)",
  background: "linear-gradient(145deg, rgba(245, 251, 252, 0.98), rgba(238, 247, 249, 0.92))"
};

const integratedSummaryStyle: CSSProperties = {
  display: "grid",
  gap: "0.85rem",
  padding: "1.2rem 1.25rem",
  borderRadius: 22,
  border: "1px solid rgba(47, 111, 237, 0.18)",
  background: "linear-gradient(145deg, rgba(244, 249, 255, 0.98), rgba(234, 244, 255, 0.95))",
  boxShadow: "0 18px 34px rgba(33, 73, 122, 0.08)"
};

const integratedLineStyle: CSSProperties = {
  display: "grid",
  gap: "0.28rem",
  paddingBottom: "0.8rem",
  borderBottom: "1px solid rgba(87, 124, 170, 0.12)"
};

const integratedLabelStyle: CSSProperties = {
  margin: 0,
  color: "#245dd1",
  fontSize: "0.82rem",
  fontWeight: 800,
  letterSpacing: "0.06em"
};

const integratedTextStyle: CSSProperties = {
  margin: 0,
  color: "#203040",
  lineHeight: 1.72,
  fontWeight: 600
};

const keyDifferencesStyle: CSSProperties = {
  display: "grid",
  gap: "0.7rem",
  padding: "1.15rem 1.2rem",
  borderRadius: 22,
  border: "1px solid rgba(47, 111, 237, 0.16)",
  background: "linear-gradient(145deg, rgba(247, 251, 255, 0.98), rgba(237, 245, 255, 0.94))",
  boxShadow: "0 18px 34px rgba(33, 73, 122, 0.08)"
};

const keyDifferenceLineStyle: CSSProperties = {
  margin: 0,
  color: "#203040",
  lineHeight: 1.72,
  fontWeight: 600
};

const findingGroupStyle: CSSProperties = {
  display: "grid",
  gap: "0.85rem",
  padding: "1.05rem",
  borderRadius: 20,
  border: "1px solid rgba(111, 138, 164, 0.12)",
  background: "rgba(255, 255, 255, 0.96)",
  boxShadow: "0 12px 24px rgba(27, 55, 89, 0.04)"
};

const tagGroupCardStyle: CSSProperties = {
  display: "grid",
  gap: "0.7rem",
  padding: "1rem",
  borderRadius: 20,
  border: "1px solid rgba(111, 138, 164, 0.12)",
  background: "rgba(255, 255, 255, 0.96)"
};

const emptyTagTextStyle: CSSProperties = {
  margin: 0,
  color: "#72849a",
  lineHeight: 1.6
};

const findingTableHeaderStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "minmax(120px, 1.6fr) repeat(3, minmax(72px, 1fr))",
  color: "#72849a",
  fontSize: "0.82rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em"
};

const findingRowStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "minmax(120px, 1.6fr) repeat(3, minmax(72px, 1fr))",
  alignItems: "center",
  padding: "0.74rem 0.82rem",
  borderRadius: 16,
  border: "1px solid rgba(111, 138, 164, 0.1)",
  background: "rgba(247, 250, 254, 0.84)"
};

const countCellStyle: CSSProperties = {
  color: "#203040",
  fontWeight: 700
};

const factsGridStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))"
};

const factColumnStyle: CSSProperties = {
  display: "grid",
  gap: "0.9rem",
  padding: "1rem",
  borderRadius: 20,
  border: "1px solid rgba(111, 138, 164, 0.12)",
  background: "rgba(255, 255, 255, 0.96)"
};

const primaryLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  padding: "0.78rem 1.08rem",
  borderRadius: 999,
  background: "linear-gradient(135deg, #2f6fed, #245dd1)",
  color: "#f8fbff",
  fontWeight: 700,
  textDecoration: "none",
  boxShadow: "0 12px 28px rgba(47, 111, 237, 0.24)"
};

const backLinkStyle: CSSProperties = {
  color: "#2f6fed",
  fontWeight: 700,
  textDecoration: "none"
};

function getTagToneStyle(tone: "common" | "left" | "right"): CSSProperties {
  if (tone === "left") {
    return {
      ...tagPillStyle,
      background: "rgba(47, 111, 237, 0.12)",
      color: "#245dd1"
    };
  }

  if (tone === "right") {
    return {
      ...tagPillStyle,
      background: "rgba(22, 151, 166, 0.12)",
      color: "#0d7682"
    };
  }

  return {
    ...tagPillStyle,
    background: "rgba(41, 125, 214, 0.1)",
    color: "#2858a8"
  };
}

function getOverviewCardStyle(side: "left" | "right"): CSSProperties {
  return {
    display: "grid",
    gap: "1rem",
    padding: "1.25rem",
    borderRadius: 22,
    border: `1px solid ${side === "left" ? "rgba(47, 111, 237, 0.16)" : "rgba(22, 151, 166, 0.16)"}`,
    background:
      side === "left"
        ? "linear-gradient(180deg, rgba(248, 251, 255, 0.98), rgba(241, 247, 255, 0.94))"
        : "linear-gradient(180deg, rgba(247, 252, 253, 0.98), rgba(239, 249, 250, 0.94))",
    boxShadow: "0 14px 30px rgba(24, 48, 79, 0.05)"
  };
}

function getTextPanelStyle(tone: "left" | "right"): CSSProperties {
  return {
    display: "grid",
    gap: "0.85rem",
    padding: "1rem 1.05rem",
    borderRadius: 20,
    border: `1px solid ${tone === "left" ? "rgba(47, 111, 237, 0.14)" : "rgba(22, 151, 166, 0.14)"}`,
    background:
      tone === "left"
        ? "linear-gradient(180deg, rgba(250, 252, 255, 0.98), rgba(243, 247, 255, 0.94))"
        : "linear-gradient(180deg, rgba(248, 252, 253, 0.98), rgba(241, 249, 250, 0.94))"
  };
}
