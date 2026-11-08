import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeCodeqlReport } from "@/lib/adapters/codeql/normalize-codeql-report";
import type { CodeqlRunInput, CodeqlRunResult, CodeqlRunner, CodeqlSarifReport } from "@/lib/adapters/codeql/types";

export class SarifIngestCodeqlRunner implements CodeqlRunner {
  async run(input: CodeqlRunInput): Promise<CodeqlRunResult> {
    if (input.mode !== "sarif_ingest") {
      throw new Error(`SarifIngestCodeqlRunner cannot handle mode ${input.mode}.`);
    }

    const resolvedPath = path.resolve(input.reportPath);
    const rawText = await readFile(resolvedPath, "utf8");
    const rawJson = parseCodeqlSarif(rawText) as CodeqlSarifReport;
    const normalized = normalizeCodeqlReport({
      mode: "sarif_ingest",
      reportFileName: input.reportFileName,
      rawJson
    });

    return {
      mode: "sarif_ingest",
      rawJson,
      findings: normalized.findings,
      alertCount: normalized.alertCount,
      artifactType: "codeql_sarif_report",
      summaryText: normalized.summaryText
    };
  }
}

function parseCodeqlSarif(rawText: string) {
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    throw new Error("CodeQL SARIF report is invalid: the uploaded file could not be parsed as JSON.");
  }
}
