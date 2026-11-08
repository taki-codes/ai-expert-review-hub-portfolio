import { REVIEW_STEP_NAMES } from "@/lib/core/review-types";
import type { ReviewFindingSeverity } from "@/lib/core/review-types";
import { buildKnowledgeSummarySnapshot } from "@/lib/core/knowledge";
import { prisma } from "@/lib/db/prisma";
import {
  createFigmaContextReader,
  createGeminiReviewer,
  createCodeqlRunner,
  createGptNormalizer,
  createSemgrepRunner,
  createZapRunner
} from "@/lib/adapters";
import { ProviderCallError } from "@/lib/adapters/provider-runtime";
import type {
  CodeqlMode,
  CodeqlRunInput,
  RepositoryVisibility
} from "@/lib/adapters/codeql/types";
import type { FigmaContextRequest } from "@/lib/adapters/figma/types";
import type { FigmaRawContext } from "@/lib/adapters/figma/types";
import type { GeminiReviewResult } from "@/lib/adapters/gemini/types";
import type { GptReviewPlan } from "@/lib/adapters/gpt/types";
import type { SemgrepMode, SemgrepRunInput } from "@/lib/adapters/semgrep/types";
import type { ApiSpecFormat, ZapMode, ZapRunInput } from "@/lib/adapters/zap/types";
import {
  writeBinaryArtifact,
  writeJsonArtifact,
  writeTextArtifact
} from "@/lib/storage/artifact-writer";

type CreateReviewRunInput = {
  screenshot: File;
  explanatoryText: string;
  runTitle?: string;
  runMemo?: string;
  runTags?: string[];
  notebookId?: string;
  runFigma?: boolean;
  figmaUrl?: string;
  runFigmaMake?: boolean;
  figmaMakeMode?: string;
  figmaCheckMode?: string;
  figmaMakePrompt?: string;
  figmaMakeOutputText?: string;
  figmaCheckSummaryText?: string;
  figmaCheckReportFile?: File;
  semgrepMode?: string;
  repositoryPath?: string;
  semgrepJsonPath?: string;
  semgrepBin?: string;
  semgrepBinArgs?: string[];
  semgrepConfig?: string;
  apiSpecFile?: File;
  apiSpecFormat?: ApiSpecFormat;
  zapMode?: string;
  zapJsonPath?: string;
  zapHtmlPath?: string;
  codeqlReportFile?: File;
  codeqlMode?: CodeqlMode;
  repositoryVisibility?: RepositoryVisibility;
};

