"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type {
  ReviewListDto,
  ReviewListItemDto,
  ReviewListSort,
  ReviewListStatusFilter
} from "@/lib/contracts/review-list";
import type { ReviewRunStatus, ReviewStepStatus } from "@/lib/core/review-types";

const statusFilterOptions: ReviewListStatusFilter[] = [
  "all",
  "completed",
  "partial_success",
  "failed",
  "running",
  "draft"
];

const sortOptions: Array<{ value: ReviewListSort; label: string }> = [
  { value: "createdAt_desc", label: "作成日時が新しい順" },
  { value: "createdAt_asc", label: "作成日時が古い順" },
  { value: "updatedAt_desc", label: "更新日時が新しい順" },
  { value: "updatedAt_asc", label: "更新日時が古い順" }
];

const pageSizeOptions = [5, 10, 20, 50];

export function ReviewRunList({
  initialSelectedCompareIds,
  list,
  selectedStatus,
  selectedKeyword,
  selectedTag,
  selectedShowArchived,
  selectedPageSize,
  selectedSort
}: {
  initialSelectedCompareIds: string[];
  list: ReviewListDto;
  selectedStatus: ReviewListStatusFilter;
  selectedKeyword: string;
  selectedTag: string;
  selectedShowArchived: boolean;
  selectedPageSize: number;
  selectedSort: ReviewListSort;
}) {
  const isFiltered =
    selectedStatus !== "all" || selectedKeyword.length > 0 || selectedTag.length > 0 || selectedShowArchived;
  const router = useRouter();
  const pathname = usePathname();
  const [visibleItems, setVisibleItems] = useState<ReviewListItemDto[]>(list.items);
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>(initialSelectedCompareIds);
  const [pendingArchiveItemIds, setPendingArchiveItemIds] = useState<string[]>([]);
  const [archiveFeedback, setArchiveFeedback] = useState<string | null>(null);
  const quickTagOptions = useMemo(() => {
    const tags = Array.from(new Set(visibleItems.flatMap((item) => item.tags))).sort();

    if (selectedTag && !tags.includes(selectedTag)) {
      tags.unshift(selectedTag);
    }

    return tags.slice(0, 12);
  }, [visibleItems, selectedTag]);

  useEffect(() => {
    setSelectedCompareIds(initialSelectedCompareIds);
  }, [initialSelectedCompareIds]);

  useEffect(() => {
    setVisibleItems(list.items);
    setPendingArchiveItemIds([]);
    setArchiveFeedback(null);
  }, [list.items]);

  const compareHref = useMemo(() => {
    if (selectedCompareIds.length !== 2) {
      return null;
    }

    const params = new URLSearchParams({
      left: selectedCompareIds[0],
      right: selectedCompareIds[1]
    });
    return `/reviews/compare?${params.toString()}`;
  }, [selectedCompareIds]);

  const selectedSlots = [selectedCompareIds[0] ?? null, selectedCompareIds[1] ?? null];

  function updateCompareSelection(nextSelectedCompareIds: string[]) {
    setSelectedCompareIds(nextSelectedCompareIds);
    router.replace(
      buildReviewListHref({
        pathname,
        status: selectedStatus,
        keyword: selectedKeyword,
        tag: selectedTag,
        showArchived: selectedShowArchived,
        page: list.page,
        pageSize: selectedPageSize,
        sort: selectedSort,
        compareLeft: nextSelectedCompareIds[0] ?? "",
        compareRight: nextSelectedCompareIds[1] ?? ""
      })
    );
  }

  async function onToggleArchive(item: ReviewListItemDto) {
    setPendingArchiveItemIds((current) => [...current, item.id]);
    setArchiveFeedback(null);

    try {
      const response = await fetch(`/api/reviews/${item.id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ archived: !item.archived })
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; archived?: boolean } | null;

      if (!response.ok || typeof payload?.archived !== "boolean") {
        throw new Error(payload?.error ?? "アーカイブ状態の更新に失敗しました");
      }

      const nextArchived = payload.archived;
      const label = item.title ?? item.id;

      setVisibleItems((current) => {
        if (!selectedShowArchived && nextArchived) {
          return current.filter((entry) => entry.id !== item.id);
        }

        return current.map((entry) => (entry.id === item.id ? { ...entry, archived: nextArchived } : entry));
      });

      if (!selectedShowArchived && nextArchived) {
        if (selectedCompareIds.includes(item.id)) {
          updateCompareSelection(selectedCompareIds.filter((value) => value !== item.id));
        }
        setArchiveFeedback(`${label} をアーカイブし、現在の一覧から非表示にしました。`);
      } else {
        setArchiveFeedback(nextArchived ? `${label} をアーカイブしました。` : `${label} のアーカイブを解除しました。`);
      }

      router.refresh();
    } catch (error) {
      setArchiveFeedback(error instanceof Error ? error.message : "アーカイブ状態の更新に失敗しました。");
    } finally {
      setPendingArchiveItemIds((current) => current.filter((value) => value !== item.id));
    }
  }

  return (
    <section className="panel" style={{ padding: "2.2rem", display: "grid", gap: "1.6rem" }}>
      <header style={{ display: "grid", gap: "1.1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: "0.4rem" }}>
            <p style={eyebrowStyle}>レビュー一覧</p>
            <h1 style={{ margin: 0, fontSize: "clamp(1.9rem, 3.8vw, 3rem)" }}>最近のレビュー実行</h1>
            <p style={{ margin: 0, color: "#5f4c3c", lineHeight: 1.6, maxWidth: 740 }}>
              保存済みの実行を新しい順に確認できます。ステータス、キーワード、タグ、並び順で絞り込み、詳細画面で成果物と指摘内容を確認してください。
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "start", flexWrap: "wrap" }}>
            <Link href="/" style={linkStyle}>
              レビューを作成
            </Link>
          </div>
        </div>

        <div style={workbenchControlsStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
            {statusFilterOptions.map((status) => (
              <Link
                key={status}
                href={buildReviewListHref({
                  pathname,
                  status,
                  keyword: selectedKeyword,
                  tag: selectedTag,
                  showArchived: selectedShowArchived,
                  page: 1,
                  pageSize: selectedPageSize,
                  sort: selectedSort,
                  compareLeft: selectedCompareIds[0] ?? "",
                  compareRight: selectedCompareIds[1] ?? ""
                })}
                style={getFilterLinkStyle(status === selectedStatus)}
              >
                {formatListStatusLabel(status)}
              </Link>
            ))}
          </div>
          <span style={{ color: "#6b5a47", alignSelf: "center" }}>
            {list.total} 件中 {visibleItems.length} 件を表示
          </span>
        </div>

        <form action="/reviews" method="get" style={searchBarStyle}>
          {selectedStatus !== "all" ? <input name="status" type="hidden" value={selectedStatus} /> : null}
          <input name="page" type="hidden" value="1" />
          {selectedCompareIds[0] ? <input name="compareLeft" type="hidden" value={selectedCompareIds[0]} /> : null}
          {selectedCompareIds[1] ? <input name="compareRight" type="hidden" value={selectedCompareIds[1]} /> : null}
          {selectedShowArchived ? <input name="showArchived" type="hidden" value="true" /> : null}
          <input
            aria-label="レビュー実行を検索"
            defaultValue={selectedKeyword}
            name="keyword"
            placeholder="実行ID、タイトル、タグ、メモ、要約、ステップ文言で検索"
            style={searchInputStyle}
            type="search"
          />
          <input
            aria-label="タグで絞り込み"
            defaultValue={selectedTag}
            name="tag"
            placeholder="タグで絞り込み"
            style={tagInputStyle}
            type="text"
          />
          <select aria-label="レビュー実行の並び順" defaultValue={selectedSort} name="sort" style={selectStyle}>
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select aria-label="1ページの表示件数" defaultValue={String(selectedPageSize)} name="pageSize" style={selectStyle}>
            {pageSizeOptions.map((option) => (
              <option key={option} value={String(option)}>
                {option} 件
              </option>
            ))}
          </select>
          <button style={searchButtonStyle} type="submit">
            検索
          </button>
          {isFiltered ? (
            <Link
              href={buildReviewListHref({
                pathname,
                status: "all",
                keyword: "",
                tag: "",
                showArchived: false,
                page: 1,
                pageSize: 10,
                sort: "createdAt_desc",
                compareLeft: selectedCompareIds[0] ?? "",
                compareRight: selectedCompareIds[1] ?? ""
              })}
              style={resetLinkStyle}
            >
              フィルタをリセット
            </Link>
          ) : null}
        </form>

        <div style={metadataSearchSummaryStyle}>
          <div style={{ display: "grid", gap: "0.28rem" }}>
            <p style={smallLabelStyle}>検索対象</p>
            <span style={{ color: "#5f4c3c", lineHeight: 1.55 }}>
              実行ID、タイトル、タグ、メモ、総評、最新ステップの文言を検索します。アーカイブ済みの実行は初期状態では非表示です。
            </span>
          </div>
          {selectedKeyword || selectedTag || selectedShowArchived ? (
            <div style={activeFilterWrapStyle}>
              {selectedKeyword ? (
                <span style={activeFilterPillStyle}>検索: {selectedKeyword}</span>
              ) : null}
              {selectedTag ? <span style={activeFilterPillStyle}>タグ: {selectedTag}</span> : null}
              {selectedShowArchived ? <span style={activeFilterPillStyle}>アーカイブを含む</span> : null}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          <p style={smallLabelStyle}>アーカイブ表示</p>
          <Link
            href={buildReviewListHref({
              pathname,
              status: selectedStatus,
              keyword: selectedKeyword,
              tag: selectedTag,
              showArchived: !selectedShowArchived,
              page: 1,
              pageSize: selectedPageSize,
              sort: selectedSort,
              compareLeft: selectedCompareIds[0] ?? "",
              compareRight: selectedCompareIds[1] ?? ""
            })}
            style={getQuickTagLinkStyle(selectedShowArchived)}
          >
            {selectedShowArchived ? "アーカイブを非表示" : "アーカイブを表示"}
          </Link>
        </div>

        {archiveFeedback ? <div style={archiveFeedbackStyle}>{archiveFeedback}</div> : null}

        {quickTagOptions.length > 0 ? (
          <div style={{ display: "grid", gap: "0.45rem" }}>
            <p style={smallLabelStyle}>よく使うタグ</p>
            <div style={tagWrapStyle}>
              {quickTagOptions.map((tag) => (
                <Link
                  key={tag}
                  href={buildReviewListHref({
                    pathname,
                    status: selectedStatus,
                    keyword: selectedKeyword,
                    tag,
                    showArchived: selectedShowArchived,
                    page: 1,
                    pageSize: selectedPageSize,
                    sort: selectedSort,
                    compareLeft: selectedCompareIds[0] ?? "",
                    compareRight: selectedCompareIds[1] ?? ""
                  })}
                  style={getQuickTagLinkStyle(tag === selectedTag)}
                >
                  {tag}
                </Link>
              ))}
              {selectedTag ? (
                <Link
                  href={buildReviewListHref({
                    pathname,
                    status: selectedStatus,
                    keyword: selectedKeyword,
                    tag: "",
                    showArchived: selectedShowArchived,
                    page: 1,
                    pageSize: selectedPageSize,
                    sort: selectedSort,
                    compareLeft: selectedCompareIds[0] ?? "",
                    compareRight: selectedCompareIds[1] ?? ""
                  })}
                  style={clearTagLinkStyle}
                >
                  タグを解除
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        <div style={compareBarStyle}>
          <div style={{ display: "grid", gap: "0.75rem", flex: "1 1 360px" }}>
            <div style={{ display: "grid", gap: "0.25rem" }}>
              <p style={smallLabelStyle}>比較</p>
              <span style={{ color: "#4a3a2c", lineHeight: 1.5 }}>
                {selectedCompareIds.length === 0
                  ? "比較したい実行を2件選択してください。"
                  : selectedCompareIds.length === 1
                    ? "もう1件選択すると比較できます。"
                    : "2件選択済みです。比較画面を開けます。"}
              </span>
            </div>
            <div style={selectedRunSlotsStyle}>
              <CompareSelectionSlot
                label="左枠"
                runId={selectedSlots[0]}
                onClear={
                  selectedSlots[0]
                    ? () => updateCompareSelection(selectedCompareIds.filter((value) => value !== selectedSlots[0]))
                    : undefined
                }
              />
              <CompareSelectionSlot
                label="右枠"
                runId={selectedSlots[1]}
                onClear={
                  selectedSlots[1]
                    ? () => updateCompareSelection(selectedCompareIds.filter((value) => value !== selectedSlots[1]))
                    : undefined
                }
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ color: "#6b5a47" }}>{selectedCompareIds.length}/2 件選択中</span>
            <button onClick={() => updateCompareSelection([])} style={secondaryButtonStyle} type="button">
              クリア
            </button>
            {compareHref ? (
              <Link href={compareHref} style={primaryLinkStyle}>
                2件比較
              </Link>
            ) : (
              <span style={disabledCompareStyle}>2件比較</span>
            )}
          </div>
        </div>
        </div>
      </header>

      {visibleItems.length === 0 ? (
        <article style={emptyStateStyle}>
          <p style={eyebrowStyle}>表示対象なし</p>
          <strong style={{ fontSize: "1.2rem" }}>
            {isFiltered ? "現在の条件に一致する実行はありません。" : "保存されたレビュー実行はまだありません。"}
          </strong>
          <p style={{ margin: "0.55rem 0 0", lineHeight: 1.7, color: "#5f4c3c", maxWidth: 680 }}>
            {isFiltered
              ? "キーワードを短くする、ステータスを全件に戻す、1ページ目に戻る、または現在の条件をリセットしてください。"
              : "トップページから最初のレビューを作成すると、ここでステータス、要約、ステップ進行を確認できます。"}
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
            <Link href="/" style={primaryLinkStyle}>
              レビューを作成
            </Link>
            {isFiltered ? (
              <Link
                href={buildReviewListHref({
                  pathname,
                  status: "all",
                  keyword: "",
                  tag: "",
                  showArchived: false,
                  page: 1,
                  pageSize: 10,
                  sort: "createdAt_desc",
                  compareLeft: selectedCompareIds[0] ?? "",
                  compareRight: selectedCompareIds[1] ?? ""
                })}
                style={linkStyle}
              >
                フィルタをリセット
              </Link>
            ) : null}
          </div>
        </article>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {visibleItems.map((item) => (
            <ReviewRunListCard
              key={item.id}
              item={item}
              isSelected={selectedCompareIds.includes(item.id)}
              archivePending={pendingArchiveItemIds.includes(item.id)}
              selectedSlotIndex={selectedCompareIds.indexOf(item.id)}
              onToggleArchive={() => onToggleArchive(item)}
              onToggleCompare={() => {
                updateCompareSelection(
                  selectedCompareIds.includes(item.id)
                    ? selectedCompareIds.filter((value) => value !== item.id)
                    : selectedCompareIds.length >= 2
                      ? [selectedCompareIds[1], item.id]
                      : [...selectedCompareIds, item.id]
                );
              }}
            />
          ))}
        </div>
      )}

      <PaginationControls
        page={list.page}
        pageSize={list.pageSize}
        totalPages={list.totalPages}
        total={list.total}
        status={selectedStatus}
        keyword={selectedKeyword}
        tag={selectedTag}
        showArchived={selectedShowArchived}
        sort={selectedSort}
        compareLeft={selectedCompareIds[0] ?? ""}
        compareRight={selectedCompareIds[1] ?? ""}
        pathname={pathname}
      />
    </section>
  );
}

function ReviewRunListCard(input: {
  item: ReviewListItemDto;
  isSelected: boolean;
  archivePending: boolean;
  selectedSlotIndex: number;
  onToggleArchive: () => void;
  onToggleCompare: () => void;
}) {
  const { item, isSelected, archivePending, onToggleArchive, onToggleCompare, selectedSlotIndex } = input;
  const preview = truncateText(item.executiveSummary ?? item.displaySummary, 180);
  const memoPreview = item.memo ? truncateText(item.memo, 120) : null;

  return (
    <article style={cardStyle}>
      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "minmax(0, 1.6fr) minmax(260px, 1fr)" }}>
        <div
          style={{
            display: "grid",
            gap: "0.95rem",
            padding: "1rem",
            borderRadius: 20,
            border: "1px solid rgba(111, 138, 164, 0.12)",
            background: "linear-gradient(180deg, rgba(250, 252, 255, 0.98), rgba(244, 248, 252, 0.92))"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ display: "grid", gap: "0.45rem" }}>
              <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
                <StatusBadge status={item.status} />
                {item.archived ? <span style={archivedPillStyle}>アーカイブ済み</span> : null}
                <span style={{ color: "#6b5a47" }}>作成: {formatTimestamp(item.createdAt)}</span>
              </div>
              <h2 style={{ margin: 0, fontSize: "1.15rem", wordBreak: "break-word" }}>
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
              {memoPreview ? (
                <div style={memoPreviewStyle}>
                  <p style={smallLabelStyle}>メモ</p>
                  <p style={{ margin: "0.38rem 0 0", color: "#4f4032", lineHeight: 1.6 }}>{memoPreview}</p>
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={onToggleCompare} style={getCompareSelectButtonStyle(isSelected)} type="button">
                {selectedSlotIndex === 0 ? "左に選択済み" : selectedSlotIndex === 1 ? "右に選択済み" : "選択"}
              </button>
              <button onClick={onToggleArchive} style={secondaryButtonStyle} type="button" disabled={archivePending}>
                {archivePending ? "更新中..." : item.archived ? "アーカイブ解除" : "アーカイブ"}
              </button>
              <Link href={`/reviews/${item.id}`} style={primaryLinkStyle}>
                詳細を見る
              </Link>
            </div>
          </div>

          <div style={summaryPanelStyle}>
            <p style={smallLabelStyle}>総評</p>
            <p style={{ margin: "0.4rem 0 0", lineHeight: 1.65 }}>{preview}</p>
          </div>
        </div>

        <div style={{ display: "grid", gap: "0.85rem" }}>
          <InfoRow label="最新ステップ" value={item.latestStepStatus?.stepName ?? "なし"} />
          <InfoRow
            label="最新ステップのステータス"
            valueNode={
              item.latestStepStatus ? (
                <div style={{ display: "grid", gap: "0.45rem" }}>
                  <StatusBadge status={item.latestStepStatus.status} />
                  {item.latestStepStatus.summaryText ? (
                    <span style={{ color: "#5f4c3c", lineHeight: 1.5 }}>{item.latestStepStatus.summaryText}</span>
                  ) : null}
                </div>
              ) : (
                <span>保留</span>
              )
            }
          />
          <InfoRow label="更新日時" value={formatTimestamp(item.updatedAt)} />
          <InfoRow label="入力画像" value={item.inputImageFileName ?? item.inputImagePath ?? "未保存"} />
          <InfoRow
            label="指摘件数"
            value={`${item.findingCount} 件`}
          />
        </div>
      </div>
    </article>
  );
}

function PaginationControls(input: {
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
  status: ReviewListStatusFilter;
  keyword: string;
  tag: string;
  showArchived: boolean;
  sort: ReviewListSort;
  compareLeft: string;
  compareRight: string;
  pathname: string;
}) {
  if (input.total === 0) {
    return null;
  }

  const previousPage = Math.max(1, input.page - 1);
  const nextPage = Math.min(input.totalPages, input.page + 1);

  return (
    <nav aria-label="レビュー一覧のページネーション" style={paginationWrapStyle}>
      <div style={{ color: "#5f4c3c", lineHeight: 1.6 }}>
        {input.page} / {input.totalPages} ページ
      </div>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <Link
          aria-disabled={input.page <= 1}
          href={buildReviewListHref({
            pathname: input.pathname,
            status: input.status,
            keyword: input.keyword,
            tag: input.tag,
            showArchived: input.showArchived,
            page: previousPage,
            pageSize: input.pageSize,
            sort: input.sort,
            compareLeft: input.compareLeft,
            compareRight: input.compareRight
          })}
          style={getPaginationLinkStyle(input.page <= 1)}
        >
          前へ
        </Link>
        <span style={{ color: "#5f4c3c", minWidth: 74, textAlign: "center" }}>{input.page}</span>
        <Link
          aria-disabled={input.page >= input.totalPages}
          href={buildReviewListHref({
            pathname: input.pathname,
            status: input.status,
            keyword: input.keyword,
            tag: input.tag,
            showArchived: input.showArchived,
            page: nextPage,
            pageSize: input.pageSize,
            sort: input.sort,
            compareLeft: input.compareLeft,
            compareRight: input.compareRight
          })}
          style={getPaginationLinkStyle(input.page >= input.totalPages)}
        >
          次へ
        </Link>
      </div>
    </nav>
  );
}

function CompareSelectionSlot(props: { label: string; runId: string | null; onClear?: () => void }) {
  return (
    <div style={compareSlotStyle}>
      <p style={smallLabelStyle}>{props.label}</p>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", alignItems: "center" }}>
        <span
          style={{
            color: props.runId ? "#2f2419" : "#8c7c6a",
            fontWeight: props.runId ? 700 : 500,
            wordBreak: "break-word"
          }}
        >
          {props.runId ?? "未選択"}
        </span>
        {props.runId && props.onClear ? (
          <button onClick={props.onClear} style={clearSlotButtonStyle} type="button">
            解除
          </button>
        ) : null}
      </div>
    </div>
  );
}

function InfoRow(props: { label: string; value?: string; valueNode?: ReactNode }) {
  return (
    <div>
      <p style={smallLabelStyle}>{props.label}</p>
      <div style={{ marginTop: "0.35rem", color: "#2f2419", lineHeight: 1.55 }}>
        {props.valueNode ?? props.value ?? "未設定"}
      </div>
    </div>
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
        padding: "0.38rem 0.8rem",
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
      {formatListStatusLabel(props.status)}
    </span>
  );
}

function getStatusTone(status: ReviewRunStatus | ReviewStepStatus) {
  const toneByStatus: Record<
    ReviewRunStatus | ReviewStepStatus,
    { background: string; color: string; border: string; dot: string; dotHalo: string; shadow: string }
  > = {
    draft: {
      background: "rgba(110, 99, 86, 0.16)",
      color: "#5d6c7c",
      border: "rgba(123, 142, 162, 0.24)",
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

function formatListStatusLabel(status: string) {
  const labels: Record<string, string> = {
    all: "すべて",
    completed: "完了",
    partial_success: "一部成功",
    failed: "失敗",
    skipped: "スキップ",
    success: "成功",
    warning: "注意",
    error: "エラー",
    running: "実行中",
    draft: "下書き",
    pending: "保留"
  };

  return labels[status] ?? status.replaceAll("_", " ");
}

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: "#4d78c9",
  fontSize: "0.8rem",
  textTransform: "uppercase",
  letterSpacing: "0.16em",
  fontWeight: 800
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

const cardStyle: CSSProperties = {
  padding: "1.35rem",
  borderRadius: 24,
  border: "1px solid rgba(111, 138, 164, 0.16)",
  background: "rgba(255, 255, 255, 0.98)",
  boxShadow: "0 14px 36px rgba(24, 48, 79, 0.05)"
};

const summaryPanelStyle: CSSProperties = {
  padding: "1rem 1.05rem",
  borderRadius: 18,
  border: "1px solid rgba(111, 138, 164, 0.14)",
  background: "linear-gradient(180deg, rgba(248, 251, 255, 0.96), rgba(243, 248, 253, 0.92))"
};

const memoPreviewStyle: CSSProperties = {
  padding: "0.9rem 1rem",
  borderRadius: 18,
  border: "1px solid rgba(109, 164, 174, 0.16)",
  background: "linear-gradient(145deg, rgba(245, 251, 252, 0.98), rgba(238, 247, 249, 0.92))"
};

const emptyStateStyle: CSSProperties = {
  padding: "1.5rem",
  borderRadius: 24,
  border: "1px solid rgba(111, 138, 164, 0.14)",
  background: "linear-gradient(145deg, rgba(255, 255, 255, 0.98), rgba(246, 250, 254, 0.94))",
  boxShadow: "0 16px 38px rgba(28, 58, 92, 0.05)"
};

const linkStyle: CSSProperties = {
  color: "#2f6fed",
  fontWeight: 700,
  textDecoration: "none"
};

const primaryLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  padding: "0.76rem 1.08rem",
  borderRadius: 999,
  background: "linear-gradient(135deg, #2f6fed, #245dd1)",
  color: "#f8fbff",
  fontWeight: 700,
  textDecoration: "none",
  boxShadow: "0 12px 28px rgba(47, 111, 237, 0.24)"
};

const searchBarStyle: CSSProperties = {
  display: "flex",
  gap: "0.75rem",
  flexWrap: "wrap",
  alignItems: "center"
};

const searchInputStyle: CSSProperties = {
  flex: "1 1 320px",
  minWidth: 0,
  padding: "0.78rem 0.95rem",
  borderRadius: 14,
  border: "1px solid rgba(111, 138, 164, 0.18)",
  background: "rgba(255, 255, 255, 0.98)",
  color: "#21303f",
  boxShadow: "inset 0 1px 2px rgba(36, 76, 120, 0.04)"
};

const tagInputStyle: CSSProperties = {
  padding: "0.78rem 0.95rem",
  borderRadius: 14,
  border: "1px solid rgba(111, 138, 164, 0.18)",
  background: "rgba(255, 255, 255, 0.98)",
  color: "#21303f",
  minWidth: 180
};

const selectStyle: CSSProperties = {
  padding: "0.78rem 0.95rem",
  borderRadius: 14,
  border: "1px solid rgba(111, 138, 164, 0.18)",
  background: "rgba(255, 255, 255, 0.98)",
  color: "#21303f"
};

const searchButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0.78rem 1rem",
  borderRadius: 14,
  border: "1px solid rgba(47, 111, 237, 0.16)",
  background: "rgba(47, 111, 237, 0.1)",
  color: "#245dd1",
  fontWeight: 700,
  cursor: "pointer"
};

const resetLinkStyle: CSSProperties = {
  color: "#5f7288",
  fontWeight: 700,
  textDecoration: "none"
};

const workbenchControlsStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
  padding: "1.1rem",
  borderRadius: 24,
  border: "1px solid rgba(111, 138, 164, 0.14)",
  background: "linear-gradient(180deg, rgba(248, 251, 255, 0.98), rgba(242, 247, 252, 0.95))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)"
};

const compareBarStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
  alignItems: "center",
  position: "sticky",
  top: 16,
  zIndex: 2,
  padding: "1rem 1.1rem",
  borderRadius: 20,
  border: "1px solid rgba(47, 111, 237, 0.14)",
  background: "rgba(255, 255, 255, 0.96)",
  boxShadow: "0 16px 28px rgba(28, 58, 92, 0.08)"
};

const metadataSearchSummaryStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "0.9rem",
  flexWrap: "wrap",
  alignItems: "center",
  padding: "0.9rem 1rem",
  borderRadius: 16,
  border: "1px solid rgba(111, 138, 164, 0.12)",
  background: "rgba(255, 255, 255, 0.78)"
};

const activeFilterWrapStyle: CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  flexWrap: "wrap"
};

const activeFilterPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.28rem 0.62rem",
  borderRadius: 999,
  background: "rgba(47, 111, 237, 0.08)",
  color: "#31506d",
  fontSize: "0.84rem",
  fontWeight: 700
};

const archiveFeedbackStyle: CSSProperties = {
  padding: "0.85rem 1rem",
  borderRadius: 16,
  border: "1px solid rgba(111, 138, 164, 0.14)",
  background: "rgba(255, 255, 255, 0.92)",
  color: "#486173",
  lineHeight: 1.55
};

const selectedRunSlotsStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))"
};

const compareSlotStyle: CSSProperties = {
  display: "grid",
  gap: "0.45rem",
  padding: "0.85rem 0.9rem",
  borderRadius: 16,
  border: "1px solid rgba(111, 138, 164, 0.14)",
  background: "rgba(255, 255, 255, 0.9)"
};

const secondaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0.72rem 0.95rem",
  borderRadius: 999,
  border: "1px solid rgba(111, 138, 164, 0.16)",
  background: "rgba(255, 255, 255, 0.96)",
  color: "#334658",
  fontWeight: 700,
  cursor: "pointer"
};

const clearSlotButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0.4rem 0.7rem",
  borderRadius: 999,
  border: "1px solid rgba(111, 138, 164, 0.16)",
  background: "rgba(255, 255, 255, 0.96)",
  color: "#334658",
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap"
};

const disabledCompareStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0.72rem 0.95rem",
  borderRadius: 999,
  background: "rgba(222, 231, 240, 0.88)",
  color: "#8a9caf",
  fontWeight: 700
};

const paginationWrapStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
  alignItems: "center",
  paddingTop: "0.25rem"
};

function getFilterLinkStyle(isActive: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.56rem 0.9rem",
    borderRadius: 999,
    border: `1px solid ${isActive ? "rgba(47, 111, 237, 0.22)" : "rgba(111, 138, 164, 0.14)"}`,
    background: isActive ? "rgba(47, 111, 237, 0.1)" : "rgba(255, 255, 255, 0.94)",
    color: isActive ? "#245dd1" : "#3e5368",
    textDecoration: "none",
    fontWeight: isActive ? 700 : 600,
    boxShadow: isActive ? "0 10px 22px rgba(47, 111, 237, 0.12)" : "none"
  };
}

function getQuickTagLinkStyle(isActive: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.32rem 0.68rem",
    borderRadius: 999,
    border: `1px solid ${isActive ? "rgba(22, 151, 166, 0.22)" : "rgba(111, 138, 164, 0.12)"}`,
    background: isActive ? "rgba(22, 151, 166, 0.12)" : "rgba(255, 255, 255, 0.94)",
    color: isActive ? "#0d7682" : "#446077",
    textDecoration: "none",
    fontWeight: 700,
    fontSize: "0.85rem"
  };
}

const clearTagLinkStyle: CSSProperties = {
  color: "#5f7288",
  fontWeight: 700,
  textDecoration: "none",
  alignSelf: "center"
};

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function buildReviewListHref(input: {
  pathname?: string;
  status: ReviewListStatusFilter;
  keyword: string;
  tag: string;
  showArchived: boolean;
  page: number;
  pageSize: number;
  sort: ReviewListSort;
  compareLeft: string;
  compareRight: string;
}) {
  const params = new URLSearchParams();

  if (input.status !== "all") {
    params.set("status", input.status);
  }

  if (input.keyword.trim()) {
    params.set("keyword", input.keyword.trim());
  }

  if (input.tag.trim()) {
    params.set("tag", input.tag.trim());
  }

  if (input.showArchived) {
    params.set("showArchived", "true");
  }

  if (input.page > 1) {
    params.set("page", String(input.page));
  }

  if (input.pageSize !== 10) {
    params.set("pageSize", String(input.pageSize));
  }

  if (input.sort !== "createdAt_desc") {
    params.set("sort", input.sort);
  }

  if (input.compareLeft.trim()) {
    params.set("compareLeft", input.compareLeft.trim());
  }

  if (input.compareRight.trim()) {
    params.set("compareRight", input.compareRight.trim());
  }

  const query = params.toString();
  const pathname = input.pathname || "/reviews";
  return query ? `${pathname}?${query}` : pathname;
}

function getPaginationLinkStyle(isDisabled: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 92,
    padding: "0.72rem 0.95rem",
    borderRadius: 999,
    border: "1px solid rgba(111, 138, 164, 0.14)",
    background: isDisabled ? "rgba(225, 233, 242, 0.86)" : "rgba(255, 255, 255, 0.96)",
    color: isDisabled ? "#8ea0b4" : "#3b5268",
    textDecoration: "none",
    pointerEvents: isDisabled ? "none" : "auto",
    fontWeight: 700
  };
}

function getCompareSelectButtonStyle(isSelected: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 114,
    padding: "0.72rem 0.95rem",
    borderRadius: 999,
    border: `1px solid ${isSelected ? "rgba(47, 111, 237, 0.24)" : "rgba(111, 138, 164, 0.14)"}`,
    background: isSelected ? "rgba(47, 111, 237, 0.1)" : "rgba(255, 255, 255, 0.96)",
    color: isSelected ? "#245dd1" : "#3b5268",
    fontWeight: 700,
    cursor: "pointer"
  };
}
