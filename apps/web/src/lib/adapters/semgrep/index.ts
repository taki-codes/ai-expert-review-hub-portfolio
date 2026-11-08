import { JsonIngestSemgrepRunner } from "@/lib/adapters/semgrep/json-ingest-semgrep-runner";
import { LocalExecSemgrepRunner } from "@/lib/adapters/semgrep/local-exec-semgrep-runner";
import type { SemgrepMode, SemgrepRunner } from "@/lib/adapters/semgrep/types";

export function createSemgrepRunner(mode: SemgrepMode): SemgrepRunner {
  if (mode === "json_ingest") {
    return new JsonIngestSemgrepRunner();
  }

  return new LocalExecSemgrepRunner();
}
