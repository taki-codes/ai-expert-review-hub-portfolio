import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const verificationDir = path.join(appRoot, ".verification-smoke");
const port = 3111;
const baseUrl = `http://127.0.0.1:${port}`;
const figmaStubPort = 3112;
const figmaStubBaseUrl = `http://127.0.0.1:${figmaStubPort}`;

async function main() {
  await ensureBuildExists();
  await mkdir(verificationDir, { recursive: true });

  const summary = {
    verifiedAt: new Date().toISOString(),
    port,
    runs: {},
    realFigma: {}
  };
  let happy;
  let failed;
  let skipped;
  const server = startServer({
    FIGMA_ADAPTER_MODE: "mock"
  });

  try {
    await waitForServer(server);
    await verifyCreatePage();

    happy = await runHappyCase();
    failed = await runFailedCase();
    skipped = await runSkippedCase();
    await archiveReviewRun(skipped.runId);
    await verifyReviewListApiAndPage({
      happyRunId: happy.runId,
      happyRunTitle: happy.runTitle,
      happyRunTags: happy.runTags,
      happyRunMemo: happy.runMemo,
      happyExecutiveSummary: happy.expectedExecutiveSummary,
      failedRunId: failed.runId,
      archivedRunId: skipped.runId
    });
    await verifyReviewCompareApiAndPage({
      leftRunId: happy.runId,
      leftRunTitle: happy.runTitle,
      leftRunTags: happy.runTags,
      leftRunMemo: happy.runMemo,
      leftExecutiveSummary: happy.expectedExecutiveSummary,
      rightRunId: failed.runId,
      rightRunTags: failed.runTags
    });
    await verifyReviewArtifactsPage({
      runId: happy.runId,
      runTitle: happy.runTitle,
      sampleArtifactPath: happy.sampleArtifactPath,
      expectedAbsoluteArtifactPath: happy.expectedAbsoluteArtifactPath,
      expectedPreviewLine: happy.expectedPreviewLine,
      expectedPreviewHint: happy.expectedPreviewHint,
      reportArtifactPath: happy.reportArtifactPath,
      expectedAbsoluteReportArtifactPath: happy.expectedAbsoluteReportArtifactPath,
      expectedReportPreviewLine: happy.expectedReportPreviewLine,
      expectedReportPreviewHint: happy.expectedReportPreviewHint,
      figmaCheckReportPath: happy.figmaCheckReportPath,
      figmaCheckSummaryPath: happy.figmaCheckSummaryPath
    });
    await verifyArchivedComparePage({
      archivedRunId: skipped.runId,
      otherRunId: failed.runId
    });
    await restoreReviewRun(skipped.runId);
    await verifyRestoredListBehavior(skipped.runId);
  } finally {
    stopServer(server);
  }

  summary.runs = {
    happy: happy?.runId ?? "",
    failed: failed?.runId ?? "",
    skipped: skipped?.runId ?? ""
  };

  const figmaStub = await startFigmaStubServer();
  const realServer = startServer({
    FIGMA_ADAPTER_MODE: "real",
    FIGMA_ACCESS_TOKEN: "smoke-figma-token",
    FIGMA_BASE_URL: figmaStubBaseUrl
  });

  try {
    await waitForServer(realServer);

    const success = await runRealFigmaSuccessCase();
    const failed = await runRealFigmaFailedCase();
    const skipped = await runRealFigmaSkippedCase();
    await verifyRealFigmaDetailPages({
      successRunId: success.runId,
      failedRunId: failed.runId,
      skippedRunId: skipped.runId
    });

    summary.realFigma = {
      success: success.runId,
      failed: failed.runId,
      skipped: skipped.runId
    };
  } finally {
    stopServer(realServer);
    await stopFigmaStubServer(figmaStub);
  }

  await writeJson("smoke-results.json", summary);
  console.log(JSON.stringify(summary, null, 2));
}

async function verifyCreatePage() {
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /name="runFigmaMake"/);
  assert.match(html, /name="figmaMakeMode"/);
  assert.match(html, /name="figmaMakePrompt"/);
  assert.match(html, /name="figmaMakeOutputText"/);
  assert.match(html, /name="figmaCheckMode"/);
  assert.match(html, /name="figmaCheckReportFile"/);
  assert.match(html, /name="figmaCheckSummaryText"/);
  assert.match(html, /レビューを作成/);
  assert.match(html, /レビュー一覧を見る/);
  assert.match(html, /基本入力/);
  assert.match(html, /タイトル/);
  assert.match(html, /タグ/);
  assert.match(html, /メモ/);
  assert.match(html, /スクリーンショットを追加/);
  assert.match(html, /説明/);
  assert.match(html, /Figma コンテキスト/);
  assert.match(html, /Semgrep 入力/);
  assert.match(html, /ZAP API スキャン入力/);
  assert.match(html, /CodeQL 取り込み/);
  assert.match(html, /レビューを作成して詳細を開く/);
}

