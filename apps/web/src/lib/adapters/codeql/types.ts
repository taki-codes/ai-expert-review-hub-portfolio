import type { ReviewFindingSeverity } from "@/lib/core/review-types";

export type RepositoryVisibility = "public" | "private";
export type CodeqlMode = "sarif_ingest" | "json_ingest";

export type CodeqlRunInput =
  | {
      mode: "sarif_ingest";
      reportPath: string;
      reportFileName: string;
      repositoryVisibility: RepositoryVisibility;
    }
  | {
      mode: "json_ingest";
      reportPath: string;
      reportFileName: string;
      repositoryVisibility: RepositoryVisibility;
    };

export type NormalizedCodeqlFinding = {
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

export type CodeqlRunResult = {
  mode: CodeqlMode;
  rawJson: CodeqlRawReport;
  findings: NormalizedCodeqlFinding[];
  alertCount: number;
  artifactType: "codeql_sarif_report" | "codeql_json_report";
  summaryText: string;
};

export interface CodeqlRunner {
  run(input: CodeqlRunInput): Promise<CodeqlRunResult>;
}

export type CodeqlRawReport = CodeqlSarifReport | CodeqlNormalizedJsonReport;

export type CodeqlNormalizedJsonReport = {
  findings?: Array<{
    category?: string;
    severity?: string;
    title?: string;
    description?: string;
    reason?: string;
    suggestion?: string;
    targetRef?: string;
    confidence?: number;
  }>;
};

export type CodeqlSarifReport = {
  runs?: CodeqlSarifRun[];
};

export type CodeqlSarifRun = {
  tool?: {
    driver?: {
      rules?: CodeqlSarifRule[];
    };
  };
  results?: CodeqlSarifResult[];
};

export type CodeqlSarifRule = {
  id?: string;
  name?: string;
  shortDescription?: {
    text?: string;
  };
  fullDescription?: {
    text?: string;
  };
  help?: {
    text?: string;
  };
  properties?: {
    tags?: string[];
    "security-severity"?: string;
    precision?: string;
  };
};

export type CodeqlSarifResult = {
  ruleId?: string;
  level?: string;
  message?: {
    text?: string;
  };
  locations?: Array<{
    physicalLocation?: {
      artifactLocation?: {
        uri?: string;
      };
      region?: {
        startLine?: number;
      };
    };
  }>;
};
