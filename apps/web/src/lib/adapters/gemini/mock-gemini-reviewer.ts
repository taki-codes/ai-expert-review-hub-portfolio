import { createResponseEnvelope } from "@/lib/adapters/provider-runtime";
import type {
  GeminiReviewExecution,
  GeminiReviewInput,
  GeminiReviewResult,
  GeminiReviewer
} from "@/lib/adapters/gemini/types";

export class MockGeminiReviewer implements GeminiReviewer {
  async review(input: GeminiReviewInput): Promise<GeminiReviewExecution> {
    const mentionsForm = /form|signup|register|input/i.test(input.explanatoryText);
    const output: GeminiReviewResult = {
      overallScore: 74,
      summary: "主要導線の視認性と画面上部の情報整理に改善余地があるため、初見ユーザー向けの分かりやすさを優先して見直すべきです。",
      issues: [
        {
          category: "cta",
          severity: "medium",
          title: "主要アクションが視線を集めきれていません",
          reason: "初めて訪れたユーザーにとって、最初に押してほしい操作が周辺要素に埋もれて見えやすい状態です。",
          suggestion: "主要ボタンのコントラストと余白を強め、近くの競合要素の強調を少し抑えてください。"
        },
        {
          category: mentionsForm ? "form" : "visual_hierarchy",
          severity: "low",
          title: mentionsForm
            ? "フォーム入力の案内がやや弱く見えます"
            : "ファーストビューの情報優先度を整理できます",
          reason: mentionsForm
            ? "入力を急ぐユーザーにとって、重要な補足や入力方針が見落とされやすい可能性があります。"
            : "画面のどこから見ればよいかを把握するまでに、ユーザーが一呼吸必要になる構成です。",
          suggestion: mentionsForm
            ? "項目グループを明確にし、補助テキストや主要ラベルを強めて入力の流れを案内してください。"
            : "見出しの強弱をはっきりさせ、ファーストビュー内の視覚競合を減らしてください。"
        }
      ]
    };

    return {
      output,
      rawRequest: createResponseEnvelope({
        providerName: "gemini",
        providerMode: "mock",
        model: "mock-gemini-reviewer",
        payload: input
      }),
      rawResponse: createResponseEnvelope({
        providerName: "gemini",
        providerMode: "mock",
        model: "mock-gemini-reviewer",
        payload: output
      }),
      providerMode: "mock",
      providerName: "gemini",
      model: "mock-gemini-reviewer"
    };
  }
}
