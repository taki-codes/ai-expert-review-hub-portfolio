import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeZapReport } from "@/lib/adapters/zap/normalize-zap-report";
import type { ZapJsonReport, ZapRunInput, ZapRunResult, ZapRunner } from "@/lib/adapters/zap/types";

export class JsonIngestZapRunner implements ZapRunner {
  async run(input: ZapRunInput): Promise<ZapRunResult> {
    if (input.mode !== "json_ingest") {
      throw new Error(`JsonIngestZapRunner cannot handle mode ${input.mode}.`);
    }

    const resolvedJsonPath = path.resolve(input.jsonPath);
    const rawText = await readFile(resolvedJsonPath, "utf8");
    const rawJson = JSON.parse(rawText) as ZapJsonReport;
    const htmlReport = input.htmlPath ? await readFile(path.resolve(input.htmlPath), "utf8") : null;
    const normalized = normalizeZapReport({
      mode: "json_ingest",
      apiSpecFormat: input.apiSpecFormat,
      apiSpecFileName: input.apiSpecFileName,
      apiSpecArtifactPath: input.apiSpecArtifactPath,
      rawJson
    });

    return {
      mode: "json_ingest",
      rawJson,
      htmlReport,
      findings: normalized.findings,
      alertCount: normalized.alertCount,
      summaryText: normalized.summaryText
    };
  }
}