export async function createReviewRun(input: CreateReviewRunInput) {
  const reviewRun = await prisma.reviewRun.create({
    data: {
      title: input.runTitle ?? null,
      memo: input.runMemo ?? null,
      tagsJson: serializeRunTags(input.runTags),
      status: "running",
      steps: {
        create: REVIEW_STEP_NAMES.map((stepName) => ({
          stepName,
          status: stepName === "ingest" ? "running" : "pending"
        }))
      }
    },
    include: {
      steps: true
    }
  });

  const stepIds = new Map(reviewRun.steps.map((step) => [step.stepName, step.id]));
  const ingestStepId = requireStepId(stepIds, "ingest");
  const geminiStepId = requireStepId(stepIds, "gemini");
  const gptStepId = requireStepId(stepIds, "gpt");
  const figmaStepId = requireStepId(stepIds, "figma");
  const figmaMakeStepId = requireStepId(stepIds, "figmaMake");
  const figmaCheckDesignsStepId = requireStepId(stepIds, "figmaCheckDesigns");
  const semgrepStepId = requireStepId(stepIds, "semgrep");
  const zapStepId = requireStepId(stepIds, "zap");
  const codeqlStepId = requireStepId(stepIds, "codeql");
  const finalizeStepId = requireStepId(stepIds, "finalize");
  const screenshotBuffer = Buffer.from(await input.screenshot.arrayBuffer());
  const apiSpecBuffer = input.apiSpecFile
    ? Buffer.from(await input.apiSpecFile.arrayBuffer())
    : null;
  const codeqlReportBuffer = input.codeqlReportFile
    ? Buffer.from(await input.codeqlReportFile.arrayBuffer())
    : null;
  const figmaCheckReportBuffer = input.figmaCheckReportFile
    ? Buffer.from(await input.figmaCheckReportFile.arrayBuffer())
    : null;

  const savedScreenshot = await writeBinaryArtifact(
    reviewRun.id,
    `inputs/${sanitizeFileName(input.screenshot.name || "screenshot.png")}`,
    screenshotBuffer
  );
  const savedApiSpec =
    input.apiSpecFile && apiSpecBuffer
      ? await writeBinaryArtifact(
          reviewRun.id,
          `inputs/${sanitizeFileName(input.apiSpecFile.name || "api-spec")}`,
          apiSpecBuffer
        )
      : null;
  const savedCodeqlReport =
    input.codeqlReportFile && codeqlReportBuffer
      ? await writeBinaryArtifact(
          reviewRun.id,
          `inputs/${sanitizeFileName(input.codeqlReportFile.name || "codeql-report")}`,
          codeqlReportBuffer
        )
      : null;
  const savedInputPayload = await writeJsonArtifact(reviewRun.id, "inputs/request.json", {
    runTitle: input.runTitle ?? null,
    runMemo: input.runMemo ?? null,
    runTags: input.runTags ?? [],
    explanatoryText: input.explanatoryText,
    notebookId: input.notebookId ?? null,
    runFigma: input.runFigma ?? false,
    figmaUrl: input.figmaUrl ?? null,
    runFigmaMake: input.runFigmaMake ?? false,
    figmaMakeMode: input.figmaMakeMode ?? null,
    figmaCheckMode: input.figmaCheckMode ?? null,
    figmaMakePrompt: input.figmaMakePrompt ?? null,
    figmaMakeOutputText: input.figmaMakeOutputText ?? null,
    figmaCheckSummaryText: input.figmaCheckSummaryText ?? null,
    figmaCheckReportFileName: input.figmaCheckReportFile?.name ?? null,
    semgrepMode: input.semgrepMode ?? null,
    repositoryPath: input.repositoryPath ?? null,
    semgrepJsonPath: input.semgrepJsonPath ?? null,
    semgrepBin: input.semgrepBin ?? null,
    semgrepBinArgs: input.semgrepBinArgs ?? null,
    semgrepConfig: input.semgrepConfig ?? null,
    apiSpecFileName: input.apiSpecFile?.name ?? null,
    apiSpecFormat: input.apiSpecFormat ?? null,
    apiSpecArtifactPath: savedApiSpec?.artifactPath ?? null,
    zapMode: input.zapMode ?? null,
    zapJsonPath: input.zapJsonPath ?? null,
    zapHtmlPath: input.zapHtmlPath ?? null,
    codeqlMode: input.codeqlMode ?? null,
    repositoryVisibility: input.repositoryVisibility ?? null,
    codeqlReportFileName: input.codeqlReportFile?.name ?? null,
    codeqlReportArtifactPath: savedCodeqlReport?.artifactPath ?? null,
    screenshotFileName: input.screenshot.name,
    screenshotMimeType: input.screenshot.type
  });
  const knowledgeSummary = buildKnowledgeSummarySnapshot({ notebookId: input.notebookId });
  const knowledgeSummaryArtifact = await writeJsonArtifact(
    reviewRun.id,
    "inputs/knowledge-summary.json",
    knowledgeSummary
  );

  await prisma.$transaction([
    prisma.reviewInput.create({
      data: {
        reviewRunId: reviewRun.id,
        inputType: "image",
        fileName: input.screenshot.name,
        mimeType: input.screenshot.type,
        artifactPath: savedScreenshot.artifactPath
      }
    }),
    prisma.reviewInput.create({
      data: {
        reviewRunId: reviewRun.id,
        inputType: "text",
        textContent: input.explanatoryText
      }
    }),
    prisma.reviewArtifact.createMany({
      data: [
        {
          reviewRunId: reviewRun.id,
          stepName: "ingest",
          artifactType: "input_image",
          path: savedScreenshot.artifactPath,
          contentType: input.screenshot.type
        },
        {
          reviewRunId: reviewRun.id,
          stepName: "ingest",
          artifactType: "input_payload",
          path: savedInputPayload.artifactPath,
          contentType: "application/json"
        },
        ...(savedApiSpec && input.apiSpecFile
          ? [
              {
                reviewRunId: reviewRun.id,
                stepName: "ingest",
                artifactType: "api_spec_file",
                path: savedApiSpec.artifactPath,
                contentType: input.apiSpecFile.type || "application/octet-stream"
              }
            ]
          : []),
        ...(savedCodeqlReport && input.codeqlReportFile
          ? [
              {
                reviewRunId: reviewRun.id,
                stepName: "ingest",
                artifactType: "codeql_report_file",
                path: savedCodeqlReport.artifactPath,
                contentType: input.codeqlReportFile.type || "application/octet-stream"
              }
            ]
          : []),
        {
          reviewRunId: reviewRun.id,
          stepName: "ingest",
          artifactType: "knowledge_summary",
          path: knowledgeSummaryArtifact.artifactPath,
          contentType: "application/json"
        }
      ]
    }),
    prisma.reviewStep.update({
      where: { id: ingestStepId },
      data: {
        status: "success",
        startedAt: reviewRun.createdAt,
        finishedAt: new Date(),
        summaryText: buildIngestSummary({
          hasApiSpec: Boolean(savedApiSpec),
          hasCodeqlReport: Boolean(savedCodeqlReport)
        })
      }
    })
  ]);

  try {
    const geminiRequest = {
      screenshotArtifactPath: savedScreenshot.artifactPath,
      explanatoryText: input.explanatoryText,
      knowledgeSummary: knowledgeSummary.summary
    };

    await prisma.reviewStep.update({
      where: { id: geminiStepId },
      data: { status: "running", startedAt: new Date() }
    });

    let geminiResponse: GeminiReviewResult;

    try {
      const geminiReviewer = createGeminiReviewer();
      const geminiExecution = await geminiReviewer.review(geminiRequest);
      geminiResponse = geminiExecution.output;

      await persistProviderArtifacts({
        reviewRunId: reviewRun.id,
        stepName: "gemini",
        requestPayload: geminiExecution.rawRequest,
        responsePayload: geminiExecution.rawResponse
      });

      await prisma.$transaction([
        prisma.reviewFinding.createMany({
          data: geminiResponse.issues.map((issue) => ({
            reviewRunId: reviewRun.id,
            sourceTool: "gemini",
            category: issue.category,
            severity: issue.severity,
            title: issue.title,
            description: issue.reason,
            reason: issue.reason,
            suggestion: issue.suggestion,
            targetRef: savedScreenshot.artifactPath,
            confidence: issue.severity === "high" ? 0.9 : issue.severity === "medium" ? 0.76 : 0.64
          }))
        }),
        prisma.reviewStep.update({
          where: { id: geminiStepId },
          data: {
            status: "success",
            finishedAt: new Date(),
            summaryText: buildCoreProviderSuccessSummary({
              providerName: "Gemini",
              providerMode: geminiExecution.providerMode,
              model: geminiExecution.model,
              resultText: `画面根拠のある指摘を ${geminiResponse.issues.length} 件生成しました。`
            })
          }
        })
      ]);
    } catch (error) {
      await persistProviderArtifacts({
        reviewRunId: reviewRun.id,
        stepName: "gemini",
        requestPayload: extractProviderRequestPayload(error, geminiRequest),
        responsePayload: extractProviderResponsePayload(error)
      });

      throw error;
    }

    const gptRequest = {
      geminiReview: geminiResponse,
      knowledgeSummary: knowledgeSummary.summary,
      explanatoryText: input.explanatoryText,
      reviewFocus: "normalization" as const
    };

    await prisma.reviewStep.update({
      where: { id: gptStepId },
      data: { status: "running", startedAt: new Date() }
    });

    let gptResponse: GptReviewPlan;

    try {
      const gptNormalizer = createGptNormalizer();
      const gptExecution = await gptNormalizer.normalize(gptRequest);
      gptResponse = gptExecution.output;
      const gptFindings = buildGptFindings({
        reviewRunId: reviewRun.id,
        plan: gptResponse,
        targetRef: savedScreenshot.artifactPath
      });

      await persistProviderArtifacts({
        reviewRunId: reviewRun.id,
        stepName: "gpt",
        requestPayload: gptExecution.rawRequest,
        responsePayload: gptExecution.rawResponse
      });

      await prisma.reviewStep.update({
        where: { id: gptStepId },
        data: {
          status: "success",
          finishedAt: new Date(),
          summaryText: buildCoreProviderSuccessSummary({
            providerName: "GPT",
            providerMode: gptExecution.providerMode,
            model: gptExecution.model,
            resultText: `優先項目を ${gptResponse.priorities.length} 件、改善アクションを ${gptResponse.actions.length} 件生成しました。`
          })
        }
      });
      await prisma.reviewFinding.createMany({
        data: gptFindings
      });
    } catch (error) {
      await persistProviderArtifacts({
        reviewRunId: reviewRun.id,
        stepName: "gpt",
        requestPayload: extractProviderRequestPayload(error, gptRequest),
        responsePayload: extractProviderResponsePayload(error)
      });

      throw error;
    }

    const figmaStatus = await runFigmaStep({
      reviewRunId: reviewRun.id,
      figmaStepId,
      runFigma: input.runFigma,
      figmaUrl: input.figmaUrl,
      explanatoryText: input.explanatoryText,
      knowledgeSummary: knowledgeSummary.summary
    });
    const figmaMakeStatus = await runFigmaMakeStep({
      reviewRunId: reviewRun.id,
      figmaMakeStepId,
      runFigmaMake: input.runFigmaMake,
      figmaMakeMode: input.figmaMakeMode,
      figmaUrl: input.figmaUrl,
      figmaMakePrompt: input.figmaMakePrompt,
      figmaMakeOutputText: input.figmaMakeOutputText,
      targetRef: input.figmaUrl ?? savedScreenshot.artifactPath
    });
    const figmaCheckStatus = await runFigmaCheckDesignsStep({
      reviewRunId: reviewRun.id,
      figmaCheckDesignsStepId,
      figmaCheckMode: input.figmaCheckMode,
      figmaUrl: input.figmaUrl,
      figmaCheckSummaryText: input.figmaCheckSummaryText,
      figmaCheckReportFile: input.figmaCheckReportFile,
      figmaCheckReportBuffer,
      targetRef: input.figmaUrl ?? savedScreenshot.artifactPath
    });

    const semgrepStatus = await runSemgrepStep({
      reviewRunId: reviewRun.id,
      semgrepStepId,
      repositoryPath: input.repositoryPath,
      semgrepJsonPath: input.semgrepJsonPath,
      semgrepMode: input.semgrepMode,
      semgrepBin: input.semgrepBin,
      semgrepBinArgs: input.semgrepBinArgs,
      semgrepConfig: input.semgrepConfig
    });
    const zapStatus = await runZapStep({
      reviewRunId: reviewRun.id,
      zapStepId,
      apiSpecArtifactPath: savedApiSpec?.artifactPath,
      apiSpecFileName: input.apiSpecFile?.name,
      apiSpecFormat: input.apiSpecFormat,
      zapMode: input.zapMode,
      zapJsonPath: input.zapJsonPath,
      zapHtmlPath: input.zapHtmlPath
    });
    const codeqlStatus = await runCodeqlStep({
      reviewRunId: reviewRun.id,
      codeqlStepId,
      codeqlMode: input.codeqlMode,
      repositoryVisibility: input.repositoryVisibility,
      codeqlReportAbsolutePath: savedCodeqlReport?.absolutePath,
      codeqlReportFileName: input.codeqlReportFile?.name
    });

    const persistedFindings = await prisma.reviewFinding.findMany({
      where: { reviewRunId: reviewRun.id },
      orderBy: { createdAt: "asc" }
    });
    const summaryArtifact = await writeTextArtifact(
      reviewRun.id,
      "final/executive-summary.txt",
      `${gptResponse.executiveSummary}\n`
    );
    const normalizedFindingsArtifact = await writeJsonArtifact(reviewRun.id, "final/findings.json", {
      findings: persistedFindings.map((finding) => ({
        sourceTool: finding.sourceTool,
        category: finding.category,
        severity: finding.severity,
        title: finding.title,
        description: finding.description,
        reason: finding.reason,
        suggestion: finding.suggestion,
        targetRef: finding.targetRef,
        confidence: finding.confidence
      }))
    });

    await prisma.$transaction([
      prisma.reviewArtifact.createMany({
        data: [
          {
            reviewRunId: reviewRun.id,
            stepName: "finalize",
            artifactType: "executive_summary",
            path: summaryArtifact.artifactPath,
            contentType: "text/plain"
          },
          {
            reviewRunId: reviewRun.id,
            stepName: "finalize",
            artifactType: "normalized_findings",
            path: normalizedFindingsArtifact.artifactPath,
            contentType: "application/json"
          }
        ]
      }),
      prisma.reviewRun.update({
        where: { id: reviewRun.id },
        data: {
          status:
            figmaStatus === "failed" ||
            figmaMakeStatus === "failed" ||
            figmaCheckStatus === "failed" ||
            semgrepStatus === "failed" ||
            zapStatus === "failed" ||
            codeqlStatus === "failed"
              ? "partial_success"
              : "completed",
          executiveSummary: gptResponse.executiveSummary
        }
      }),
      prisma.reviewStep.update({
        where: { id: finalizeStepId },
        data: {
          status: "success",
          startedAt: new Date(),
          finishedAt: new Date(),
          summaryText: buildFinalizeSummary({
            figmaStatus,
            figmaMakeStatus,
            figmaCheckStatus,
            semgrepStatus,
            zapStatus,
            codeqlStatus
          })
        }
      })
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown review orchestration error";

    await prisma.$transaction([
      prisma.reviewStep.updateMany({
        where: {
          reviewRunId: reviewRun.id,
          status: "running"
        },
        data: {
          status: "failed",
          errorMessage: message,
          finishedAt: new Date()
        }
      }),
      prisma.reviewRun.update({
        where: { id: reviewRun.id },
        data: {
          status: "failed"
        }
      }),
      prisma.reviewStep.updateMany({
        where: {
          reviewRunId: reviewRun.id,
          status: "pending"
        },
        data: {
          status: "skipped",
          skippedReason: "前段のステップで失敗したため、この後続ステップは実行しませんでした。"
        }
      })
    ]);
  }

  return { reviewRunId: reviewRun.id };
}

function serializeRunTags(tags: string[] | undefined) {
  if (!tags || tags.length === 0) {
    return null;
  }

  return JSON.stringify(tags);
}

async function persistProviderArtifacts(input: {
  reviewRunId: string;
  stepName: "gemini" | "gpt" | "figma";
  requestPayload: unknown;
  responsePayload: unknown;
  requestFileName?: string;
  responseFileName?: string;
}) {
  const requestArtifact = await writeJsonArtifact(
    input.reviewRunId,
    `${input.stepName}/${input.requestFileName ?? "request.json"}`,
    input.requestPayload
  );
  const responseArtifact = await writeJsonArtifact(
    input.reviewRunId,
    `${input.stepName}/${input.responseFileName ?? "response.json"}`,
    input.responsePayload
  );

  await prisma.reviewArtifact.createMany({
    data: [
      {
        reviewRunId: input.reviewRunId,
        stepName: input.stepName,
        artifactType: "request_json",
        path: requestArtifact.artifactPath,
        contentType: "application/json"
      },
      {
        reviewRunId: input.reviewRunId,
        stepName: input.stepName,
        artifactType: "response_json",
        path: responseArtifact.artifactPath,
        contentType: "application/json"
      }
    ]
  });
}

function extractProviderRequestPayload(error: unknown, fallbackPayload: unknown) {
  if (error instanceof ProviderCallError && error.rawRequest !== null) {
    return error.rawRequest;
  }

  return fallbackPayload;
}

function extractProviderResponsePayload(error: unknown) {
  if (error instanceof ProviderCallError && error.rawResponse !== null) {
    return error.rawResponse;
  }

  return {
    error: {
      message: error instanceof Error ? error.message : "Unknown provider error"
    }
  };
}

function buildCoreProviderSuccessSummary(input: {
  providerName: "Gemini" | "GPT";
  providerMode: "mock" | "real";
  model: string;
  resultText: string;
}) {
  if (input.providerName === "Gemini") {
    return `[${input.providerMode}:${input.model}] Gemini レビューに成功しました。${input.resultText}`;
  }

  return `[${input.providerMode}:${input.model}] GPT 正規化に成功しました。${input.resultText}`;
}

function buildGptFindings(input: {
  reviewRunId: string;
  plan: GptReviewPlan;
  targetRef: string | null;
}) {
  return input.plan.priorities.slice(0, 3).map((priority, index) => {
    const pairedAction = input.plan.actions[index] ?? input.plan.actions[0] ?? null;

    return {
      reviewRunId: input.reviewRunId,
      sourceTool: "gpt",
      category: mapGptTargetToCategory(pairedAction?.target ?? "ui"),
      severity: mapPriorityToSeverity(priority.priority),
      title: priority.title,
      description: priority.whyItMatters,
      reason: priority.whyItMatters,
      suggestion: pairedAction?.action ?? "改善優先度に沿って、次の実装変更を具体化してください。",
      targetRef: input.targetRef,
      confidence: priority.priority === "p0" ? 0.82 : priority.priority === "p1" ? 0.74 : 0.66
    };
  });
}

function buildFigmaSupplementGptRequest(input: {
  figmaResult: { summaryText: string; rawContext: FigmaRawContext };
  explanatoryText: string;
  knowledgeSummary: string;
}) {
  const contextNarrative = buildFigmaContextNarrative(input.figmaResult.rawContext, input.figmaResult.summaryText);

  return {
    geminiReview: {
      overallScore: 78,
      summary: contextNarrative,
      issues: [
        {
          category: "other" as const,
          severity: "low" as const,
          title: "Figma コンテキストと実装対象の対応づけを明確にしてください",
          reason: contextNarrative,
          suggestion:
            "Figma 上の対象ノード名、ファイル名、実装対象画面の対応をチーム内で固定し、スクリーンショット側の評価と見比べやすい状態にしてください。"
        }
      ]
    },
    explanatoryText: input.explanatoryText,
    knowledgeSummary: input.knowledgeSummary,
    reviewFocus: "figma_supplement" as const,
    figmaContextSummary: contextNarrative
  };
}

function buildFigmaSupplementFindings(input: {
  reviewRunId: string;
  plan: GptReviewPlan;
  rawContext: FigmaRawContext;
  targetRef: string;
}) {
  const targetLabel =
    input.rawContext.node?.name ??
    input.rawContext.target.frameId ??
    input.rawContext.target.nodeId ??
    input.rawContext.fileName;

  return input.plan.priorities.slice(0, 2).map((priority, index) => {
    const pairedAction = input.plan.actions[index] ?? input.plan.actions[0] ?? null;

    return {
      reviewRunId: input.reviewRunId,
      sourceTool: "figma",
      category: "other",
      severity: index === 0 ? "low" : "medium",
      title: `${targetLabel} に関する補足所見`,
      description: priority.whyItMatters,
      reason: priority.whyItMatters,
      suggestion: pairedAction?.action ?? "Figma コンテキストを見返し、対象ノードと実装意図のズレを解消してください。",
      targetRef: input.targetRef,
      confidence: 0.61
    };
  });
}

function normalizeFigmaMakeMode(value?: string | null) {
  if (value === "manual_capture" || value === "mcp_assisted" || value === "disabled") {
    return value;
  }

  return "disabled";
}

function normalizeFigmaCheckMode(value?: string | null) {
  if (value === "manual_ingest" || value === "disabled") {
    return value;
  }

  return "disabled";
}

function extractManualInsightEntries(text: string, maxEntries = 3) {
  const normalized = text.replaceAll("\r\n", "\n").trim();

  if (!normalized) {
    return [];
  }

  const bulletPattern = /^([-*]|[0-9]+[.)])\s*/;
  const bulletLines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && bulletPattern.test(line))
    .map((line) => line.replace(bulletPattern, "").trim())
    .filter(Boolean);

  if (bulletLines.length > 0) {
    return bulletLines.slice(0, maxEntries);
  }

  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (paragraphs.length > 1) {
    return paragraphs.slice(0, maxEntries);
  }

  return normalized
    .split(/\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, maxEntries);
}

