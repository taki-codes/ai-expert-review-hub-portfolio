import type { ReviewFindingSeverity } from "@/lib/core/review-types";

export type ApiSpecFormat = "openapi" | "soap" | "graphql";
export type ZapMode = "json_ingest" | "mock_api_scan";

export type ZapRunInput =
  | {
      mode: "json_ingest";
      apiSpecFormat: ApiSpecFormat;
      apiSpecFileName: string;
      apiSpecArtifactPath: string;
      jsonPath: string;
      htmlPath?: string;
    }
  | {
      mode: "mock_api_scan";
      apiSpecFormat: ApiSpecFormat;
      apiSpecFileName: string;
      apiSpecArtifactPath: string;
    };

export type NormalizedZapFinding = {
  sourceTool: string;
  category: string;
  severity: ReviewFindingSeverity;
  title: string;
  description: string | null;
  reason: string;
  suggestion: string;
  targetRef: string | null;
  confidence: number | null;
};

export type ZapRunResult = {
  mode: ZapMode;
  rawJson: ZapJsonReport;
  htmlReport: string | null;
  findings: NormalizedZapFinding[];
  alertCount: number;
  summaryText: string;
};

export interface ZapRunner {
  run(input: ZapRunInput): Promise<ZapRunResult>;
}

export type ZapJsonReport = {
  site?: ZapSite[];
};

export type ZapSite = {
  name?: string;
  host?: string;
  alerts?: ZapAlert[];
};

export type ZapAlert = {
  pluginid?: string;
  alert?: string;
  name?: string;
  riskcode?: string;
  riskdesc?: string;
  confidence?: string;
  desc?: string;
  solution?: string;
  reference?: string;
  cweid?: string | number;
  instances?: ZapInstance[];
  count?: string | number;
};

export type ZapInstance = {
  uri?: string;
  method?: string;
  param?: string;
  evidence?: string;
};
