import { ReviewRunList } from "@/components/review-run-list";
import { normalizeReviewCompareId } from "@/lib/contracts/review-compare";
import {
  getReviewList
} from "@/lib/storage/review-repository";
import {
  isReviewListStatusFilter,
  isReviewListSort,
  normalizeReviewListTag,
  normalizeReviewListShowArchived,
  normalizeReviewListPage,
  normalizeReviewListPageSize,
  type ReviewListSort,
  type ReviewListStatusFilter
} from "@/lib/contracts/review-list";

export default async function ReviewRunsPage({
  searchParams
}: {
  searchParams: Promise<{
    status?: string;
    keyword?: string;
    tag?: string;
    showArchived?: string;
    page?: string;
    pageSize?: string;
    sort?: string;
    compareLeft?: string;
    compareRight?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const selectedStatus = resolveStatusFilter(resolvedSearchParams.status);
  const keyword = resolveKeywordFilter(resolvedSearchParams.keyword);
  const tag = resolveTagFilter(resolvedSearchParams.tag);
  const showArchived = resolveShowArchivedFilter(resolvedSearchParams.showArchived);
  const page = normalizeReviewListPage(resolvedSearchParams.page);
  const pageSize = resolvePageSize(resolvedSearchParams.pageSize);
  const sort = resolveSort(resolvedSearchParams.sort);
  const selectedCompareIds = resolveCompareSelection(
    resolvedSearchParams.compareLeft,
    resolvedSearchParams.compareRight
  );
  const list = await getReviewList(selectedStatus, keyword, tag, showArchived, page, pageSize, sort);

  return (
    <main>
      <ReviewRunList
        initialSelectedCompareIds={selectedCompareIds}
        list={list}
        selectedStatus={selectedStatus}
        selectedKeyword={keyword}
        selectedTag={tag}
        selectedShowArchived={showArchived}
        selectedPageSize={pageSize}
        selectedSort={sort}
      />
    </main>
  );
}

function resolveStatusFilter(status: string | undefined): ReviewListStatusFilter {
  if (!status) {
    return "all";
  }

  return isReviewListStatusFilter(status) ? status : "all";
}

function resolveKeywordFilter(keyword: string | undefined) {
  return keyword?.trim() ?? "";
}

function resolveTagFilter(tag: string | undefined) {
  return normalizeReviewListTag(tag);
}

function resolveShowArchivedFilter(showArchived: string | undefined) {
  return normalizeReviewListShowArchived(showArchived);
}

function resolvePageSize(pageSize: string | undefined) {
  return Math.min(50, normalizeReviewListPageSize(pageSize));
}

function resolveSort(sort: string | undefined): ReviewListSort {
  if (!sort) {
    return "createdAt_desc";
  }

  return isReviewListSort(sort) ? sort : "createdAt_desc";
}

function resolveCompareSelection(left: string | undefined, right: string | undefined) {
  const normalized = [normalizeReviewCompareId(left), normalizeReviewCompareId(right)].filter(Boolean);
  return Array.from(new Set(normalized)).slice(0, 2);
}