function buildFindingTitleFromEntry(prefix: string, entry: string, index: number) {
  const flattened = entry.replace(/\s+/g, " ").trim();
  if (!flattened) {
    return `${prefix} ${index + 1}`;
  }

  const firstSentence = flattened.split(/[.!?]/)[0]?.trim() ?? flattened;
  const base = firstSentence || flattened;
  return base.length > 48 ? `${base.slice(0, 48).trimEnd()}...` : base;
}

function buildFigmaMakeFindings(input: {
  reviewRunId: string;
  figmaMakeOutputText: string;
  figmaMakePrompt?: string;
  targetRef: string | null;
}) {
  return extractManualInsightEntries(input.figmaMakeOutputText, 3).map((entry, index) => ({
    reviewRunId: input.reviewRunId,
    sourceTool: "figma_make",
    category: "improvement_proposal",
    severity: index === 0 ? "medium" : "low",
    title: buildFindingTitleFromEntry("Figma Make 改善案", entry, index),
    description: entry,
    reason: entry,
    suggestion:
      input.figmaMakePrompt?.trim()
        ? `Figma Make の改善案として取り込みました。元プロンプト: ${input.figmaMakePrompt.trim()}`
        : "Figma Make の改善案として取り込みました。画面側の修正案と照らし合わせて実装優先度を決めてください。",
    targetRef: input.targetRef,
    confidence: index === 0 ? 0.68 : 0.58
  }));
}

function buildFigmaMakeSummary(findingsCount: number) {
  if (findingsCount === 0) {
    return "Figma Make の改善案は保存されましたが、finding には変換されませんでした。";
  }

  return `Figma Make の改善案を ${findingsCount} 件取り込みました。`;
}

function buildFigmaCheckEntriesFromJson(value: unknown) {
  if (!value || typeof value !== "object") {
    return [];
  }

  const candidateKeys = ["findings", "issues", "violations", "results", "checks"];
  const rawRecord = value as Record<string, unknown>;

  for (const key of candidateKeys) {
    const candidate = rawRecord[key];
    if (!Array.isArray(candidate)) {
      continue;
    }

    const entries = candidate
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const itemRecord = item as Record<string, unknown>;
        const title =
          typeof itemRecord.title === "string"
            ? itemRecord.title
            : typeof itemRecord.name === "string"
              ? itemRecord.name
              : typeof itemRecord.rule === "string"
                ? itemRecord.rule
                : null;
        const description =
          typeof itemRecord.description === "string"
            ? itemRecord.description
            : typeof itemRecord.message === "string"
              ? itemRecord.message
              : typeof itemRecord.summary === "string"
                ? itemRecord.summary
                : typeof itemRecord.detail === "string"
                  ? itemRecord.detail
                  : null;

        return [title, description].filter(Boolean).join(": ").trim() || null;
      })
      .filter((entry): entry is string => Boolean(entry));

    if (entries.length > 0) {
      return entries.slice(0, 3);
    }
  }

  return [];
}

function buildFigmaCheckFindings(input: {
  reviewRunId: string;
  figmaCheckSummaryText?: string;
  reportEntries: string[];
  reportPreviewText?: string;
  targetRef: string | null;
}) {
  const seedEntries =
    extractManualInsightEntries(input.figmaCheckSummaryText ?? "", 3).length > 0
      ? extractManualInsightEntries(input.figmaCheckSummaryText ?? "", 3)
      : input.reportEntries.length > 0
        ? input.reportEntries.slice(0, 3)
        : extractManualInsightEntries(input.reportPreviewText ?? "", 2);

  if (seedEntries.length === 0) {
    return [];
  }

  return seedEntries.map((entry, index) => ({
    reviewRunId: input.reviewRunId,
    sourceTool: "figma_check",
    category: "design_system_audit",
    severity: index === 0 ? "medium" : "low",
    title: buildFindingTitleFromEntry("Figma Check 監査指摘", entry, index),
    description: entry,
    reason: entry,
    suggestion:
      "デザインシステムの基準値と突き合わせ、該当コンポーネントのトークンやバリアント定義を見直してください。",
    targetRef: input.targetRef,
    confidence: index === 0 ? 0.7 : 0.6
  }));
}