async function runHappyCase() {
  const runTitle = "Smoke titled happy run";
  const runTags = ["smoke", "landing", "happy-path"];
  const runMemo = "Memo for smoke happy path: compare this run against later failure-path regressions.";
  const expectedExecutiveSummary =
    "まずは「主要アクションが視線を集めきれていません」への対応を優先し、保存済みナレッジの前提と整合する形で導線の分かりやすさを整えるのが妥当です。";
  const response = await createReview(async (form) => {
    form.append("runTitle", runTitle);
    form.append("runTags", runTags.join(", "));
    form.append("runMemo", runMemo);
    form.append("explanatoryText", "Smoke test happy path.");
    form.append("runFigma", "true");
    form.append("figmaUrl", "https://www.figma.com/file/AbCdEf1234567890/Home?node-id=12-34");
    form.append("runFigmaMake", "true");
    form.append("figmaMakeMode", "manual_capture");
    form.append("figmaMakePrompt", "Improve the CTA hierarchy while keeping the hero layout stable.");
    form.append(
      "figmaMakeOutputText",
      "- Tighten the hero heading width so the CTA becomes the second focal point.\n- Increase the primary CTA contrast and vertical spacing.\n- Reduce secondary link emphasis near the primary CTA."
    );
    form.append("figmaCheckMode", "manual_ingest");
    form.append(
      "figmaCheckSummaryText",
      "Title: Card shadow token mismatch\nSeverity: low\nCategory: elevation\nRecommendation: Align the card shadow back to the approved elevation token.\nDescription: Card shadow uses a legacy elevation token that no longer matches the system scale."
    );
    form.append(
      "figmaCheckReportFile",
      await loadFixtureFile("figma", "sample-check-report.md", "text/markdown")
    );
    form.append("semgrepMode", "json_ingest");
    form.append("semgrepJsonPath", fixturePath("semgrep", "sample-report.json"));
    form.append("apiSpecFormat", "openapi");
    form.append("zapMode", "mock_api_scan");
    form.append("apiSpecFile", await loadFixtureFile("zap", "sample-api.yaml", "application/yaml"));
    form.append("repositoryVisibility", "public");
    form.append("codeqlMode", "sarif_ingest");
    form.append("codeqlReportFile", await loadFixtureFile("codeql", "sample.sarif", "application/json"));
  });

  const detail = await fetchDetail(response.reviewRunId);
  assertTopLevelShape(detail);
  assert.equal(detail.run.status, "completed");
  assert.equal(detail.run.title, runTitle);
  assert.deepEqual(detail.run.tags, runTags);
  assert.equal(detail.run.memo, runMemo);
  assert.equal(findStep(detail, "figma").status, "success");
  assert.equal(findStep(detail, "figmaMake").status, "success");
  assert.equal(findStep(detail, "figmaCheckDesigns").status, "success");
  assert.equal(findStep(detail, "semgrep").status, "success");
  assert.equal(findStep(detail, "zap").status, "success");
  assert.equal(findStep(detail, "codeql").status, "success");
  assert.equal(detail.executiveSummary, expectedExecutiveSummary);
  assert.equal(detail.displaySummary, expectedExecutiveSummary);
  assert.ok(detail.findings.some((finding) => finding.sourceTool === "gpt"));
  assert.ok(detail.findings.some((finding) => finding.sourceTool === "figma"));
  assert.ok(detail.findings.some((finding) => finding.sourceTool === "figma_make"));
  assert.ok(detail.findings.some((finding) => finding.sourceTool === "figma_check"));
  assert.ok(
    detail.findings.some(
      (finding) =>
        /主要アクションが視線を集めきれていません/.test(finding.title ?? "") &&
        /初めて訪れたユーザー/.test(finding.description ?? "") &&
        /主要ボタンのコントラスト/.test(finding.suggestion ?? "")
    )
  );
  assert.ok(detail.findings.some((finding) => finding.sourceTool === "gpt" && finding.title && finding.suggestion));
  assert.ok(detail.findings.some((finding) => finding.sourceTool === "figma" && finding.title && finding.suggestion));
  assert.ok(
    detail.findings.some(
      (finding) =>
        finding.sourceTool === "figma_make" &&
        /CTA/.test(finding.description ?? "") &&
        /Improve the CTA hierarchy/.test(finding.suggestion ?? "")
    )
  );
  assert.ok(
    detail.findings.some(
      (finding) =>
        finding.sourceTool === "figma_check" &&
        /legacy elevation token|corner radius values|spacing tokens are mixed/i.test(finding.description ?? "")
    )
  );
  assert.ok(
    detail.findings.some(
      (finding) =>
        finding.sourceTool === "figma_check" &&
        finding.category === "elevation" &&
        finding.severity === "low" &&
        /approved elevation token|approved elevation scale token/i.test(finding.suggestion ?? "")
    )
  );
  assert.ok(detail.artifactsByStep.figma.length >= 2);
  assert.ok(detail.artifactsByStep.figmaMake.length >= 3);
  assert.ok(detail.artifactsByStep.figmaCheckDesigns.length >= 1);
  assert.ok(detail.artifactsByStep.zap.length >= 1);
  assert.ok(detail.artifactsByStep.codeql.length >= 1);
  const sampleArtifactPath =
    detail.artifactsByStep.gemini.find((artifact) => artifact.usage === "request")?.path ??
    detail.artifacts.find((artifact) => artifact.usage === "request")?.path ??
    "";
  const reportArtifacts = [
    ...detail.artifactsByStep.zap.filter((artifact) => artifact.usage === "report"),
    ...detail.artifactsByStep.semgrep.filter((artifact) => artifact.usage === "report"),
    ...detail.artifactsByStep.codeql.filter((artifact) => artifact.usage === "report"),
    ...detail.artifactsByStep.figmaCheckDesigns.filter((artifact) => artifact.usage === "report"),
    ...detail.artifactsByStep.figma.filter((artifact) => artifact.usage === "report"),
    ...detail.artifacts.filter((artifact) => artifact.usage === "report")
  ];
  const reportArtifactPath =
    reportArtifacts.find((artifact) => /\.(json|sarif|txt|log|md|ya?ml)$/i.test(artifact.path))?.path ??
    reportArtifacts[0]?.path ??
    "";
  const figmaCheckReportPath =
    detail.artifactsByStep.figmaCheckDesigns.find((artifact) => artifact.artifactType === "figma_check_report")?.path ?? "";
  const figmaCheckSummaryPath =
    detail.artifactsByStep.figmaCheckDesigns.find((artifact) => artifact.artifactType === "figma_check_summary")?.path ?? "";
  assert.ok(sampleArtifactPath);
  assert.ok(reportArtifactPath);
  assert.ok(figmaCheckReportPath);
  assert.ok(figmaCheckSummaryPath);
  const expectedAbsoluteArtifactPath = path.resolve(
    appRoot,
    process.env.ARTIFACT_ROOT ?? "../../data/review-runs",
    sampleArtifactPath
  );
  const expectedAbsoluteReportArtifactPath = path.resolve(
    appRoot,
    process.env.ARTIFACT_ROOT ?? "../../data/review-runs",
    reportArtifactPath
  );
  const expectedPreviewLine = await readExpectedPreviewLine(expectedAbsoluteArtifactPath);
  const expectedReportPreviewLine = await readExpectedPreviewLine(expectedAbsoluteReportArtifactPath);
  const expectedPreviewHint = extractPreviewHint(expectedPreviewLine);
  const expectedReportPreviewHint = extractPreviewHint(expectedReportPreviewLine);

  await writeJson("happy-detail.json", detail);
  return {
    runId: response.reviewRunId,
    runTitle,
    runTags,
    runMemo,
    expectedExecutiveSummary,
    sampleArtifactPath,
    expectedAbsoluteArtifactPath,
    expectedPreviewLine,
    expectedPreviewHint,
    reportArtifactPath,
    expectedAbsoluteReportArtifactPath,
    expectedReportPreviewLine,
    expectedReportPreviewHint,
    figmaCheckReportPath,
    figmaCheckSummaryPath
  };
}

