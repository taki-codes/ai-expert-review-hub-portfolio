import { NextResponse } from "next/server";
import { getReviewDetail, updateReviewRunArchiveState } from "@/lib/storage/review-repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reviewRunId: string }> }
) {
  const { reviewRunId } = await params;
  const detail = await getReviewDetail(reviewRunId);

  if (!detail) {
    return NextResponse.json({ error: "review run not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ reviewRunId: string }> }
) {
  const { reviewRunId } = await params;
  const payload = (await request.json().catch(() => null)) as { archived?: unknown } | null;

  if (typeof payload?.archived !== "boolean") {
    return NextResponse.json({ error: "archived must be a boolean" }, { status: 400 });
  }

  const updated = await updateReviewRunArchiveState(reviewRunId, payload.archived);

  if (!updated) {
    return NextResponse.json({ error: "review run not found" }, { status: 404 });
  }

  return NextResponse.json({
    reviewRunId: updated.id,
    archived: updated.archived
  });
}
