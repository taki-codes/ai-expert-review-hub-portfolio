import { readFile } from "node:fs/promises";
import path from "node:path";
import { normalizeZapReport } from "@/lib/adapters/zap/normalize-zap-report";
import type { ZapJsonReport, ZapRunInput, ZapRunResult, ZapRunner } from "@/lib/adapters/zap/types";

export class MockApiScanZapRunner implements ZapRunner {
  async run(input: ZapRunInput): Promise<ZapRunResult> {
    if (input.mode !== "mock_api_scan") {
      throw new Error(`MockApiScanZapRunner cannot handle mode ${input.mode}.`);
    }

    const fixtureDir = path.resolve(process.cwd(), "fixtures/zap");
    const rawJson = JSON.parse(
      await readFile(path.join(fixtureDir, "sample-report.json"), "utf8")
    ) as ZapJsonReport;
    const htmlTemplate = await readFile(path.join(fixtureDir, "sample-report.html"), "utf8");
    const hydratedJson = hydrateApiSpec(rawJson, input.apiSpecFileName, input.apiSpecFormat);
    const htmlReport = htmlTemplate
      .replaceAll("__API_SPEC_NAME__", input.apiSpecFileName)
      .replaceAll("__API_SPEC_FORMAT__", input.apiSpecFormat);
    const normalized = normalizeZapReport({
      mode: "mock_api_scan",
      apiSpecFormat: input.apiSpecFormat,
      apiSpecFileName: input.apiSpecFileName,
      apiSpecArtifactPath: input.apiSpecArtifactPath,
      rawJson: hydratedJson
    });

    return {
      mode: "mock_api_scan",
      rawJson: hydratedJson,
      htmlReport,
      findings: normalized.findings,
      alertCount: normalized.alertCount,
      summaryText: normalized.summaryText
    };
  }
}

function hydrateApiSpec(rawJson: ZapJsonReport, apiSpecFileName: string, apiSpecFormat: string): ZapJsonReport {
  const serialized = JSON.stringify(rawJson);
  const hydrated = serialized
    .replaceAll("__API_SPEC_NAME__", apiSpecFileName)
    .replaceAll("__API_SPEC_FORMAT__", apiSpecFormat);

  return JSON.parse(hydrated) as ZapJsonReport;
}
