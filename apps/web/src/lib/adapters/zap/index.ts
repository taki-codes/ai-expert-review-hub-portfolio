import { JsonIngestZapRunner } from "@/lib/adapters/zap/json-ingest-zap-runner";
import { MockApiScanZapRunner } from "@/lib/adapters/zap/mock-api-scan-zap-runner";
import type { ZapMode, ZapRunner } from "@/lib/adapters/zap/types";

export function createZapRunner(mode: ZapMode): ZapRunner {
  if (mode === "json_ingest") {
    return new JsonIngestZapRunner();
  }

  return new MockApiScanZapRunner();
}
