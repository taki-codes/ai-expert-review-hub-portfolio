import type { ProviderMode } from "@/lib/adapters/provider-runtime";

export type FigmaTargetKind = "file" | "node" | "frame";

export type FigmaContextRequest = {
  reviewRunId: string;
  figmaUrl: string;
};

export type FigmaRawContext = {
  source: "figma";
  mode?: ProviderMode;
  providerName?: string;
  fileKey: string;
  fileName: string;
  target: {
    kind: FigmaTargetKind;
    nodeId: string | null;
    frameId: string | null;
  };
  originalUrl: string;
  retrievedAt: string;
  file?: {
    name: string;
    lastModified: string | null;
    version: string | null;
    editorType: string | null;
    linkAccess: string | null;
    role: string | null;
    thumbnailUrl: string | null;
  };
  node?: {
    id: string;
    name: string | null;
    type: string | null;
    childCount: number;
    absoluteBoundingBox:
      | {
          x: number;
          y: number;
          width: number;
          height: number;
        }
      | null;
  } | null;
  selection?: {
    endpoint: "file" | "file_nodes";
    depth: number;
  };
  apiResponse?: unknown;
};

export type FigmaContextResult = {
  rawContext: FigmaRawContext;
  summaryText: string;
};

export interface FigmaContextReader {
  readContext(input: FigmaContextRequest): Promise<FigmaContextResult>;
}
