import { NextResponse } from "next/server";
import { normalizeReviewCompareId } from "@/lib/contracts/review-compare";
import { getReviewCompare } from "@/lib/storage/review-repository";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const left = normalizeReviewCompareId(searchParams.get("left"));
  const right = normalizeReviewCompareId(searchParams.get("right"));

  if (!left || !right) {
    return NextResponse.json(
      { error: "left and right review run ids are required" },
      { status: 400 }
    );
  }

  if (left === right) {
    return NextResponse.json(
      { error: "left and right review run ids must be different" },
      { status: 400 }
    );
  }

  const compare = await getReviewCompare(left, right);

  if (!compare) {
    return NextResponse.json({ error: "one or both review runs were not found" }, { status: 404 });
  }

  return NextResponse.json(compare);
}
