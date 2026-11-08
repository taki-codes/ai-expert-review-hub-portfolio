import { JsonIngestCodeqlRunner } from "@/lib/adapters/codeql/json-ingest-codeql-runner";
import { SarifIngestCodeqlRunner } from "@/lib/adapters/codeql/sarif-ingest-codeql-runner";
import type { CodeqlMode, CodeqlRunner } from "@/lib/adapters/codeql/types";

export function createCodeqlRunner(mode: CodeqlMode): CodeqlRunner {
  if (mode === "json_ingest") {
    return new JsonIngestCodeqlRunner();
  }

  return new SarifIngestCodeqlRunner();
}
