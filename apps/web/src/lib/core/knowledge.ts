import type { KnowledgeSummarySnapshot } from "@/lib/core/review-types";

export function buildKnowledgeSummarySnapshot(options: { notebookId?: string }): KnowledgeSummarySnapshot {
  const resolvedNotebookId = options.notebookId ?? process.env.DEFAULT_NOTEBOOK_ID ?? null;
  const summary = resolvedNotebookId
    ? `Knowledge summary snapshot for notebook ${resolvedNotebookId}. Focus on CTA clarity, navigation clarity, and accessibility risks.`
    : "Default MVP knowledge summary. Focus on layout clarity, CTA clarity, form usability, and accessibility risks.";

  return {
    notebookId: resolvedNotebookId,
    summary,
    source: options.notebookId ? "request-default" : "env-default",
    capturedAt: new Date().toISOString()
  };
}
