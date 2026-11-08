import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeSemgrepReport } from "@/lib/adapters/semgrep/normalize-semgrep-report";
import type { SemgrepJsonReport, SemgrepRunInput, SemgrepRunResult, SemgrepRunner } from "@/lib/adapters/semgrep/types";

export class JsonIngestSemgrepRunner implements SemgrepRunner {
  async run(input: SemgrepRunInput): Promise<SemgrepRunResult> {
    if (input.mode !== "json_ingest") {
      throw new Error(`JsonIngestSemgrepRunner cannot handle mode ${input.mode}.`);
    }

    const resolvedPath = path.resolve(input.jsonPath);
    const rawText = await readFile(resolvedPath, "utf8");
    const rawJson = JSON.parse(rawText) as SemgrepJsonReport;
    const normalized = normalizeSemgrepReport({
      mode: "json_ingest",
      rawJson
    });

    return {
      mode: "json_ingest",
      rawJson,
      findings: normalized.findings,
      scannedPaths: normalized.scannedPaths,
      summaryText: normalized.summaryText
    };
  }
}
