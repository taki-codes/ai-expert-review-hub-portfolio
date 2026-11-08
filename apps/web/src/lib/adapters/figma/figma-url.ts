import type { FigmaRawContext, FigmaTargetKind } from "@/lib/adapters/figma/types";

export type ParsedFigmaUrl = {
  fileKey: string;
  nodeId: string | null;
  targetKind: FigmaTargetKind;
};

export function parseFigmaUrl(figmaUrl: string): ParsedFigmaUrl {
  let url: URL;

  try {
    url = new URL(figmaUrl);
  } catch {
    throw new Error("Figma URL is invalid: provide a valid figma.com file, design, or proto URL.");
  }

  if (!/(\.|^)figma\.com$/i.test(url.hostname)) {
    throw new Error("Figma URL is invalid: provide a valid figma.com file, design, or proto URL.");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const fileSegmentIndex = segments.findIndex(
    (segment) => segment === "file" || segment === "design" || segment === "proto"
  );

  if (fileSegmentIndex === -1 || !segments[fileSegmentIndex + 1]) {
    throw new Error("Figma URL is invalid: file key could not be resolved from the URL.");
  }

  const fileKey = segments[fileSegmentIndex + 1];
  const nodeId = decodeNodeId(url.searchParams.get("node-id"));
  const targetKind = resolveTargetKind(url, nodeId);

  return {
    fileKey,
    nodeId,
    targetKind
  };
}

export function buildFigmaSummary(rawContext: FigmaRawContext) {
  const fileLabel = `${rawContext.fileName} (${rawContext.fileKey})`;
  const targetName = rawContext.node?.name?.trim() || rawContext.target.nodeId || rawContext.target.frameId;

  if (rawContext.target.kind === "file") {
    return `Read-only Figma context captured for file ${fileLabel}.`;
  }

  if (rawContext.target.kind === "frame") {
    return `Read-only Figma context captured for frame ${targetName ?? "unknown"} in file ${fileLabel}.`;
  }

  return `Read-only Figma context captured for node ${targetName ?? "unknown"} in file ${fileLabel}.`;
}

function decodeNodeId(nodeId: string | null) {
  if (!nodeId) {
    return null;
  }

  return nodeId.replace(/-/g, ":");
}

function resolveTargetKind(url: URL, nodeId: string | null): FigmaTargetKind {
  const explicitTarget = url.searchParams.get("target");

  if (explicitTarget === "frame") {
    return "frame";
  }

  if (explicitTarget === "file" || !nodeId) {
    return "file";
  }

  if (url.searchParams.get("view") === "frame") {
    return "frame";
  }

  return "node";
}
