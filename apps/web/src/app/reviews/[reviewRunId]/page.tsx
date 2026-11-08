import { notFound } from "next/navigation";
import { ReviewRunDetail } from "@/components/review-run-detail";
import { getReviewDetail } from "@/lib/storage/review-repository";

export default async function ReviewRunPage({
  params
}: {
  params: Promise<{ reviewRunId: string }>;
}) {
  const { reviewRunId } = await params;
  const detail = await getReviewDetail(reviewRunId);

  if (!detail) {
    notFound();
  }

  return (
    <main>
      <ReviewRunDetail detail={detail} artifactsHref={`/reviews/${encodeURIComponent(detail.run.id)}/artifacts`} />
    </main>
  );
}
