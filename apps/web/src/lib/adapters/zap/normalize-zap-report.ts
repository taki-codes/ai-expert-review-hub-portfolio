import type {
  ApiSpecFormat,
  NormalizedZapFinding,
  ZapAlert,
  ZapJsonReport,
  ZapMode
} from "@/lib/adapters/zap/types";

export function normalizeZapReport(input: {
  mode: ZapMode;
  apiSpecFormat: ApiSpecFormat;
  apiSpecFileName: string;
  apiSpecArtifactPath: string;
  rawJson: ZapJsonReport;
}) {
  const alerts = (input.rawJson.site ?? []).flatMap((site) => site.alerts ?? []);
  const findings = alerts.map((alert) => normalizeZapFinding(alert, input.apiSpecArtifactPath));

  return {
    findings,
    alertCount: alerts.length,
    summaryText: `[${input.mode}] ${input.apiSpecFormat} 仕様 ${input.apiSpecFileName} から ZAP アラートを ${alerts.length} 件取り込みました。`
  };
}

function normalizeZapFinding(alert: ZapAlert, fallbackTargetRef: string): NormalizedZapFinding {
  const title = alert.alert?.trim() || alert.name?.trim() || "ZAP がアラートを検出しました。";
  const description = alert.desc?.trim() || null;
  const reason = description ?? title;
  const suggestion =
    alert.solution?.trim() || "該当エンドポイントを確認し、ZAP の修正ガイダンスに沿って対応してください。";
  const firstInstance = alert.instances?.find((instance) => typeof instance.uri === "string" && instance.uri.trim());

  return {
    sourceTool: "zap",
    category: formatZapCategory(alert.cweid),
    severity: mapZapSeverity(alert.riskcode, alert.riskdesc),
    title,
    description,
    reason,
    suggestion,
    targetRef: firstInstance?.uri?.trim() || fallbackTargetRef,
    confidence: mapZapConfidence(alert.confidence)
  };
}

function mapZapSeverity(riskcode?: string, riskdesc?: string) {
  const normalizedCode = riskcode?.trim();
  const normalizedDesc = riskdesc?.toLowerCase().trim();

  if (normalizedCode === "3" || normalizedDesc?.startsWith("high")) {
    return "high";
  }

  if (normalizedCode === "2" || normalizedDesc?.startsWith("medium")) {
    return "medium";
  }

  return "low";
}

function mapZapConfidence(value?: string) {
  const normalized = value?.toLowerCase().trim();

  if (normalized === "high") {
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

function formatZapCategory(cweid?: string | number) {
  if (typeof cweid === "number" && Number.isFinite(cweid) && cweid > 0) {
    return `cwe_${cweid}`;
  }

  if (typeof cweid === "string" && cweid.trim() && cweid !== "0") {
    return `cwe_${cweid.trim()}`;
  }

  return "web_security";
}
