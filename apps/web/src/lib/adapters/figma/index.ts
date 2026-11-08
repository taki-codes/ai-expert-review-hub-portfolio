import { MockFigmaContextReader } from "@/lib/adapters/figma/mock-figma-context-reader";
import { RealFigmaContextReader, loadFigmaConfig } from "@/lib/adapters/figma/real-figma-context-reader";
import type { FigmaContextReader } from "@/lib/adapters/figma/types";
import { resolveProviderMode } from "@/lib/adapters/provider-runtime";

export function createFigmaContextReader(): FigmaContextReader {
  const mode = resolveProviderMode({
    providerDisplayName: "Figma",
    envValue: process.env.FIGMA_ADAPTER_MODE
  });

  if (mode === "mock") {
    return new MockFigmaContextReader();
  }

  const config = loadFigmaConfig(mode);

  if (!config.accessToken) {
    throw new Error("[real:read-only] Figma read-only context lookup requires FIGMA_ACCESS_TOKEN to be set.");
  }

  return new RealFigmaContextReader(config);
}
