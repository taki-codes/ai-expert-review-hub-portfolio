import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeCodeqlReport } from "@/lib/adapters/codeql/normalize-codeql-report";
import type {
  CodeqlNormalizedJsonReport,
  CodeqlRunInput,
  CodeqlRunResult,
  CodeqlRunner
} from "@/lib/adapters/codeql/types";

export class JsonIngestCodeqlRunner implements CodeqlRunner {
  async run(input: CodeqlRunInput): Promise<CodeqlRunResult> {
    if (input.mode !== "json_ingest") {
      throw new Error(`JsonIngestCodeqlRunner cannot handle mode ${input.mode}.`);
    }

    const resolvedPath = path.resolve(input.reportPath);
    const rawText = await readFile(resolvedPath, "utf8");
    const rawJson = parseCodeqlJson(rawText) as CodeqlNormalizedJsonReport;
    const normalized = normalizeCodeqlReport({
      mode: "json_ingest",
      reportFileName: input.reportFileName,
      rawJson
    });

    return {
      mode: "json_ingest",
      rawJson,
      findings: normalized.findings,
      alertCount: normalized.alertCount,
      artifactType: "codeql_json_report",
      summaryText: normalized.summaryText
    };
  }
}

function parseCodeqlJson(rawText: string) {
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    throw new Error("CodeQL JSON report is invalid: the uploaded file could not be parsed as JSON.");
  }
}