function buildFigmaCheckSummary(findingsCount: number, hasReport: boolean) {
  if (findingsCount === 0) {
    return hasReport
      ? "Figma Check レポートを保存しましたが、監査指摘への変換対象は見つかりませんでした。"
      : "Figma Check の要約を保存しましたが、監査指摘への変換対象は見つかりませんでした。";
  }

  return `Figma Check の監査指摘を ${findingsCount} 件取り込みました。`;
}

type EnhancedParsedFigmaCheckEntry = {
  title: string | null;
  description: string;
  severity: ReviewFindingSeverity | null;
  category: string | null;
  recommendation: string | null;
};

function normalizeEnhancedFigmaCheckSeverity(value: unknown): ReviewFindingSeverity | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (["critical", "high", "major", "error", "severe"].includes(normalized)) {
    return "high";
  }

  if (["medium", "moderate", "warning", "warn", "important"].includes(normalized)) {
    return "medium";
  }

  if (["low", "minor", "info", "informational"].includes(normalized)) {
    return "low";
  }

  return null;
}

function normalizeEnhancedFigmaCheckCategory(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  return normalized || null;
}

function normalizeEnhancedFigmaCheckText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseEnhancedFigmaCheckEntryObject(value: unknown): EnhancedParsedFigmaCheckEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const title =
    normalizeEnhancedFigmaCheckText(record.title) ??
    normalizeEnhancedFigmaCheckText(record.name) ??
    normalizeEnhancedFigmaCheckText(record.rule) ??
    normalizeEnhancedFigmaCheckText(record.check) ??
    normalizeEnhancedFigmaCheckText(record.issue);
  const description =
    normalizeEnhancedFigmaCheckText(record.description) ??
    normalizeEnhancedFigmaCheckText(record.message) ??
    normalizeEnhancedFigmaCheckText(record.summary) ??
    normalizeEnhancedFigmaCheckText(record.detail) ??
    normalizeEnhancedFigmaCheckText(record.finding) ??
    title;

  if (!description) {
    return null;
  }

  return {
    title,
    description,
    severity:
      normalizeEnhancedFigmaCheckSeverity(record.severity) ??
      normalizeEnhancedFigmaCheckSeverity(record.level) ??
      normalizeEnhancedFigmaCheckSeverity(record.priority),
    category:
      normalizeEnhancedFigmaCheckCategory(record.category) ??
      normalizeEnhancedFigmaCheckCategory(record.type) ??
      normalizeEnhancedFigmaCheckCategory(record.group),
    recommendation:
      normalizeEnhancedFigmaCheckText(record.recommendation) ??
      normalizeEnhancedFigmaCheckText(record.remediation) ??
      normalizeEnhancedFigmaCheckText(record.suggestion) ??
      normalizeEnhancedFigmaCheckText(record.action) ??
      normalizeEnhancedFigmaCheckText(record.fix)
  };
}

function buildEnhancedFigmaCheckEntriesFromJson(value: unknown): EnhancedParsedFigmaCheckEntry[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  const candidateKeys = ["findings", "issues", "violations", "results", "checks"];
  const rawRecord = value as Record<string, unknown>;

  for (const key of candidateKeys) {
    const candidate = rawRecord[key];
    if (!Array.isArray(candidate)) {
      continue;
    }

    const entries = candidate
      .map((item) => parseEnhancedFigmaCheckEntryObject(item))
      .filter((entry): entry is EnhancedParsedFigmaCheckEntry => Boolean(entry));

    if (entries.length > 0) {
      return entries.slice(0, 3);
    }
  }

  const rootEntry = parseEnhancedFigmaCheckEntryObject(value);
  return rootEntry ? [rootEntry] : [];
}