async function runFailedCase() {
  const runTags = ["smoke", "failure-path"];
  const response = await createReview(async (form) => {
    form.append("runTags", runTags.join(", "));
    form.append("explanatoryText", "Smoke test failed path.");
    form.append("repositoryVisibility", "public");
    form.append("codeqlMode", "json_ingest");
    form.append(
      "codeqlReportFile",
      await loadFixtureFile("codeql", "invalid-normalized.json", "application/json")
    );
  });

  const detail = await fetchDetail(response.reviewRunId);
  assertTopLevelShape(detail);
  assert.equal(detail.run.status, "partial_success");
  assert.deepEqual(detail.run.tags, runTags);
  assert.equal(findStep(detail, "codeql").status, "failed");
  assert.equal(findStep(detail, "finalize").status, "success");
  assert.match(
    findStep(detail, "codeql").errorMessage ?? "",
    /CodeQL JSON report is invalid: `findings` must be an array\./
  );

  await writeJson("failed-detail.json", detail);
  return { runId: response.reviewRunId, runTags };
}

async function runSkippedCase() {
  const response = await createReview(async (form) => {
    form.append("explanatoryText", "Smoke test skipped path.");
    form.append("runFigma", "true");
    form.append("repositoryVisibility", "private");
    form.append("codeqlMode", "sarif_ingest");
    form.append("codeqlReportFile", await loadFixtureFile("codeql", "sample.sarif", "application/json"));
  });

  const detail = await fetchDetail(response.reviewRunId);
  assertTopLevelShape(detail);
  assert.equal(detail.run.status, "completed");
  assert.equal(detail.run.archived, false);
  assert.equal(findStep(detail, "figma").status, "skipped");
  assert.equal(findStep(detail, "figmaMake").status, "skipped");
  assert.equal(findStep(detail, "figmaCheckDesigns").status, "skipped");
  assert.equal(findStep(detail, "codeql").status, "skipped");
  assert.equal(
    findStep(detail, "figma").skippedReason,
    "read-only コンテキスト取得に必要な Figma URL が指定されていません。"
  );
  assert.equal(
    findStep(detail, "codeql").skippedReason,
    "MVP では CodeQL 取り込みは public リポジトリに限定しています。"
  );

  await writeJson("skipped-detail.json", detail);
  return { runId: response.reviewRunId };
}

async function runRealFigmaSuccessCase() {
  const response = await createReview(async (form) => {
    form.append("explanatoryText", "Real Figma adapter success path.");
    form.append("runFigma", "true");
    form.append("figmaUrl", "https://www.figma.com/file/RealSmokeSuccess/Workbench?node-id=12-34");
  });

  const detail = await fetchDetail(response.reviewRunId);
  assertTopLevelShape(detail);
  assert.equal(detail.run.status, "completed");
  assert.equal(findStep(detail, "figma").status, "success");
  assert.equal(findStep(detail, "finalize").status, "success");
  assert.ok(detail.artifactsByStep.figma.length >= 3);
  assert.ok(detail.findings.some((finding) => finding.sourceTool === "figma"));

  await writeJson("real-figma-success-detail.json", detail);
  return { runId: response.reviewRunId };
}

async function runRealFigmaFailedCase() {
  const response = await createReview(async (form) => {
    form.append("explanatoryText", "Real Figma adapter failed path.");
    form.append("runFigma", "true");
    form.append("figmaUrl", "https://www.figma.com/file/RealSmokeMissing/Workbench?node-id=12-34");
  });

  const detail = await fetchDetail(response.reviewRunId);
  assertTopLevelShape(detail);
  assert.equal(detail.run.status, "partial_success");
  assert.equal(findStep(detail, "figma").status, "failed");
  assert.equal(findStep(detail, "finalize").status, "success");
  assert.match(findStep(detail, "figma").errorMessage ?? "", /\[real:read-only\] Figma context lookup failed with 404 Not Found\./);
  assert.ok(detail.artifactsByStep.figma.length >= 3);

  await writeJson("real-figma-failed-detail.json", detail);
  return { runId: response.reviewRunId };
}

