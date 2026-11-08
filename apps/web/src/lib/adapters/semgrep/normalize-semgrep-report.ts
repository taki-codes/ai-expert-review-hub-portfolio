import type {
  NormalizedReviewFinding,
  SemgrepJsonReport,
  SemgrepJsonResult,
  SemgrepMode
} from "@/lib/adapters/semgrep/types";

export function normalizeSemgrepReport(input: {
  mode: SemgrepMode;
  rawJson: SemgrepJsonReport;
}) {
  const findings = (input.rawJson.results ?? []).map((result) => normalizeSemgrepFinding(result));
  const scannedPaths = input.rawJson.paths?.scanned ?? [];
  const errorCount = input.rawJson.errors?.length ?? 0;

  return {
    findings,
    scannedPaths,
    summaryText: buildSemgrepSummary({
      mode: input.mode,
      findingCount: findings.length,
      scannedPathCount: scannedPaths.length,
      errorCount
    })
  };
}

function normalizeSemgrepFinding(result: SemgrepJsonResult): NormalizedReviewFinding {
  const message = result.extra?.message?.trim() || "Semgrep が指摘を検出しました。";
  const severity = mapSemgrepSeverity(result.extra?.severity);
  const fix = result.extra?.fix?.trim();
  const metadata = result.extra?.metadata ?? {};
  const category = extractCategory(metadata);
  const title = result.check_id?.trim() || firstSentence(message);
  const targetRef = buildTargetRef(result.path, result.start?.line);

  return {
    sourceTool: "semgrep",
    category,
    severity,
    title,
    description: message,
    reason: message,
    suggestion: fix || "該当コードパスを確認し、Semgrep ルールの修正指針に沿って対応してください。",
    targetRef,
    confidence: mapConfidence(metadata["confidence"])
  };
}

function mapSemgrepSeverity(value?: string) {
  const normalized = value?.toUpperCase();

  if (normalized === "ERROR" || normalized === "HIGH") {
    return "high";
  }

  if (normalized === "WARNING" || normalized === "MEDIUM") {
    return "medium";
  }

  return "low";
}

function extractCategory(metadata: Record<string, unknown>) {
  const category = metadata["category"];

  if (typeof category === "string" && category.trim()) {
    return category.trim().toLowerCase().replace(/\s+/g, "_");
  }

  return "security";
}

function buildTargetRef(filePath?: string, line?: number) {
  if (!filePath) {
    return null;
  }

  return typeof line === "number" ? `${filePath}:${line}` : filePath;
}

function mapConfidence(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toUpperCase();

  if (normalized === "HIGH") {
    return 0.9;
  }

  if (normalized === "MEDIUM") {
    return 0.75;
  }

  if (normalized === "LOW") {
    return 0.6;
  }

  return null;
}

function buildSemgrepSummary(input: {
  mode: SemgrepMode;
  findingCount: number;
  scannedPathCount: number;
  errorCount: number;
}) {
  const scanPart = input.scannedPathCount > 0 ? `、${input.scannedPathCount} 件の対象パスを確認` : "";
  const errorPart = input.errorCount > 0 ? `、Semgrep エラー ${input.errorCount} 件あり` : "";

  return `[${input.mode}] Semgrep の指摘を ${input.findingCount} 件取り込みました${scanPart}${errorPart}。`;
}

function firstSentence(value: string) {
  const first = value.split(".")[0]?.trim();
  return first || value;
}
