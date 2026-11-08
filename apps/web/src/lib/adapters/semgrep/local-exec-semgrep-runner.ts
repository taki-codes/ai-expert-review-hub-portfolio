import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { normalizeSemgrepReport } from "@/lib/adapters/semgrep/normalize-semgrep-report";
import type { SemgrepJsonReport, SemgrepRunInput, SemgrepRunResult, SemgrepRunner } from "@/lib/adapters/semgrep/types";

const execFileAsync = promisify(execFile);

export class LocalExecSemgrepRunner implements SemgrepRunner {
  async run(input: SemgrepRunInput): Promise<SemgrepRunResult> {
    if (input.mode !== "local_exec") {
      throw new Error(`LocalExecSemgrepRunner cannot handle mode ${input.mode}.`);
    }

    const binPath = input.binPath?.trim() || "semgrep";
    const config = input.config?.trim() || "auto";
    const args = [
      ...(input.binArgs ?? []),
      "scan",
      "--config",
      config,
      "--json",
      "--quiet",
      input.repositoryPath
    ];
    const execution = await execFileAsync(binPath, args, {
      cwd: input.repositoryPath,
      maxBuffer: 20 * 1024 * 1024,
      shell: shouldUseShell(binPath)
    });
    const rawStdout = execution.stdout?.trim();

    if (!rawStdout) {
      throw new Error("Semgrep local_exec did not return JSON output.");
    }

    const rawJson = JSON.parse(rawStdout) as SemgrepJsonReport;
    const normalized = normalizeSemgrepReport({
      mode: "local_exec",
      rawJson
    });

    return {
      mode: "local_exec",
      rawJson,
      findings: normalized.findings,
      scannedPaths: normalized.scannedPaths,
      summaryText: normalized.summaryText
    };
  }
}

function shouldUseShell(binPath: string) {
  return /\.(cmd|bat)$/i.test(binPath);
}