async function runRealFigmaSkippedCase() {
  const response = await createReview(async (form) => {
    form.append("explanatoryText", "Real Figma adapter skipped path.");
    form.append("runFigma", "true");
  });

  const detail = await fetchDetail(response.reviewRunId);
  assertTopLevelShape(detail);
  assert.equal(detail.run.status, "completed");
  assert.equal(findStep(detail, "figma").status, "skipped");
  assert.equal(findStep(detail, "finalize").status, "success");

  await writeJson("real-figma-skipped-detail.json", detail);
  return { runId: response.reviewRunId };
}

async function verifyRealFigmaDetailPages(input) {
  const failedPageResponse = await fetch(`${baseUrl}/reviews/${encodeURIComponent(input.failedRunId)}`);
  assert.equal(failedPageResponse.status, 200);
  const failedHtml = await failedPageResponse.text();
  assert.match(failedHtml, /Figma 判定/);
  assert.match(failedHtml, /アクセス不可または参照不可ファイル/);

  const skippedPageResponse = await fetch(`${baseUrl}/reviews/${encodeURIComponent(input.skippedRunId)}`);
  assert.equal(skippedPageResponse.status, 200);
  const skippedHtml = await skippedPageResponse.text();
  assert.match(skippedHtml, /Figma 判定/);
  assert.match(skippedHtml, /URL未指定/);

  const successPageResponse = await fetch(`${baseUrl}/reviews/${encodeURIComponent(input.successRunId)}`);
  assert.equal(successPageResponse.status, 200);
  const successHtml = await successPageResponse.text();
  assert.doesNotMatch(successHtml, /Figma 判定/);
}

async function archiveReviewRun(reviewRunId) {
  const response = await fetch(`${baseUrl}/api/reviews/${reviewRunId}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ archived: true })
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.reviewRunId, reviewRunId);
  assert.equal(payload.archived, true);

  const detail = await fetchDetail(reviewRunId);
  assert.equal(detail.run.archived, true);
}

async function restoreReviewRun(reviewRunId) {
  const response = await fetch(`${baseUrl}/api/reviews/${reviewRunId}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ archived: false })
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.reviewRunId, reviewRunId);
  assert.equal(payload.archived, false);

  const detail = await fetchDetail(reviewRunId);
  assert.equal(detail.run.archived, false);
}

