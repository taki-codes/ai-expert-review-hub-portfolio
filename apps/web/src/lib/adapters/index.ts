import { MockGeminiReviewer } from "@/lib/adapters/gemini/mock-gemini-reviewer";
import { RealGeminiReviewer, loadGeminiConfig } from "@/lib/adapters/gemini/real-gemini-reviewer";
import type { GeminiReviewer } from "@/lib/adapters/gemini/types";
import { MockGptNormalizer } from "@/lib/adapters/gpt/mock-gpt-normalizer";
import { RealGptNormalizer, loadOpenAiConfig } from "@/lib/adapters/gpt/real-gpt-normalizer";
import type { GptNormalizer } from "@/lib/adapters/gpt/types";
import { createFigmaContextReader as createFigmaContextReaderByMode } from "@/lib/adapters/figma";
import type { FigmaContextReader } from "@/lib/adapters/figma/types";
import { createCodeqlRunner as createCodeqlRunnerByMode } from "@/lib/adapters/codeql";
import type { CodeqlMode, CodeqlRunner } from "@/lib/adapters/codeql/types";
import { createSemgrepRunner as createSemgrepRunnerByMode } from "@/lib/adapters/semgrep";
import type { SemgrepMode, SemgrepRunner } from "@/lib/adapters/semgrep/types";
import { createZapRunner as createZapRunnerByMode } from "@/lib/adapters/zap";
import type { ZapMode, ZapRunner } from "@/lib/adapters/zap/types";
import { resolveProviderMode } from "@/lib/adapters/provider-runtime";

export function createGeminiReviewer(): GeminiReviewer {
  const mode = resolveProviderMode({
    providerDisplayName: "Gemini",
    envValue: process.env.GEMINI_ADAPTER_MODE
  });

  if (mode === "mock") {
    return new MockGeminiReviewer();
  }

  const config = loadGeminiConfig(mode);

  if (!config.apiKey) {
    throw new Error(`[real:${config.model}] Gemini requires GEMINI_API_KEY to be set.`);
  }

  return new RealGeminiReviewer(config);
}

export function createGptNormalizer(): GptNormalizer {
  const mode = resolveProviderMode({
    providerDisplayName: "GPT",
    envValue: process.env.GPT_ADAPTER_MODE
  });

  if (mode === "mock") {
    return new MockGptNormalizer();
  }

  const config = loadOpenAiConfig(mode);

  if (!config.apiKey) {
    throw new Error(`[real:${config.model}] GPT normalization requires OPENAI_API_KEY to be set.`);
  }

  return new RealGptNormalizer(config);
}

export function createFigmaContextReader(): FigmaContextReader {
  return createFigmaContextReaderByMode();
}

export function createSemgrepRunner(mode: SemgrepMode): SemgrepRunner {
  return createSemgrepRunnerByMode(mode);
}

export function createZapRunner(mode: ZapMode): ZapRunner {
  return createZapRunnerByMode(mode);
}

export function createCodeqlRunner(mode: CodeqlMode): CodeqlRunner {
  return createCodeqlRunnerByMode(mode);
}
