import type { ReviewFindingSeverity } from "@/lib/core/review-types";

export type SemgrepMode = "json_ingest" | "local_exec";

export type SemgrepRunInput =
  | {
      mode: "json_ingest";
      jsonPath: string;
    }
  | {
      mode: "local_exec";
      repositoryPath: string;
      binPath?: string;
      binArgs?: string[];
      config?: string;
    };

export type NormalizedReviewFinding = {
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

export type SemgrepRunResult = {
  mode: SemgrepMode;
  rawJson: SemgrepJsonReport;
  findings: NormalizedReviewFinding[];
  summaryText: string;
  scannedPaths: string[];
};

export interface SemgrepRunner {
  run(input: SemgrepRunInput): Promise<SemgrepRunResult>;
}

export type SemgrepJsonReport = {
  version?: string;
  results?: SemgrepJsonResult[];
  errors?: Array<Record<string, unknown>>;
  paths?: {
    scanned?: string[];
  };
};

export type SemgrepJsonResult = {
  check_id?: string;
  path?: string;
  start?: {
    line?: number;
    col?: number;
  };
  end?: {
    line?: number;
    col?: number;
  };
  extra?: {
    message?: string;
    severity?: string;
    fix?: string;
    metadata?: Record<string, unknown>;
  };
};