async function verifyReviewListApiAndPage(input) {
  const listResponse = await fetch(`${baseUrl}/api/reviews`);
  assert.equal(listResponse.status, 200);
  const listPayload = await listResponse.json();
  assert.ok(Array.isArray(listPayload.items));
  // One of the three fixture runs is archived and hidden by default.
  assert.ok(listPayload.total >= 2);
  assert.equal(listPayload.appliedStatusFilter, "all");
  assert.equal(listPayload.page, 1);
  assert.equal(listPayload.pageSize, 10);
  assert.equal(listPayload.appliedTagFilter, "");
  assert.equal(listPayload.appliedShowArchived, false);
  assert.equal(listPayload.appliedSort, "createdAt_desc");
  assert.ok(listPayload.items.every((item) => item.archived === false));
  assert.ok(listPayload.items.some((item) => item.id === input.happyRunId && item.title === input.happyRunTitle));
  assert.ok(listPayload.items.some((item) => item.id === input.happyRunId && item.memo === input.happyRunMemo));
  assert.ok(
    listPayload.items.some(
      (item) => item.id === input.happyRunId && item.displaySummary === input.happyExecutiveSummary
    )
  );
  assert.ok(listPayload.items.every((item) => item.id !== input.archivedRunId));
  assert.ok(
    listPayload.items.some(
      (item) =>
        item.id === input.happyRunId &&
        Array.isArray(item.tags) &&
        input.happyRunTags.every((tag) => item.tags.includes(tag))
    )
  );

  const keyword = input.failedRunId.slice(0, 8);
  const pagedResponse = await fetch(
    `${baseUrl}/api/reviews?page=1&pageSize=2&sort=updatedAt_desc&keyword=${encodeURIComponent(keyword)}`
  );
  assert.equal(pagedResponse.status, 200);
  const pagedPayload = await pagedResponse.json();
  assert.equal(pagedPayload.page, 1);
  assert.equal(pagedPayload.pageSize, 2);
  assert.equal(pagedPayload.appliedSort, "updatedAt_desc");
  assert.equal(pagedPayload.appliedKeywordFilter, keyword);
  assert.ok(pagedPayload.total >= 1);
  assert.ok(pagedPayload.totalPages >= 1);
  assert.ok(pagedPayload.items.some((item) => item.id === input.failedRunId));

  const keywordTagResponse = await fetch(`${baseUrl}/api/reviews?keyword=${encodeURIComponent(input.happyRunTags[1])}`);
  assert.equal(keywordTagResponse.status, 200);
  const keywordTagPayload = await keywordTagResponse.json();
  assert.ok(keywordTagPayload.items.some((item) => item.id === input.happyRunId));

  const keywordMemoResponse = await fetch(
    `${baseUrl}/api/reviews?keyword=${encodeURIComponent("failure-path regressions")}`
  );
  assert.equal(keywordMemoResponse.status, 200);
  const keywordMemoPayload = await keywordMemoResponse.json();
  assert.ok(keywordMemoPayload.items.some((item) => item.id === input.happyRunId));

  const tagFilteredResponse = await fetch(`${baseUrl}/api/reviews?tag=${encodeURIComponent(input.happyRunTags[1])}`);
  assert.equal(tagFilteredResponse.status, 200);
  const tagFilteredPayload = await tagFilteredResponse.json();
  assert.equal(tagFilteredPayload.appliedTagFilter, input.happyRunTags[1]);
  assert.ok(tagFilteredPayload.items.some((item) => item.id === input.happyRunId));
  assert.ok(tagFilteredPayload.items.every((item) => item.tags.includes(input.happyRunTags[1])));

  const archivedListResponse = await fetch(`${baseUrl}/api/reviews?showArchived=true`);
  assert.equal(archivedListResponse.status, 200);
  const archivedListPayload = await archivedListResponse.json();
  assert.equal(archivedListPayload.appliedShowArchived, true);
  assert.ok(archivedListPayload.total >= 3);
  assert.ok(archivedListPayload.items.some((item) => item.id === input.archivedRunId && item.archived === true));

  const filteredResponse = await fetch(
    `${baseUrl}/api/reviews?status=partial_success&keyword=${encodeURIComponent(keyword)}&page=1&pageSize=1&sort=updatedAt_desc`
  );
  assert.equal(filteredResponse.status, 200);
  const filteredPayload = await filteredResponse.json();
  assert.equal(filteredPayload.appliedStatusFilter, "partial_success");
  assert.equal(filteredPayload.appliedKeywordFilter, keyword);
  assert.equal(filteredPayload.page, 1);
  assert.equal(filteredPayload.pageSize, 1);
  assert.equal(filteredPayload.appliedSort, "updatedAt_desc");
  assert.ok(filteredPayload.items.every((item) => item.status === "partial_success"));

  const pageResponse = await fetch(
    `${baseUrl}/reviews?status=partial_success&keyword=${encodeURIComponent(keyword)}&page=1&pageSize=1&sort=updatedAt_desc`
  );
  assert.equal(pageResponse.status, 200);
  const pageHtml = await pageResponse.text();
  assert.match(pageHtml, /<html[^>]*lang=\"ja\"/);
  assert.match(pageHtml, /最近のレビュー実行/);
  assert.match(pageHtml, /実行ID、タイトル、タグ、メモ、要約、ステップ文言で検索/);
  assert.match(pageHtml, /検索対象/);
  assert.match(pageHtml, /アーカイブを表示/);
  assert.match(pageHtml, /レビュー一覧のページネーション/);
  assert.match(pageHtml, /前へ/);
  assert.match(pageHtml, /次へ/);

  const titleListPageResponse = await fetch(
    `${baseUrl}/reviews?keyword=${encodeURIComponent(input.happyRunTitle)}&page=1&pageSize=5&sort=createdAt_desc`
  );
  assert.equal(titleListPageResponse.status, 200);
  const titleListPageHtml = await titleListPageResponse.text();
  assert.match(titleListPageHtml, new RegExp(input.happyRunTitle));
  assert.match(titleListPageHtml, new RegExp(input.happyRunTags[0]));
  assert.match(titleListPageHtml, /メモ/);

  const memoListPageResponse = await fetch(
    `${baseUrl}/reviews?keyword=${encodeURIComponent("failure-path regressions")}&page=1&pageSize=5&sort=createdAt_desc`
  );
  assert.equal(memoListPageResponse.status, 200);
  const memoListPageHtml = await memoListPageResponse.text();
  assert.match(memoListPageHtml, /Memo for smoke happy path/);
  assert.match(memoListPageHtml, /主要アクションが視線を集めきれていません/);
  assert.match(memoListPageHtml, /検索:/);
  assert.match(memoListPageHtml, /failure-path regressions/);

  const tagListPageResponse = await fetch(
    `${baseUrl}/reviews?tag=${encodeURIComponent(input.happyRunTags[1])}&page=1&pageSize=5&sort=createdAt_desc`
  );
  assert.equal(tagListPageResponse.status, 200);
  const tagListPageHtml = await tagListPageResponse.text();
  assert.match(tagListPageHtml, /よく使うタグ/);
  assert.match(tagListPageHtml, /タグを解除/);
  assert.match(tagListPageHtml, new RegExp(input.happyRunTags[1]));

  const archivedListPageResponse = await fetch(`${baseUrl}/reviews?showArchived=true&page=1&pageSize=10`);
  assert.equal(archivedListPageResponse.status, 200);
  const archivedListPageHtml = await archivedListPageResponse.text();
  assert.match(archivedListPageHtml, /アーカイブを非表示/);
  assert.match(archivedListPageHtml, /アーカイブを含む/);
  assert.match(archivedListPageHtml, /アーカイブ済み/);

  const compareSelectionPageResponse = await fetch(
    `${baseUrl}/reviews?status=partial_success&keyword=${encodeURIComponent(keyword)}&page=1&pageSize=1&sort=updatedAt_desc&compareLeft=${encodeURIComponent(input.happyRunId)}&compareRight=${encodeURIComponent(input.failedRunId)}`
  );
  assert.equal(compareSelectionPageResponse.status, 200);
  const compareSelectionHtml = await compareSelectionPageResponse.text();
  assert.match(compareSelectionHtml, /左枠/);
  assert.match(compareSelectionHtml, /右枠/);
  assert.match(compareSelectionHtml, new RegExp(input.happyRunId));
  assert.match(compareSelectionHtml, new RegExp(input.failedRunId));

  const archivedDetailPageResponse = await fetch(`${baseUrl}/reviews/${encodeURIComponent(input.archivedRunId)}`);
  assert.equal(archivedDetailPageResponse.status, 200);
  const archivedDetailPageHtml = await archivedDetailPageResponse.text();
  assert.match(archivedDetailPageHtml, /アーカイブ済み/);
  assert.match(archivedDetailPageHtml, /アーカイブ状態/);
  assert.match(archivedDetailPageHtml, /アーカイブを解除/);
}

async function verifyReviewCompareApiAndPage(input) {
  const compareResponse = await fetch(
    `${baseUrl}/api/reviews/compare?left=${encodeURIComponent(input.leftRunId)}&right=${encodeURIComponent(input.rightRunId)}`
  );
  assert.equal(compareResponse.status, 200);
  const comparePayload = await compareResponse.json();
  assert.equal(comparePayload.left.id, input.leftRunId);
  assert.equal(comparePayload.right.id, input.rightRunId);
  assert.equal(comparePayload.left.title, input.leftRunTitle);
  assert.deepEqual(comparePayload.left.tags, input.leftRunTags);
  assert.equal(comparePayload.left.memo, input.leftRunMemo);
  assert.equal(comparePayload.left.displaySummary, input.leftExecutiveSummary);
  assert.deepEqual(comparePayload.right.tags, input.rightRunTags);
  assert.ok(typeof comparePayload.left.findingCount === "number");
  assert.ok(typeof comparePayload.right.findingCount === "number");

  const pageResponse = await fetch(
    `${baseUrl}/reviews/compare?left=${encodeURIComponent(input.leftRunId)}&right=${encodeURIComponent(input.rightRunId)}`
  );
  assert.equal(pageResponse.status, 200);
  const pageHtml = await pageResponse.text();
  assert.match(pageHtml, /2件比較/);
  assert.match(pageHtml, /統合差分要約/);
  assert.match(pageHtml, /Gemini 主な指摘/);
  assert.match(pageHtml, /Figma Check 監査差分/);
  assert.match(pageHtml, /Figma Make 改善案差分/);
  assert.match(pageHtml, /主な差分/);
  assert.match(pageHtml, /ステータスは/);
  assert.match(pageHtml, /失敗ステップは/);
  assert.match(pageHtml, /差分の要約/);
  assert.match(pageHtml, /ステータス差分/);
  assert.match(pageHtml, /重要度別の差分/);
  assert.match(pageHtml, /ツール別の差分/);
  assert.match(pageHtml, /Figma Check 監査差分/);
  assert.match(pageHtml, /Figma Check 件数差分/);
  assert.match(pageHtml, /Figma Check 重要度差分/);
  assert.match(pageHtml, /Figma Check カテゴリ差分/);
  assert.match(pageHtml, /Figma Make 改善案差分/);
  assert.match(pageHtml, /Figma Make 件数差分/);
  assert.match(pageHtml, /Figma Make テーマ差分/);
  assert.match(pageHtml, /Figma Make テーマ別の差分/);
  assert.match(pageHtml, /cta|CTA|hierarchy/);
  assert.match(pageHtml, /Button radius inconsistency|components/);
  assert.match(pageHtml, /Card shadow token mismatch|elevation/);
  assert.match(pageHtml, /タグ比較/);
  assert.match(pageHtml, /共通タグ/);
  assert.match(pageHtml, /左のみのタグ/);
  assert.match(pageHtml, /右のみのタグ/);
  assert.match(pageHtml, /選択した実行一覧に戻る/);
  assert.match(pageHtml, new RegExp(input.leftRunTitle));
  assert.match(pageHtml, new RegExp(input.leftRunTags[0]));
  assert.match(pageHtml, /メモ/);
  assert.match(pageHtml, /Memo for smoke happy path/);
  assert.match(pageHtml, /主要アクションが視線を集めきれていません/);
  assert.match(pageHtml, /メモ比較/);
  assert.match(pageHtml, /メモに差分があります/);
  assert.match(pageHtml, new RegExp(input.rightRunTags[1]));
  assert.match(pageHtml, /左の詳細を見る/);
  assert.match(pageHtml, /右の詳細を見る/);

  assert.match(pageHtml, /gpt \/ 優先アクション/);
  assert.match(pageHtml, /figma \/ 補足所見/);

  const detailPageResponse = await fetch(`${baseUrl}/reviews/${encodeURIComponent(input.leftRunId)}`);
  assert.equal(detailPageResponse.status, 200);
  const detailPageHtml = await detailPageResponse.text();
  assert.match(detailPageHtml, new RegExp(input.leftRunTitle));
  assert.match(detailPageHtml, new RegExp(input.leftRunTags[0]));
  assert.match(detailPageHtml, /実行情報/);
  assert.match(detailPageHtml, /メモ/);
  assert.match(detailPageHtml, /主要アクションが視線を集めきれていません/);
  assert.match(detailPageHtml, /gpt \/ 優先アクション/);
  assert.match(detailPageHtml, /figma \/ 補足所見/);
  assert.match(detailPageHtml, /compare this run against later failure-path regressions/);
}

async function verifyArchivedComparePage(input) {
  const response = await fetch(
    `${baseUrl}/reviews/compare?left=${encodeURIComponent(input.archivedRunId)}&right=${encodeURIComponent(input.otherRunId)}`
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /アーカイブ済み/);
  assert.match(html, /アーカイブ状態は/);
  assert.match(html, /アーカイブ状態は左がアーカイブ済み、右が有効です。/);
}

async function verifyReviewArtifactsPage(input) {
  const detailPageResponse = await fetch(`${baseUrl}/reviews/${encodeURIComponent(input.runId)}`);
  assert.equal(detailPageResponse.status, 200);
  const detailPageHtml = await detailPageResponse.text();
  assert.match(detailPageHtml, /開発者向け成果物を見る/);
  assert.match(detailPageHtml, new RegExp(`/reviews/${input.runId}/artifacts`));

  const artifactsPageResponse = await fetch(`${baseUrl}/reviews/${encodeURIComponent(input.runId)}/artifacts`);
  assert.equal(artifactsPageResponse.status, 200);
  const artifactsPageHtml = await artifactsPageResponse.text();
  assert.match(artifactsPageHtml, /Figma Check ingest/);
  assert.match(artifactsPageHtml, /元レポートと抽出結果の対応/);
  assert.match(artifactsPageHtml, /元レポートプレビュー/);
  assert.match(artifactsPageHtml, /抽出された監査指摘/);
  assert.match(artifactsPageHtml, /structured markdown \/ summary text|structured JSON|free text fallback/);
  assert.match(artifactsPageHtml, /Button radius inconsistency/);
  assert.match(artifactsPageHtml, /Card shadow token mismatch/);
  assert.match(artifactsPageHtml, /Heading spacing drift/);
  assert.match(artifactsPageHtml, /開発者向け成果物/);
  assert.match(artifactsPageHtml, /この画面は開発者 \/ 運用担当向けです。/);
  assert.match(artifactsPageHtml, /表示は相対パス \/ コピーは絶対パス/);
  assert.match(artifactsPageHtml, /ステップで絞り込み/);
  assert.match(artifactsPageHtml, /用途で絞り込み/);
  assert.match(artifactsPageHtml, /現在の絞り込み/);
  assert.match(artifactsPageHtml, /よく見る request/);
  assert.match(artifactsPageHtml, /よく見る response/);
  assert.match(artifactsPageHtml, /よく見る report/);
  assert.match(artifactsPageHtml, /JSON プレビュー/);
  assert.match(artifactsPageHtml, /送信内容の確認向け/);
  assert.match(
    artifactsPageHtml,
    new RegExp(input.sampleArtifactPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
  assert.match(
    artifactsPageHtml,
    new RegExp(input.expectedAbsoluteArtifactPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
  assert.match(
    artifactsPageHtml,
    new RegExp(input.figmaCheckReportPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
  assert.match(
    artifactsPageHtml,
    new RegExp(input.figmaCheckSummaryPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
  assert.match(artifactsPageHtml, new RegExp(input.expectedPreviewHint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(artifactsPageHtml, /詳細に戻る/);

  const requestFilteredResponse = await fetch(
    `${baseUrl}/reviews/${encodeURIComponent(input.runId)}/artifacts?step=gemini&usage=request`
  );
  assert.equal(requestFilteredResponse.status, 200);
  const requestFilteredHtml = await requestFilteredResponse.text();
  assert.match(requestFilteredHtml, /現在の絞り込み/);
  assert.match(requestFilteredHtml, /ステップ: gemini/);
  assert.match(requestFilteredHtml, /用途: request/);
  assert.match(requestFilteredHtml, /gemini/);
  assert.match(requestFilteredHtml, /request/);
  assert.match(
    requestFilteredHtml,
    new RegExp(input.sampleArtifactPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
  // React's hydration payload still contains all client props. Check rendered
  // artifact rows rather than treating an embedded path as visible content.
  assert.deepEqual(renderedArtifactPaths(requestFilteredHtml), [input.expectedAbsoluteArtifactPath]);

  const reportFilteredResponse = await fetch(
    `${baseUrl}/reviews/${encodeURIComponent(input.runId)}/artifacts?usage=report`
  );
  assert.equal(reportFilteredResponse.status, 200);
  const reportFilteredHtml = await reportFilteredResponse.text();
  const reportPaths = renderedArtifactPaths(reportFilteredHtml);
  assert.ok(reportPaths.includes(input.expectedAbsoluteReportArtifactPath));
  assert.ok(!reportPaths.includes(input.expectedAbsoluteArtifactPath));
  assert.match(reportFilteredHtml, /用途: report/);
  assert.match(reportFilteredHtml, /report/);
  assert.match(reportFilteredHtml, /スキャン結果や解析レポート/);
  assert.match(
    reportFilteredHtml,
    new RegExp(input.reportArtifactPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
  assert.match(
    reportFilteredHtml,
    new RegExp(input.expectedAbsoluteReportArtifactPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
  assert.match(
    reportFilteredHtml,
    new RegExp(input.expectedReportPreviewHint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  );
}

async function verifyRestoredListBehavior(restoredRunId) {
  const response = await fetch(`${baseUrl}/api/reviews`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.ok(payload.items.some((item) => item.id === restoredRunId && item.archived === false));

  const pageResponse = await fetch(`${baseUrl}/reviews`);
  assert.equal(pageResponse.status, 200);
  const html = await pageResponse.text();
  assert.doesNotMatch(html, /アーカイブを含む/);
}

async function createReview(fillForm) {
  const form = new FormData();
  form.append("screenshot", createSampleScreenshotFile());
  await fillForm(form);

  const response = await fetch(`${baseUrl}/api/reviews`, {
    method: "POST",
    body: form
  });

  const payload = await response.json();
  assert.equal(response.status, 201, JSON.stringify(payload));
  assert.ok(payload.reviewRunId);
  assert.ok(payload.location);
  return payload;
}

async function fetchDetail(reviewRunId) {
  const response = await fetch(`${baseUrl}/api/reviews/${reviewRunId}`);
  assert.equal(response.status, 200);
  return response.json();
}

function assertTopLevelShape(detail) {
  for (const key of [
    "run",
    "steps",
    "findings",
    "artifacts",
    "artifactsByStep",
    "findingsBySeverity",
    "latestStepStatus",
    "executiveSummary",
    "knowledgeSummaryArtifactPath",
    "displaySummary"
  ]) {
    assert.ok(key in detail, `missing detail key: ${key}`);
  }
}

function findStep(detail, stepName) {
  const step = detail.steps.find((entry) => entry.stepName === stepName);
  assert.ok(step, `missing step ${stepName}`);
  return step;
}

function createSampleScreenshotFile() {
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnRslcAAAAASUVORK5CYII=",
    "base64"
  );
  return new File([bytes], "smoke-sample.png", { type: "image/png" });
}

async function loadFixtureFile(...segments) {
  const [group, fileName, mimeType] = segments;
  const absolutePath = fixturePath(group, fileName);
  const bytes = await readFile(absolutePath);
  return new File([bytes], fileName, { type: mimeType });
}

async function readExpectedPreviewLine(absolutePath) {
  const text = await readFile(absolutePath, "utf8");
  const line = text
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry && entry !== "{" && entry !== "[" && entry !== "}" && entry !== "]");

  assert.ok(line, `preview line was not found for ${absolutePath}`);
  return line;
}

function renderedArtifactPaths(html) {
  const entities = { "&amp;": "&", "&quot;": '"', "&#x27;": "'", "&#39;": "'", "&lt;": "<", "&gt;": ">" };
  return Array.from(html.matchAll(/\bdata-copy-path="([^"]*)"/g), (match) =>
    match[1].replace(/&(?:amp|quot|#x27|#39|lt|gt);/g, (entity) => entities[entity])
  );
}

function extractPreviewHint(line) {
  const keyMatch = line.match(/"([^"]+)"/);
  if (keyMatch?.[1]) {
    return keyMatch[1];
  }

  return line.slice(0, 32);
}

function fixturePath(...segments) {
  return path.join(appRoot, "fixtures", ...segments);
}

async function writeJson(fileName, payload) {
  await writeFile(path.join(verificationDir, fileName), `${JSON.stringify(payload, null, 2)}\n`);
}

async function ensureBuildExists() {
  const buildIdPath = path.join(appRoot, ".next", "BUILD_ID");

  try {
    await readFile(buildIdPath, "utf8");
  } catch {
    throw new Error("Build output was not found. Run `npm run build` in apps/web before the smoke test.");
  }
}

function startServer(envOverrides = {}) {
  const nextCli = path.join(appRoot, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextCli, "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: appRoot,
    env: {
      ...process.env,
      PORT: String(port),
      FIGMA_ADAPTER_MODE: "mock",
      GEMINI_ADAPTER_MODE: "mock",
      GPT_ADAPTER_MODE: "mock",
      ...envOverrides
    },
    stdio: ["ignore", "pipe", "pipe"],
    shell: false
  });

  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  return child;
}

async function waitForServer(server) {
  const deadline = Date.now() + 20000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Smoke test server exited early with code ${server.exitCode}.`);
    }

    try {
      const response = await fetch(baseUrl);

      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }

    await sleep(300);
  }

  throw new Error("Smoke test server did not become ready in time.");
}

function stopServer(server) {
  if (server.exitCode !== null) {
    return;
  }

  server.kill();
}

async function startFigmaStubServer() {
  const server = createServer((request, response) => {
    if (!request.url) {
      response.writeHead(500).end();
      return;
    }

    if (request.headers["x-figma-token"] !== "smoke-figma-token") {
      response.writeHead(403, { "content-type": "application/json" });
      response.end(JSON.stringify({ err: "Forbidden" }));
      return;
    }

    const url = new URL(request.url, figmaStubBaseUrl);
    const match = url.pathname.match(/^\/v1\/files\/([^/]+)(?:\/nodes)?$/);

    if (!match) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ err: "Not found" }));
      return;
    }

    const fileKey = decodeURIComponent(match[1]);

    if (fileKey === "RealSmokeMissing") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ err: "File not found" }));
      return;
    }

    if (url.pathname.endsWith("/nodes")) {
      const nodeId = url.searchParams.get("ids") ?? "12:34";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          name: "Smoke Figma Workbench",
          role: "viewer",
          lastModified: "2026-05-08T00:00:00.000Z",
          editorType: "figma",
          thumbnailUrl: "https://example.test/thumb.png",
          version: "stub-v1",
          linkAccess: "view",
          nodes: {
            [nodeId]: {
              document: {
                id: nodeId,
                name: "Hero Frame",
                type: "FRAME",
                children: [
                  {
                    id: "12:35",
                    name: "Headline",
                    type: "TEXT"
                  }
                ],
                absoluteBoundingBox: {
                  x: 0,
                  y: 0,
                  width: 1440,
                  height: 900
                }
              }
            }
          }
        })
      );
      return;
    }

    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        name: "Smoke Figma Workbench",
        role: "viewer",
        lastModified: "2026-05-08T00:00:00.000Z",
        editorType: "figma",
        thumbnailUrl: "https://example.test/thumb.png",
        version: "stub-v1",
        linkAccess: "view",
        document: {
          id: "0:0",
          name: "Document",
          type: "DOCUMENT",
          children: [
            {
              id: "1:1",
              name: "Page 1",
              type: "CANVAS",
              children: []
            }
          ]
        }
      })
    );
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(figmaStubPort, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(undefined);
    });
  });

  return server;
}

async function stopFigmaStubServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(undefined);
    });
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});

