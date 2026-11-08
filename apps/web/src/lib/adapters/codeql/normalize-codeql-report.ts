import type {
  CodeqlMode,
  CodeqlNormalizedJsonReport,
  CodeqlRawReport,
  CodeqlSarifReport,
  CodeqlSarifResult,
  CodeqlSarifRule,
  NormalizedCodeqlFinding
} from "@/lib/adapters/codeql/types";

export function normalizeCodeqlReport(input: {
  mode: CodeqlMode;
  reportFileName: string;
  rawJson: CodeqlRawReport;
}) {
  const findings =
    input.mode === "sarif_ingest"
      ? normalizeSarifFindings(input.rawJson as CodeqlSarifReport)
      : normalizeJsonFindings(input.rawJson as CodeqlNormalizedJsonReport);

  return {
    findings,
    alertCount: findings.length,
    summaryText: `[${input.mode}] ${input.reportFileName} から CodeQL の指摘を ${findings.length} 件取り込みました。`
  };
}

function normalizeSarifFindings(report: CodeqlSarifReport): NormalizedCodeqlFinding[] {
  const runs = readOptionalArray(report.runs, "CodeQL SARIF report is invalid: `runs` must be an array.");

  return runs.flatMap((run) => {
    const rules = readOptionalArray(
      run.tool?.driver?.rules,
      "CodeQL SARIF report is invalid: `runs[].tool.driver.rules` must be an array."
    );
    const results = readOptionalArray(
      run.results,
      "CodeQL SARIF report is invalid: `runs[].results` must be an array."
    );
    const ruleMap = new Map(rules.map((rule) => [rule.id ?? "", rule]));

    return results.map((result) => normalizeSarifResult(result, ruleMap.get(result.ruleId ?? "")));
  });
}

function normalizeSarifResult(
  result: CodeqlSarifResult,
  rule: CodeqlSarifRule | undefined
): NormalizedCodeqlFinding {
  const message = result.message?.text?.trim() || rule?.shortDescription?.text?.trim() || "CodeQL が指摘を検出しました。";
  const fullDescription = rule?.fullDescription?.text?.trim() || null;
  const helpText = rule?.help?.text?.trim();
  const location = result.locations?.[0]?.physicalLocation;
  const uri = location?.artifactLocation?.uri;
  const line = location?.region?.startLine;
  const targetRef = uri ? (typeof line === "number" ? `${uri}:${line}` : uri) : null;
  const category = rule?.properties?.tags?.[0]?.trim().toLowerCase().replace(/\s+/g, "_") || "security";

  return {
    sourceTool: "codeql",
    category,
    severity: mapCodeqlSeverity(result.level, rule?.properties?.["security-severity"]),
    title: rule?.name?.trim() || result.ruleId?.trim() || firstSentence(message),
    description: fullDescription ?? message,
    reason: message,
    suggestion: helpText || "CodeQL の結果を確認し、該当箇所の修正ガイダンスに沿って対応してください。",
    targetRef,
    confidence: mapCodeqlConfidence(rule?.properties?.precision)
  };
}

function normalizeJsonFindings(report: CodeqlNormalizedJsonReport): NormalizedCodeqlFinding[] {
  const findings = readOptionalArray(
    report.findings,
    "CodeQL JSON report is invalid: `findings` must be an array."
  );

  return findings.map((finding) => ({
    sourceTool: "codeql",
    category: finding.category?.trim() || "security",
    severity: mapNormalizedSeverity(finding.severity),
    title: finding.title?.trim() || "CodeQL が指摘を検出しました。",
    description: finding.description?.trim() || null,
    reason: finding.reason?.trim() || finding.description?.trim() || finding.title?.trim() || "CodeQL reported a finding.",
    suggestion:
      finding.suggestion?.trim() || "CodeQL の結果を確認し、該当箇所の修正ガイダンスに沿って対応してください。",
    targetRef: finding.targetRef?.trim() || null,
    confidence: typeof finding.confidence === "number" ? finding.confidence : null
  }));
}

function mapCodeqlSeverity(level?: string, securitySeverity?: string) {
  const normalizedLevel = level?.toLowerCase().trim();
  const numericSeverity = securitySeverity ? Number.parseFloat(securitySeverity) : Number.NaN;

  if (!Number.isNaN(numericSeverity) && numericSeverity >= 8) {
    return "high";
  }

  if (!Number.isNaN(numericSeverity) && numericSeverity >= 5) {
    return "medium";
  }

  if (normalizedLevel === "error") {
    return "high";
  }

  if (normalizedLevel === "warning") {
    return "medium";
  }

  return "low";
}

function mapNormalizedSeverity(value?: string) {
  const normalized = value?.toLowerCase().trim();

  if (normalized === "high" || normalized === "error") {
    return "high";
  }

  if (normalized === "medium" || normalized === "warning") {
    return "medium";
  }

  return "low";
}

function mapCodeqlConfidence(value?: string) {
  const normalized = value?.toLowerCase().trim();

  if (normalized === "very-high" || normalized === "high") {
    return 0.9;
  }

  if (normalized === "medium") {
    return 0.75;
  }

  if (normalized === "low") {
    return 0.6;
  }

  return null;
}

function firstSentence(value: string) {
  const first = value.split(".")[0]?.trim();
  return first || value;
}

function readOptionalArray<T>(value: T[] | undefined, errorMessage: string) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(errorMessage);
  }

  return value;
}
