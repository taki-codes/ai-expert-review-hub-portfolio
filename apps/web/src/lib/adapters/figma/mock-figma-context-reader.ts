import type {
  FigmaContextReader,
  FigmaContextRequest,
  FigmaContextResult,
  FigmaRawContext
} from "@/lib/adapters/figma/types";
import { buildFigmaSummary, parseFigmaUrl } from "@/lib/adapters/figma/figma-url";

export class MockFigmaContextReader implements FigmaContextReader {
  async readContext(input: FigmaContextRequest): Promise<FigmaContextResult> {
    const parsed = parseFigmaUrl(input.figmaUrl);
    const rawContext: FigmaRawContext = {
      source: "figma",
      mode: "mock",
      providerName: "figma-mock",
      fileKey: parsed.fileKey,
      fileName: `Mock Figma file ${parsed.fileKey.slice(0, 8)}`,
      target: {
        kind: parsed.targetKind,
        nodeId: parsed.nodeId,
        frameId: parsed.targetKind === "frame" ? parsed.nodeId : null
      },
      originalUrl: input.figmaUrl,
      retrievedAt: new Date().toISOString(),
      file: {
        name: `Mock Figma file ${parsed.fileKey.slice(0, 8)}`,
        lastModified: null,
        version: null,
        editorType: "figma",
        linkAccess: "view",
        role: "viewer",
        thumbnailUrl: null
      },
      node: parsed.nodeId
        ? {
            id: parsed.nodeId,
            name: parsed.targetKind === "frame" ? "Mock frame" : "Mock node",
            type: parsed.targetKind === "frame" ? "FRAME" : "COMPONENT",
            childCount: 0,
            absoluteBoundingBox: null
          }
        : null,
      selection: {
        endpoint: parsed.nodeId ? "file_nodes" : "file",
        depth: 2
      },
      apiResponse: {
        mock: true,
        fileKey: parsed.fileKey,
        nodeId: parsed.nodeId
      }
    };

    return {
      rawContext,
      summaryText: buildFigmaSummary(rawContext)
    };
  }
}