function splitEnhancedFigmaCheckTextBlocks(text: string) {
  const normalized = text.replaceAll("\r\n", "\n").trim();
  if (!normalized) {
    return [];
  }

  const headingMatches = Array.from(normalized.matchAll(/^#{1,6}\s+.+$/gm));
  if (headingMatches.length > 0) {
    return headingMatches
      .map((match, index) => {
        const start = match.index ?? 0;
        const end = headingMatches[index + 1]?.index ?? normalized.length;
        return normalized.slice(start, end).trim();
      })
      .filter(Boolean);
  }

  return normalized
    .split(/\n\s*\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
}

function parseEnhancedFigmaCheckTextBlock(block: string): EnhancedParsedFigmaCheckEntry | null {
  const normalized = block.replaceAll("\r\n", "\n").trim();
  if (!normalized) {
    return null;
  }

  let title: string | null = null;
  let severity: ReviewFindingSeverity | null = null;
  let category: string | null = null;
  let recommendation: string | null = null;
  const descriptionParts: string[] = [];

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines[0]?.startsWith("#")) {
    title = lines.shift()?.replace(/^#{1,6}\s*/, "").trim() ?? null;
  }

  for (const line of lines) {
    const segments = line.split(/\s*;\s*/).map((segment) => segment.trim()).filter(Boolean);

    for (const segment of segments) {
      const cleanSegment = segment.replace(/^[-*]\s*/, "").trim();
      const match = cleanSegment.match(/^([A-Za-z][A-Za-z _/-]{1,32}):\s*(.+)$/);

      if (!match) {
        descriptionParts.push(cleanSegment);
        continue;
      }

      const [, rawKey, rawValue] = match;
      const key = rawKey.trim().toLowerCase();
      const value = rawValue.trim();

      if (key === "title" || key === "finding" || key === "issue") {
        title = value;
        continue;
      }

      if (key === "severity" || key === "priority" || key === "level") {
        severity = normalizeEnhancedFigmaCheckSeverity(value) ?? severity;
        continue;
      }

      if (key === "category" || key === "group" || key === "type") {
        category = normalizeEnhancedFigmaCheckCategory(value) ?? category;
        continue;
      }

      if (key === "recommendation" || key === "remediation" || key === "suggestion" || key === "action" || key === "fix") {
        recommendation = value;
        continue;
      }

      if (key === "description" || key === "detail" || key === "summary" || key === "observation") {
        descriptionParts.push(value);
        continue;
      }

      descriptionParts.push(cleanSegment);
    }
  }

  if (!title && descriptionParts.length > 0) {
    title = buildFindingTitleFromEntry("Figma Check 監査指摘", descriptionParts[0], 0);
  }

  const description = descriptionParts.join("\n").trim() || title;

  if (!description) {
    return null;
  }

  return {
    title,
    description,
    severity,
    category,
    recommendation
  };
}

function buildEnhancedFigmaCheckEntriesFromText(text: string): EnhancedParsedFigmaCheckEntry[] {
  const blocks = splitEnhancedFigmaCheckTextBlocks(text);
  const parsedBlocks = blocks
    .map((block) => parseEnhancedFigmaCheckTextBlock(block))
    .filter((entry): entry is EnhancedParsedFigmaCheckEntry => Boolean(entry));

  if (parsedBlocks.length > 0) {
    return parsedBlocks.slice(0, 3);
  }

  return extractManualInsightEntries(text, 3).map((entry) => ({
    title: null,
    description: entry,
    severity: null,
    category: null,
    recommendation: null
  }));
}

function buildEnhancedFigmaCheckRecommendation(category: string | null) {
  if (category === "spacing" || category === "layout") {
    return "余白やレイアウトの基準値をトークンと照合し、揺れが出ているコンポーネントから順に揃えてください。";
  }

  if (category === "color" || category === "typography" || category === "components") {
    return "デザインシステムの定義と見比べ、対象コンポーネントのバリアントやトークン設定を見直してください。";
  }

  return "デザインシステムの基準値と照らし合わせ、該当コンポーネントのトークンやバリアント定義を見直してください。";
}

function buildEnhancedFigmaCheckFindings(input: {
  reviewRunId: string;
  figmaCheckSummaryText?: string;
  reportEntries: EnhancedParsedFigmaCheckEntry[];
  reportPreviewText?: string;
  targetRef: string | null;
}) {
  const summaryEntries = buildEnhancedFigmaCheckEntriesFromText(input.figmaCheckSummaryText ?? "");
  const fallbackEntries = buildEnhancedFigmaCheckEntriesFromText(input.reportPreviewText ?? "");
  const seedEntries = [...summaryEntries, ...input.reportEntries, ...fallbackEntries].filter(
    (entry, index, array) =>
      array.findIndex(
        (candidate) =>
          candidate.title === entry.title &&
          candidate.description === entry.description &&
          candidate.recommendation === entry.recommendation
      ) === index
  ).slice(0, 3);

  if (seedEntries.length === 0) {
    return [];
  }

  return seedEntries.map((entry, index) => ({
    reviewRunId: input.reviewRunId,
    sourceTool: "figma_check",
    category: entry.category ?? "design_system_audit",
    severity: entry.severity ?? (index === 0 ? "medium" : "low"),
    title: entry.title ?? buildFindingTitleFromEntry("Figma Check 監査指摘", entry.description, index),
    description: entry.description,
    reason: entry.description,
    suggestion: entry.recommendation ?? buildEnhancedFigmaCheckRecommendation(entry.category),
    targetRef: input.targetRef,
    confidence: entry.recommendation || entry.severity || entry.category ? 0.74 : index === 0 ? 0.7 : 0.6
  }));
}

function resolveFigmaCheckReportPath(fileName?: string, contentType?: string | null) {
  const normalizedFileName = fileName?.toLowerCase() ?? "";
  const normalizedContentType = contentType?.toLowerCase() ?? "";

  if (normalizedFileName.endsWith(".json") || normalizedContentType.includes("json")) {
    return {
      artifactPath: "figma-check/report.json",
      contentType: "application/json"
    };
  }

  return {
    artifactPath: "figma-check/report.md",
    contentType: normalizedContentType || "text/markdown"
  };
}

function buildFigmaContextNarrative(rawContext: FigmaRawContext, summaryText: string) {
  const nodeName = rawContext.node?.name ? `対象ノードは「${rawContext.node.name}」` : null;
  const fileName = rawContext.fileName ? `ファイル名は「${rawContext.fileName}」` : null;
  const role = rawContext.file?.role ? `参照権限は ${rawContext.file.role}` : null;
  const linkAccess = rawContext.file?.linkAccess ? `link access は ${rawContext.file.linkAccess}` : null;
  const size = rawContext.node?.absoluteBoundingBox
    ? `ノードサイズは ${Math.round(rawContext.node.absoluteBoundingBox.width)} x ${Math.round(rawContext.node.absoluteBoundingBox.height)}`
    : null;

  return [summaryText, nodeName, fileName, role, linkAccess, size].filter(Boolean).join("。");
}

function mapPriorityToSeverity(priority: GptReviewPlan["priorities"][number]["priority"]) {
  if (priority === "p0") {
    return "high";
  }

  if (priority === "p1") {
    return "medium";
  }

  return "low";
}

function mapGptTargetToCategory(target: GptReviewPlan["actions"][number]["target"]) {
  switch (target) {
    case "content":
      return "copy";
    case "figma":
      return "layout";
    case "security":
      return "other";
    case "ui":
    default:
      return "other";
  }
}

async function runFigmaStep(input: {
  reviewRunId: string;
  figmaStepId: string;
  runFigma?: boolean;
  figmaUrl?: string;
  explanatoryText: string;
  knowledgeSummary: string;
}): Promise<"success" | "skipped" | "failed"> {
  const resolved = resolveFigmaRequest(input);

  if (resolved.kind === "skipped") {
    await prisma.reviewStep.update({
      where: { id: input.figmaStepId },
      data: {
        status: "skipped",
        summaryText: "Figma のコンテキスト取得はスキップしました。",
        skippedReason: resolved.reason
      }
    });

    return "skipped";
  }

  try {
    await prisma.reviewStep.update({
      where: { id: input.figmaStepId },
      data: {
        status: "running",
        startedAt: new Date(),
        skippedReason: null,
        errorMessage: null
      }
    });

    const figmaRequest: FigmaContextRequest = {
      reviewRunId: input.reviewRunId,
      figmaUrl: resolved.figmaUrl
    };
    const figmaReader = createFigmaContextReader();
    const figmaResult = await figmaReader.readContext(figmaRequest);
    const requestArtifact = await writeJsonArtifact(input.reviewRunId, "figma/request.json", figmaRequest);
    const rawContextArtifact = await writeJsonArtifact(
      input.reviewRunId,
      "figma/context.json",
      figmaResult.rawContext
    );
    const summaryArtifact = await writeTextArtifact(
      input.reviewRunId,
      "figma/summary.txt",
      `${figmaResult.summaryText}\n`
    );
    const figmaSupplementRequest = buildFigmaSupplementGptRequest({
      figmaResult,
      explanatoryText: input.explanatoryText,
      knowledgeSummary: input.knowledgeSummary
    });
    const gptNormalizer = createGptNormalizer();
    const figmaSupplementExecution = await gptNormalizer.normalize(figmaSupplementRequest);
    const figmaSupplementFindings = buildFigmaSupplementFindings({
      reviewRunId: input.reviewRunId,
      plan: figmaSupplementExecution.output,
      rawContext: figmaResult.rawContext,
      targetRef: resolved.figmaUrl
    });

    await persistProviderArtifacts({
      reviewRunId: input.reviewRunId,
      stepName: "figma",
      requestPayload: figmaSupplementExecution.rawRequest,
      responsePayload: figmaSupplementExecution.rawResponse,
      requestFileName: "evaluation-request.json",
      responseFileName: "evaluation-response.json"
    });

    await prisma.$transaction([
      prisma.reviewArtifact.createMany({
        data: [
          {
            reviewRunId: input.reviewRunId,
            stepName: "figma",
            artifactType: "request_json",
            path: requestArtifact.artifactPath,
            contentType: "application/json"
          },
          {
            reviewRunId: input.reviewRunId,
            stepName: "figma",
            artifactType: "figma_context_json",
            path: rawContextArtifact.artifactPath,
            contentType: "application/json"
          },
          {
            reviewRunId: input.reviewRunId,
            stepName: "figma",
            artifactType: "figma_context_summary",
            path: summaryArtifact.artifactPath,
            contentType: "text/plain"
          }
        ]
      }),
      prisma.reviewFinding.createMany({
        data: figmaSupplementFindings
      }),
      prisma.reviewStep.update({
        where: { id: input.figmaStepId },
        data: {
          status: "success",
          finishedAt: new Date(),
          summaryText: `${figmaResult.summaryText} 補足所見を ${figmaSupplementFindings.length} 件生成しました。`
        }
      })
    ]);

    return "success";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Figma context lookup error";

    if (error instanceof ProviderCallError && error.providerName === "openai") {
      await persistProviderArtifacts({
        reviewRunId: input.reviewRunId,
        stepName: "figma",
        requestPayload: error.rawRequest,
        responsePayload: error.rawResponse,
        requestFileName: "evaluation-request.json",
        responseFileName: "evaluation-response.json"
      });

      await prisma.reviewStep.update({
        where: { id: input.figmaStepId },
        data: {
          status: "failed",
          errorMessage: message,
          finishedAt: new Date(),
          summaryText: "Figma context lookup succeeded, but supplemental review generation failed."
        }
      });

      return "failed";
    }

    const requestPayload =
      error instanceof ProviderCallError && error.rawRequest ? error.rawRequest : {
        reviewRunId: input.reviewRunId,
        figmaUrl: resolved.figmaUrl
      };
    const contextPayload =
      error instanceof ProviderCallError && error.rawResponse
        ? error.rawResponse
        : {
            error: {
              message
            }
          };
    const requestArtifact = await writeJsonArtifact(input.reviewRunId, "figma/request.json", requestPayload);
    const rawContextArtifact = await writeJsonArtifact(
      input.reviewRunId,
      "figma/context.json",
      contextPayload
    );
    const summaryArtifact = await writeTextArtifact(input.reviewRunId, "figma/summary.txt", `${message}\n`);

    await prisma.$transaction([
      prisma.reviewArtifact.createMany({
        data: [
          {
            reviewRunId: input.reviewRunId,
            stepName: "figma",
            artifactType: "request_json",
            path: requestArtifact.artifactPath,
            contentType: "application/json"
          },
          {
            reviewRunId: input.reviewRunId,
            stepName: "figma",
            artifactType: "figma_context_json",
            path: rawContextArtifact.artifactPath,
            contentType: "application/json"
          },
          {
            reviewRunId: input.reviewRunId,
            stepName: "figma",
            artifactType: "figma_context_summary",
            path: summaryArtifact.artifactPath,
            contentType: "text/plain"
          }
        ]
      }),
      prisma.reviewStep.update({
        where: { id: input.figmaStepId },
        data: {
          status: "failed",
          errorMessage: message,
          finishedAt: new Date(),
          summaryText: "Figma context lookup failed."
        }
      })
    ]);

    return "failed";
  }
}

async function runFigmaMakeStep(input: {
  reviewRunId: string;
  figmaMakeStepId: string;
  runFigmaMake?: boolean;
  figmaMakeMode?: string;
  figmaUrl?: string;
  figmaMakePrompt?: string;
  figmaMakeOutputText?: string;
  targetRef: string | null;
}): Promise<"success" | "skipped" | "failed"> {
  const mode = normalizeFigmaMakeMode(input.figmaMakeMode);

  if (!input.runFigmaMake || mode === "disabled") {
    await prisma.reviewStep.update({
      where: { id: input.figmaMakeStepId },
      data: {
        status: "skipped",
        summaryText: "Figma Make はスキップされました。",
        skippedReason: "この実行では Figma Make 改善案レイヤーを有効にしていません。"
      }
    });

    return "skipped";
  }

  if (mode === "mcp_assisted") {
    await prisma.reviewStep.update({
      where: { id: input.figmaMakeStepId },
      data: {
        status: "skipped",
        summaryText: "Figma Make はスキップされました。",
        skippedReason: "Phase 1 では mcp_assisted の自動実行は未対応です。manual_capture を使ってください。"
      }
    });

    return "skipped";
  }

  if (!input.figmaMakeOutputText?.trim()) {
    await prisma.reviewStep.update({
      where: { id: input.figmaMakeStepId },
      data: {
        status: "failed",
        summaryText: "Figma Make の改善案取り込みに失敗しました。",
        errorMessage: "figmaMakeOutputText is required for figmaMake manual_capture."
      }
    });

    return "failed";
  }

  try {
    await prisma.reviewStep.update({
      where: { id: input.figmaMakeStepId },
      data: {
        status: "running",
        startedAt: new Date(),
        skippedReason: null,
        errorMessage: null
      }
    });

    const requestArtifact = await writeJsonArtifact(input.reviewRunId, "figma-make/request.json", {
      mode,
      figmaUrl: input.figmaUrl ?? null,
      figmaMakePrompt: input.figmaMakePrompt ?? null
    });
    const responseArtifact = await writeTextArtifact(
      input.reviewRunId,
      "figma-make/response.md",
      `${input.figmaMakeOutputText.trim()}\n`
    );
    const findings = buildFigmaMakeFindings({
      reviewRunId: input.reviewRunId,
      figmaMakeOutputText: input.figmaMakeOutputText,
      figmaMakePrompt: input.figmaMakePrompt,
      targetRef: input.targetRef
    });
    const summaryText = buildFigmaMakeSummary(findings.length);
    const summaryArtifact = await writeTextArtifact(input.reviewRunId, "figma-make/summary.txt", `${summaryText}\n`);

    await prisma.$transaction([
      prisma.reviewArtifact.createMany({
        data: [
          {
            reviewRunId: input.reviewRunId,
            stepName: "figmaMake",
            artifactType: "figma_make_request",
            path: requestArtifact.artifactPath,
            contentType: "application/json"
          },
          {
            reviewRunId: input.reviewRunId,
            stepName: "figmaMake",
            artifactType: "figma_make_response",
            path: responseArtifact.artifactPath,
            contentType: "text/markdown"
          },
          {
            reviewRunId: input.reviewRunId,
            stepName: "figmaMake",
            artifactType: "figma_make_summary",
            path: summaryArtifact.artifactPath,
            contentType: "text/plain"
          }
        ]
      }),
      ...(findings.length > 0
        ? [
            prisma.reviewFinding.createMany({
              data: findings
            })
          ]
        : []),
      prisma.reviewStep.update({
        where: { id: input.figmaMakeStepId },
        data: {
          status: "success",
          finishedAt: new Date(),
          summaryText
        }
      })
    ]);

    return "success";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Figma Make capture error";

    await prisma.reviewStep.update({
      where: { id: input.figmaMakeStepId },
      data: {
        status: "failed",
        errorMessage: message,
        finishedAt: new Date(),
        summaryText: "Figma Make の改善案取り込みに失敗しました。"
      }
    });

    return "failed";
  }
}

async function runFigmaCheckDesignsStep(input: {
  reviewRunId: string;
  figmaCheckDesignsStepId: string;
  figmaCheckMode?: string;
  figmaUrl?: string;
  figmaCheckSummaryText?: string;
  figmaCheckReportFile?: File;
  figmaCheckReportBuffer: Buffer | null;
  targetRef: string | null;
}): Promise<"success" | "skipped" | "failed"> {
  const mode = normalizeFigmaCheckMode(input.figmaCheckMode);

  if (mode === "disabled") {
    await prisma.reviewStep.update({
      where: { id: input.figmaCheckDesignsStepId },
      data: {
        status: "skipped",
        summaryText: "Figma Check designs はスキップされました。",
        skippedReason: "この実行では Figma Check designs 監査レイヤーを有効にしていません。"
      }
    });

    return "skipped";
  }

  if (!input.figmaCheckSummaryText?.trim() && !input.figmaCheckReportFile) {
    await prisma.reviewStep.update({
      where: { id: input.figmaCheckDesignsStepId },
      data: {
        status: "failed",
        summaryText: "Figma Check designs の取り込みに失敗しました。",
        errorMessage: "figmaCheckSummaryText or figmaCheckReportFile is required for manual_ingest."
      }
    });

    return "failed";
  }

  try {
    await prisma.reviewStep.update({
      where: { id: input.figmaCheckDesignsStepId },
      data: {
        status: "running",
        startedAt: new Date(),
        skippedReason: null,
        errorMessage: null
      }
    });

    let reportArtifactRecord:
      | {
          path: string;
          contentType: string;
        }
      | null = null;
    let reportEntries: EnhancedParsedFigmaCheckEntry[] = [];
    let reportPreviewText = "";

    if (input.figmaCheckReportFile && input.figmaCheckReportBuffer) {
      const fileText = input.figmaCheckReportBuffer.toString("utf8");
      const reportPathMeta = resolveFigmaCheckReportPath(
        input.figmaCheckReportFile.name,
        input.figmaCheckReportFile.type
      );

      if (reportPathMeta.artifactPath.endsWith(".json")) {
        try {
          const parsed = JSON.parse(fileText) as unknown;
          const artifact = await writeJsonArtifact(input.reviewRunId, reportPathMeta.artifactPath, parsed);
          reportArtifactRecord = {
            path: artifact.artifactPath,
            contentType: reportPathMeta.contentType
          };
          reportEntries = buildEnhancedFigmaCheckEntriesFromJson(parsed);
          reportPreviewText = JSON.stringify(parsed, null, 2);
        } catch {
          const artifact = await writeTextArtifact(input.reviewRunId, "figma-check/report.md", fileText);
          reportArtifactRecord = {
            path: artifact.artifactPath,
            contentType: "text/markdown"
          };
          reportPreviewText = fileText;
        }
      } else {
        const artifact = await writeTextArtifact(input.reviewRunId, reportPathMeta.artifactPath, fileText);
        reportArtifactRecord = {
          path: artifact.artifactPath,
          contentType: reportPathMeta.contentType
        };
        reportPreviewText = fileText;
      }
    }

    const findings = buildEnhancedFigmaCheckFindings({
      reviewRunId: input.reviewRunId,
      figmaCheckSummaryText: input.figmaCheckSummaryText,
      reportEntries,
      reportPreviewText,
      targetRef: input.targetRef
    });
    const summaryText = buildFigmaCheckSummary(findings.length, Boolean(reportArtifactRecord));
    const summaryArtifact = await writeTextArtifact(input.reviewRunId, "figma-check/summary.txt", `${summaryText}\n`);

    await prisma.$transaction([
      prisma.reviewArtifact.createMany({
        data: [
          ...(reportArtifactRecord
            ? [
                {
                  reviewRunId: input.reviewRunId,
                  stepName: "figmaCheckDesigns" as const,
                  artifactType: "figma_check_report" as const,
                  path: reportArtifactRecord.path,
                  contentType: reportArtifactRecord.contentType
                }
              ]
            : []),
          {
            reviewRunId: input.reviewRunId,
            stepName: "figmaCheckDesigns",
            artifactType: "figma_check_summary",
            path: summaryArtifact.artifactPath,
            contentType: "text/plain"
          }
        ]
      }),
      ...(findings.length > 0
        ? [
            prisma.reviewFinding.createMany({
              data: findings
            })
          ]
        : []),
      prisma.reviewStep.update({
        where: { id: input.figmaCheckDesignsStepId },
        data: {
          status: "success",
          finishedAt: new Date(),
          summaryText
        }
      })
    ]);

    return "success";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Figma Check ingest error";

    await prisma.reviewStep.update({
      where: { id: input.figmaCheckDesignsStepId },
      data: {
        status: "failed",
        errorMessage: message,
        finishedAt: new Date(),
        summaryText: "Figma Check designs の取り込みに失敗しました。"
      }
    });

    return "failed";
  }
}

async function runSemgrepStep(input: {
  reviewRunId: string;
  semgrepStepId: string;
  semgrepMode?: string;
  repositoryPath?: string;
  semgrepJsonPath?: string;
  semgrepBin?: string;
  semgrepBinArgs?: string[];
  semgrepConfig?: string;
}): Promise<"success" | "skipped" | "failed"> {
  const resolved = resolveSemgrepRequest(input);

  if (resolved.kind === "skipped") {
    await prisma.reviewStep.update({
      where: { id: input.semgrepStepId },
      data: {
        status: "skipped",
        summaryText: resolved.mode ? `[${resolved.mode}] Semgrep はスキップしました。` : "Semgrep はスキップしました。",
        skippedReason: resolved.reason
      }
    });

    return "skipped";
  }

  if (resolved.kind === "failed") {
    await prisma.reviewStep.update({
      where: { id: input.semgrepStepId },
      data: {
        status: "failed",
        errorMessage: resolved.reason,
        summaryText: resolved.mode ? `[${resolved.mode}] Semgrep の実行に失敗しました。` : "Semgrep の実行に失敗しました。"
      }
    });

    return "failed";
  }

  try {
    await prisma.reviewStep.update({
      where: { id: input.semgrepStepId },
      data: {
        status: "running",
        startedAt: new Date(),
        skippedReason: null,
        errorMessage: null
      }
    });

    const semgrepRunner = createSemgrepRunner(resolved.runnerInput.mode);
    const semgrepResult = await semgrepRunner.run(resolved.runnerInput);
    const semgrepArtifact = await writeJsonArtifact(
      input.reviewRunId,
      "semgrep/report.json",
      semgrepResult.rawJson
    );

    await prisma.$transaction([
      prisma.reviewArtifact.create({
        data: {
          reviewRunId: input.reviewRunId,
          stepName: "semgrep",
          artifactType: "semgrep_raw_json",
          path: semgrepArtifact.artifactPath,
          contentType: "application/json"
        }
      }),
      prisma.reviewFinding.createMany({
        data: semgrepResult.findings.map((finding) => ({
          reviewRunId: input.reviewRunId,
          sourceTool: finding.sourceTool,
          category: finding.category,
          severity: finding.severity,
          title: finding.title,
          description: finding.description,
          reason: finding.reason,
          suggestion: finding.suggestion,
          targetRef: finding.targetRef,
          confidence: finding.confidence
        }))
      }),
      prisma.reviewStep.update({
        where: { id: input.semgrepStepId },
        data: {
          status: "success",
          finishedAt: new Date(),
          summaryText: semgrepResult.summaryText
        }
      })
    ]);

    return "success";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Semgrep 実行中に不明なエラーが発生しました。";

    await prisma.reviewStep.update({
      where: { id: input.semgrepStepId },
      data: {
        status: "failed",
        errorMessage: message,
        finishedAt: new Date(),
        summaryText: `[${resolved.runnerInput.mode}] Semgrep の実行に失敗しました。`
      }
    });

    return "failed";
  }
}

async function runZapStep(input: {
  reviewRunId: string;
  zapStepId: string;
  apiSpecArtifactPath?: string;
  apiSpecFileName?: string;
  apiSpecFormat?: ApiSpecFormat;
  zapMode?: string;
  zapJsonPath?: string;
  zapHtmlPath?: string;
}): Promise<"success" | "skipped" | "failed"> {
  const resolved = resolveZapRequest(input);

  if (resolved.kind === "skipped") {
    await prisma.reviewStep.update({
      where: { id: input.zapStepId },
      data: {
        status: "skipped",
        summaryText: resolved.mode ? `[${resolved.mode}] ZAP API スキャンはスキップしました。` : "ZAP API スキャンはスキップしました。",
        skippedReason: resolved.reason
      }
    });

    return "skipped";
  }

  if (resolved.kind === "failed") {
    await prisma.reviewStep.update({
      where: { id: input.zapStepId },
      data: {
        status: "failed",
        errorMessage: resolved.reason,
        summaryText: resolved.mode ? `[${resolved.mode}] ZAP API スキャンに失敗しました。` : "ZAP API スキャンに失敗しました。"
      }
    });

    return "failed";
  }

  try {
    await prisma.reviewStep.update({
      where: { id: input.zapStepId },
      data: {
        status: "running",
        startedAt: new Date(),
        skippedReason: null,
        errorMessage: null
      }
    });

    const zapRunner = createZapRunner(resolved.runnerInput.mode);
    const zapResult = await zapRunner.run(resolved.runnerInput);
    const reportJsonArtifact = await writeJsonArtifact(input.reviewRunId, "zap/report.json", zapResult.rawJson);
    const htmlArtifact =
      zapResult.htmlReport === null
        ? null
        : await writeTextArtifact(input.reviewRunId, "zap/report.html", zapResult.htmlReport);

    const artifactRecords: Array<{
      reviewRunId: string;
      stepName: string;
      artifactType: string;
      path: string;
      contentType: string;
    }> = [
      {
        reviewRunId: input.reviewRunId,
        stepName: "zap",
        artifactType: "zap_raw_json",
        path: reportJsonArtifact.artifactPath,
        contentType: "application/json"
      }
    ];

    if (htmlArtifact) {
      artifactRecords.push({
        reviewRunId: input.reviewRunId,
        stepName: "zap",
        artifactType: "zap_html_report",
        path: htmlArtifact.artifactPath,
        contentType: "text/html"
      });
    }

    await prisma.$transaction([
      prisma.reviewArtifact.createMany({
        data: artifactRecords
      }),
      prisma.reviewFinding.createMany({
        data: zapResult.findings.map((finding) => ({
          reviewRunId: input.reviewRunId,
          sourceTool: finding.sourceTool,
          category: finding.category,
          severity: finding.severity,
          title: finding.title,
          description: finding.description,
          reason: finding.reason,
          suggestion: finding.suggestion,
          targetRef: finding.targetRef,
          confidence: finding.confidence
        }))
      }),
      prisma.reviewStep.update({
        where: { id: input.zapStepId },
        data: {
          status: "success",
          finishedAt: new Date(),
          summaryText: zapResult.summaryText
        }
      })
    ]);

    return "success";
  } catch (error) {
    const message = error instanceof Error ? error.message : "ZAP 実行中に不明なエラーが発生しました。";

    await prisma.reviewStep.update({
      where: { id: input.zapStepId },
      data: {
        status: "failed",
        errorMessage: message,
        finishedAt: new Date(),
        summaryText: `[${resolved.runnerInput.mode}] ZAP API スキャンに失敗しました。`
      }
    });

    return "failed";
  }
}

async function runCodeqlStep(input: {
  reviewRunId: string;
  codeqlStepId: string;
  codeqlMode?: CodeqlMode;
  repositoryVisibility?: RepositoryVisibility;
  codeqlReportAbsolutePath?: string;
  codeqlReportFileName?: string;
}): Promise<"success" | "skipped" | "failed"> {
  const resolved = resolveCodeqlRequest(input);

  if (resolved.kind === "skipped") {
    await prisma.reviewStep.update({
      where: { id: input.codeqlStepId },
      data: {
        status: "skipped",
        summaryText: resolved.mode ? `[${resolved.mode}] CodeQL 取り込みはスキップしました。` : "CodeQL 取り込みはスキップしました。",
        skippedReason: resolved.reason
      }
    });

    return "skipped";
  }

  if (resolved.kind === "failed") {
    await prisma.reviewStep.update({
      where: { id: input.codeqlStepId },
      data: {
        status: "failed",
        errorMessage: resolved.reason,
        summaryText: formatCodeqlFailureSummary(resolved.mode, resolved.reason)
      }
    });

    return "failed";
  }

  try {
    await prisma.reviewStep.update({
      where: { id: input.codeqlStepId },
      data: {
        status: "running",
        startedAt: new Date(),
        skippedReason: null,
        errorMessage: null
      }
    });

    const codeqlRunner = createCodeqlRunner(resolved.runnerInput.mode);
    const codeqlResult = await codeqlRunner.run(resolved.runnerInput);
    const reportArtifactPath =
      codeqlResult.artifactType === "codeql_sarif_report" ? "codeql/report.sarif" : "codeql/report.json";
    const reportArtifact = await writeJsonArtifact(input.reviewRunId, reportArtifactPath, codeqlResult.rawJson);

    await prisma.$transaction([
      prisma.reviewArtifact.create({
        data: {
          reviewRunId: input.reviewRunId,
          stepName: "codeql",
          artifactType: codeqlResult.artifactType,
          path: reportArtifact.artifactPath,
          contentType: "application/json"
        }
      }),
      prisma.reviewFinding.createMany({
        data: codeqlResult.findings.map((finding) => ({
          reviewRunId: input.reviewRunId,
          sourceTool: finding.sourceTool,
          category: finding.category,
          severity: finding.severity,
          title: finding.title,
          description: finding.description,
          reason: finding.reason,
          suggestion: finding.suggestion,
          targetRef: finding.targetRef,
          confidence: finding.confidence
        }))
      }),
      prisma.reviewStep.update({
        where: { id: input.codeqlStepId },
        data: {
          status: "success",
          finishedAt: new Date(),
          summaryText: codeqlResult.summaryText
        }
      })
    ]);

    return "success";
  } catch (error) {
    const message = error instanceof Error ? error.message : "CodeQL 取り込み中に不明なエラーが発生しました。";
    const mode = resolved.runnerInput.mode;

    await prisma.reviewStep.update({
      where: { id: input.codeqlStepId },
      data: {
        status: "failed",
        errorMessage: message,
        finishedAt: new Date(),
        summaryText: formatCodeqlFailureSummary(mode, message)
      }
    });

    return "failed";
  }
}

function resolveFigmaRequest(input: { runFigma?: boolean; figmaUrl?: string }):
  | { kind: "skipped"; reason: string }
  | { kind: "ready"; figmaUrl: string } {
  if (!input.runFigma) {
    return {
      kind: "skipped",
      reason: "この実行では Figma コンテキスト取得を要求していません。"
    };
  }

  if (!input.figmaUrl?.trim()) {
    return {
      kind: "skipped",
      reason: "read-only コンテキスト取得に必要な Figma URL が指定されていません。"
    };
  }

  return {
    kind: "ready",
    figmaUrl: input.figmaUrl.trim()
  };
}

function resolveSemgrepRequest(input: {
  semgrepMode?: string;
  repositoryPath?: string;
  semgrepJsonPath?: string;
  semgrepBin?: string;
  semgrepBinArgs?: string[];
  semgrepConfig?: string;
}):
  | { kind: "skipped"; reason: string; mode: SemgrepMode | null }
  | { kind: "failed"; reason: string; mode: SemgrepMode | null }
  | { kind: "ready"; runnerInput: SemgrepRunInput } {
  const mode = resolveSemgrepMode(input);

  if (!mode) {
    return {
      kind: "skipped",
      mode: null,
      reason: "この実行では Semgrep モードが設定されていません。"
    };
  }

  if (mode === "json_ingest") {
    const jsonPath = input.semgrepJsonPath ?? process.env.SEMGREP_JSON_PATH;

    if (!jsonPath) {
      return {
        kind: "failed",
        mode,
        reason: "Semgrep の json_ingest モードでは semgrepJsonPath が必要です。"
      };
    }

    return {
      kind: "ready",
      runnerInput: {
        mode,
        jsonPath
      }
    };
  }

  const repositoryPath = input.repositoryPath ?? process.env.SEMGREP_REPOSITORY_PATH;

  if (!repositoryPath) {
    return {
      kind: "failed",
      mode,
      reason: "Semgrep の local_exec モードでは repositoryPath が必要です。"
    };
  }

  return {
    kind: "ready",
    runnerInput: {
      mode,
      repositoryPath,
      binPath: input.semgrepBin ?? process.env.SEMGREP_BIN,
      binArgs: input.semgrepBinArgs ?? parseArgsEnv(process.env.SEMGREP_BIN_ARGS),
      config: input.semgrepConfig ?? process.env.SEMGREP_CONFIG
    }
  };
}

function resolveZapRequest(input: {
  apiSpecArtifactPath?: string;
  apiSpecFileName?: string;
  apiSpecFormat?: ApiSpecFormat;
  zapMode?: string;
  zapJsonPath?: string;
  zapHtmlPath?: string;
}):
  | { kind: "skipped"; reason: string; mode: ZapMode | null }
  | { kind: "failed"; reason: string; mode: ZapMode | null }
  | { kind: "ready"; runnerInput: ZapRunInput } {
  const apiSpecArtifactPath = input.apiSpecArtifactPath?.trim();
  const apiSpecFileName = input.apiSpecFileName?.trim();
  const apiSpecFormat = input.apiSpecFormat;

  if (!apiSpecArtifactPath && !apiSpecFileName && !apiSpecFormat) {
    return {
      kind: "skipped",
      mode: null,
      reason: "ZAP API スキャンに必要な API 仕様ファイルと形式が指定されていません。"
    };
  }

  if (!apiSpecArtifactPath || !apiSpecFileName) {
    return {
      kind: "failed",
      mode: normalizeZapMode(input.zapMode),
      reason: "ZAP API スキャンには apiSpecFile のアップロードが必要です。"
    };
  }

  if (!apiSpecFormat) {
    return {
      kind: "failed",
      mode: normalizeZapMode(input.zapMode),
      reason: "ZAP API スキャンには apiSpecFormat が必要です。"
    };
  }

  const mode = resolveZapMode(input);

  if (mode === "json_ingest") {
    const jsonPath = input.zapJsonPath ?? process.env.ZAP_JSON_PATH;

    if (!jsonPath) {
      return {
        kind: "failed",
        mode,
        reason: "ZAP の json_ingest モードでは zapJsonPath が必要です。"
      };
    }

    return {
      kind: "ready",
      runnerInput: {
        mode,
        apiSpecFormat,
        apiSpecFileName,
        apiSpecArtifactPath,
        jsonPath,
        htmlPath: input.zapHtmlPath ?? process.env.ZAP_HTML_PATH
      }
    };
  }

  return {
    kind: "ready",
    runnerInput: {
      mode,
      apiSpecFormat,
      apiSpecFileName,
      apiSpecArtifactPath
    }
  };
}

function resolveCodeqlRequest(input: {
  codeqlMode?: CodeqlMode;
  repositoryVisibility?: RepositoryVisibility;
  codeqlReportAbsolutePath?: string;
  codeqlReportFileName?: string;
}):
  | { kind: "skipped"; reason: string; mode: CodeqlMode | null }
  | { kind: "failed"; reason: string; mode: CodeqlMode | null }
  | { kind: "ready"; runnerInput: CodeqlRunInput } {
  const reportAbsolutePath = input.codeqlReportAbsolutePath?.trim();
  const reportFileName = input.codeqlReportFileName?.trim();
  const repositoryVisibility = input.repositoryVisibility;
  const mode = resolveCodeqlMode(input);

  if (!reportAbsolutePath && !reportFileName && !repositoryVisibility && !mode) {
    return {
      kind: "skipped",
      mode: null,
      reason: "CodeQL レポートファイルとリポジトリ公開範囲が指定されていません。"
    };
  }

  if (repositoryVisibility === "private") {
    return {
      kind: "skipped",
      mode,
      reason: "MVP では CodeQL 取り込みは public リポジトリに限定しています。"
    };
  }

  if (repositoryVisibility !== "public") {
    return {
      kind: "failed",
      mode,
      reason: "CodeQL 取り込みには repositoryVisibility=public が必要です。"
    };
  }

  if (!reportAbsolutePath || !reportFileName) {
    return {
      kind: "failed",
      mode,
      reason: "CodeQL 取り込みには codeqlReportFile のアップロードが必要です。"
    };
  }

  if (!mode) {
    return {
      kind: "failed",
      mode: null,
      reason: "CodeQL 取り込みには codeqlMode が必要です。"
    };
  }

  if (mode === "sarif_ingest") {
    return {
      kind: "ready",
      runnerInput: {
        mode,
        reportPath: reportAbsolutePath,
        reportFileName,
        repositoryVisibility
      }
    };
  }

  return {
    kind: "ready",
    runnerInput: {
      mode,
      reportPath: reportAbsolutePath,
      reportFileName,
      repositoryVisibility
    }
  };
}

function resolveSemgrepMode(input: {
  semgrepMode?: string;
  repositoryPath?: string;
  semgrepJsonPath?: string;
}): SemgrepMode | null {
  const requestedMode = normalizeSemgrepMode(input.semgrepMode);

  if (requestedMode) {
    return requestedMode;
  }

  const envMode = normalizeSemgrepMode(process.env.SEMGREP_MODE);

  if (envMode) {
    return envMode;
  }

  if (input.semgrepJsonPath || process.env.SEMGREP_JSON_PATH) {
    return "json_ingest";
  }

  if (input.repositoryPath || process.env.SEMGREP_REPOSITORY_PATH) {
    return "local_exec";
  }

  return null;
}

function normalizeSemgrepMode(value?: string): SemgrepMode | null {
  if (value === "json_ingest" || value === "local_exec") {
    return value;
  }

  return null;
}

function resolveZapMode(input: {
  zapMode?: string;
  zapJsonPath?: string;
}): ZapMode {
  const requestedMode = normalizeZapMode(input.zapMode);

  if (requestedMode) {
    return requestedMode;
  }

  const envMode = normalizeZapMode(process.env.ZAP_MODE);

  if (envMode) {
    return envMode;
  }

  if (input.zapJsonPath || process.env.ZAP_JSON_PATH) {
    return "json_ingest";
  }

  return "mock_api_scan";
}

function normalizeZapMode(value?: string): ZapMode | null {
  if (value === "json_ingest" || value === "mock_api_scan") {
    return value;
  }

  return null;
}

function resolveCodeqlMode(input: {
  codeqlMode?: CodeqlMode;
  codeqlReportFileName?: string;
}): CodeqlMode | null {
  const requestedMode = normalizeCodeqlMode(input.codeqlMode);

  if (requestedMode) {
    return requestedMode;
  }

  const envMode = normalizeCodeqlMode(process.env.CODEQL_MODE as CodeqlMode | undefined);

  if (envMode) {
    return envMode;
  }

  if (input.codeqlReportFileName?.toLowerCase().endsWith(".sarif")) {
    return "sarif_ingest";
  }

  if (input.codeqlReportFileName?.toLowerCase().endsWith(".json")) {
    return "json_ingest";
  }

  return null;
}

function normalizeCodeqlMode(value?: string | null): CodeqlMode | null {
  if (value === "sarif_ingest" || value === "json_ingest") {
    return value;
  }

  return null;
}

function formatCodeqlFailureSummary(mode: CodeqlMode | null, message: string) {
  const prefix = mode ? `[${mode}] ` : "";

  if (message.startsWith("CodeQL JSON report is invalid") || message.startsWith("CodeQL SARIF report is invalid")) {
    return `${prefix}アップロードされた CodeQL レポートが不正なため、取り込みに失敗しました。`;
  }

  return `${prefix}CodeQL 取り込みに失敗しました。`;
}

function parseArgsEnv(value?: string) {
  if (!value?.trim()) {
    return undefined;
  }

  const trimmed = value.trim();

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;

    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  }

  return trimmed.split(/\s+/).filter(Boolean);
}

function buildFinalizeSummary(input: {
  figmaStatus: "success" | "skipped" | "failed";
  figmaMakeStatus: "success" | "skipped" | "failed";
  figmaCheckStatus: "success" | "skipped" | "failed";
  semgrepStatus: "success" | "skipped" | "failed";
  zapStatus: "success" | "skipped" | "failed";
  codeqlStatus: "success" | "skipped" | "failed";
}) {
  const failedSteps = [
    input.figmaStatus === "failed" ? "Figma" : null,
    input.figmaMakeStatus === "failed" ? "Figma Make" : null,
    input.figmaCheckStatus === "failed" ? "Figma Check" : null,
    input.semgrepStatus === "failed" ? "Semgrep" : null,
    input.zapStatus === "failed" ? "ZAP" : null,
    input.codeqlStatus === "failed" ? "CodeQL" : null
  ].filter((value): value is string => value !== null);

  if (failedSteps.length === 0) {
    return "総評と正規化済みの指摘成果物を保存しました。";
  }

  return `総評と正規化済みの指摘成果物を保存しました。なお、${failedSteps.join(" / ")} は失敗しています。`;
}

function buildIngestSummary(input: { hasApiSpec: boolean; hasCodeqlReport: boolean }) {
  if (input.hasApiSpec && input.hasCodeqlReport) {
    return "スクリーンショット、API 仕様ファイル、CodeQL レポート、説明入力、ナレッジ要約を保存しました。";
  }

  if (input.hasApiSpec) {
    return "スクリーンショット、API 仕様ファイル、説明入力、ナレッジ要約を保存しました。";
  }

  if (input.hasCodeqlReport) {
    return "スクリーンショット、CodeQL レポート、説明入力、ナレッジ要約を保存しました。";
  }

  return "スクリーンショット、説明入力、ナレッジ要約を保存しました。";
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function requireStepId(stepIds: Map<string, string>, stepName: string) {
  const stepId = stepIds.get(stepName);

  if (!stepId) {
    throw new Error(`${stepName} step is missing`);
  }

  return stepId;
}
