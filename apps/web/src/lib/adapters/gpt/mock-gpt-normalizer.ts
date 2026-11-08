import { createResponseEnvelope } from "@/lib/adapters/provider-runtime";
import type {
  GptNormalizeExecution,
  GptNormalizeInput,
  GptNormalizer,
  GptReviewPlan
} from "@/lib/adapters/gpt/types";

export class MockGptNormalizer implements GptNormalizer {
  async normalize(input: GptNormalizeInput): Promise<GptNormalizeExecution> {
    const topIssue = input.geminiReview.issues[0];
    const isFigmaSupplement = input.reviewFocus === "figma_supplement";
    const selectedIssues = input.geminiReview.issues.slice(0, isFigmaSupplement ? 1 : 2);

    const output: GptReviewPlan = {
      executiveSummary: isFigmaSupplement
        ? "Figma コンテキストに沿って、実装前に確認すべき補足所見を整理しました。"
        : `まずは「${topIssue?.title ?? "主要 UI/UX 課題"}」への対応を優先し、保存済みナレッジの前提と整合する形で導線の分かりやすさを整えるのが妥当です。`,
      priorities: selectedIssues.map((issue, index) => ({
        priority: index === 0 ? "p1" : "p2",
        title: issue.title,
        whyItMatters: issue.reason
      })),
      actions: selectedIssues.map((issue) => ({
        target: isFigmaSupplement ? "figma" : "ui",
        action: issue.suggestion
      }))
    };

    return {
      output,
      rawRequest: createResponseEnvelope({
        providerName: "openai",
        providerMode: "mock",
        model: "mock-gpt-normalizer",
        payload: input
      }),
      rawResponse: createResponseEnvelope({
        providerName: "openai",
        providerMode: "mock",
        model: "mock-gpt-normalizer",
        payload: output
      }),
      providerMode: "mock",
      providerName: "openai",
      model: "mock-gpt-normalizer"
    };
  }
}
