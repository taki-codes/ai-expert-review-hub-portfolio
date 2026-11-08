"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { CodeqlMode, RepositoryVisibility } from "@/lib/adapters/codeql/types";

type SemgrepMode = "" | "json_ingest" | "local_exec";
type ZapMode = "" | "mock_api_scan" | "json_ingest";
type ApiSpecFormat = "" | "openapi" | "soap" | "graphql";
type CodeqlModeState = "" | CodeqlMode;
type RepositoryVisibilityState = "" | RepositoryVisibility;
type FigmaMakeMode = "disabled" | "manual_capture" | "mcp_assisted";
type FigmaCheckMode = "disabled" | "manual_ingest";

type ValidationResult = {
  errors: string[];
  warnings: string[];
};

export function ReviewCreateForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdLocation, setCreatedLocation] = useState<string | null>(null);
  const [createdReviewRunId, setCreatedReviewRunId] = useState<string | null>(null);
  const [runFigma, setRunFigma] = useState(false);
  const [figmaUrl, setFigmaUrl] = useState("");
  const [runFigmaMake, setRunFigmaMake] = useState(false);
  const [figmaMakeMode, setFigmaMakeMode] = useState<FigmaMakeMode>("disabled");
  const [figmaCheckMode, setFigmaCheckMode] = useState<FigmaCheckMode>("disabled");
  const [figmaMakePrompt, setFigmaMakePrompt] = useState("");
  const [figmaMakeOutputText, setFigmaMakeOutputText] = useState("");
  const [figmaCheckSummaryText, setFigmaCheckSummaryText] = useState("");
  const [figmaCheckReportFileName, setFigmaCheckReportFileName] = useState("");
  const [semgrepMode, setSemgrepMode] = useState<SemgrepMode>("");
  const [zapMode, setZapMode] = useState<ZapMode>("");
  const [apiSpecFormat, setApiSpecFormat] = useState<ApiSpecFormat>("");
  const [repositoryPath, setRepositoryPath] = useState("");
  const [semgrepJsonPath, setSemgrepJsonPath] = useState("");
  const [semgrepBin, setSemgrepBin] = useState("");
  const [semgrepBinArgs, setSemgrepBinArgs] = useState("");
  const [semgrepConfig, setSemgrepConfig] = useState("");
  const [zapJsonPath, setZapJsonPath] = useState("");
  const [zapHtmlPath, setZapHtmlPath] = useState("");
  const [apiSpecFileName, setApiSpecFileName] = useState("");
  const [codeqlMode, setCodeqlMode] = useState<CodeqlModeState>("");
  const [repositoryVisibility, setRepositoryVisibility] = useState<RepositoryVisibilityState>("");
  const [codeqlReportFileName, setCodeqlReportFileName] = useState("");

  const validation = useMemo(
    () =>
      validateCreateReviewInput({
        semgrepMode,
        runFigma,
        figmaUrl,
        runFigmaMake,
        figmaMakeMode,
        figmaCheckMode,
        figmaMakePrompt,
        figmaMakeOutputText,
        figmaCheckSummaryText,
        figmaCheckReportFileName,
        repositoryPath,
        semgrepJsonPath,
        semgrepBin,
        semgrepBinArgs,
        apiSpecFileName,
        apiSpecFormat,
        zapMode,
        zapJsonPath,
        zapHtmlPath,
        codeqlMode,
        repositoryVisibility,
        codeqlReportFileName
      }),
    [
      apiSpecFileName,
      apiSpecFormat,
      codeqlMode,
      codeqlReportFileName,
      figmaUrl,
      figmaCheckMode,
      figmaCheckReportFileName,
      figmaCheckSummaryText,
      figmaMakeMode,
      figmaMakeOutputText,
      figmaMakePrompt,
      repositoryPath,
      repositoryVisibility,
      runFigma,
      runFigmaMake,
      semgrepBin,
      semgrepBinArgs,
      semgrepConfig,
      semgrepJsonPath,
      semgrepMode,
      zapHtmlPath,
      zapJsonPath,
      zapMode
    ]
  );

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setCreatedLocation(null);
    setCreatedReviewRunId(null);

    if (validation.errors.length > 0) {
      setError(validation.errors[0]);
      return;
    }

    setSubmitting(true);
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        body: formData
      });

      const payload = (await response.json()) as {
        error?: string;
        location?: string;
        reviewRunId?: string;
      };

      if (!response.ok || !payload.location) {
        throw new Error(payload.error ?? "レビューの作成に失敗しました");
      }

      const reviewRunId = payload.reviewRunId ?? payload.location.split("/").at(-1) ?? null;
      setCreatedLocation(payload.location);
      setCreatedReviewRunId(reviewRunId);
      router.push(payload.location);
      router.refresh();
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "レビューの作成に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: "1.15rem", marginTop: "0.2rem" }}>
      <section style={heroActionStyle}>
        <div style={{ display: "grid", gap: "0.35rem", maxWidth: 760 }}>
          <p style={sectionEyebrowStyle}>実行セットアップ</p>
          <h2 style={heroTitleStyle}>レビューを作成して詳細を開く</h2>
          <p style={sectionDescriptionStyle}>
            タイトル、タグ、メモを付けたうえで入力を構成し、必要な分析ソースだけを追加してください。
            作成後はそのまま詳細画面へ移動します。
          </p>
        </div>
        <button disabled={submitting || validation.errors.length > 0} type="submit" style={submitButtonStyle}>
          {submitting ? "レビューを作成中..." : "レビューを作成して詳細を開く"}
        </button>
      </section>

      {validation.errors.length > 0 ? (
        <ValidationPanel title="送信前に修正してください" messages={validation.errors} tone="error" />
      ) : null}

      {validation.warnings.length > 0 ? (
        <ValidationPanel title="現在の入力メモ" messages={validation.warnings} tone="warning" />
      ) : null}

      {error ? <ValidationPanel title="送信エラー" messages={[error]} tone="error" /> : null}

      {createdLocation ? (
        <div style={successPanelStyle}>
          <strong>レビューを作成しました</strong>
          <p style={{ margin: "0.35rem 0 0", lineHeight: 1.6 }}>
            {createdReviewRunId ? `実行ID ${createdReviewRunId} を作成しました。` : "レビューを作成しました。"}
            詳細画面へ移動します。遷移しない場合は下のリンクを使ってください。
          </p>
          <LinkText href={createdLocation} label="レビュー詳細を開く" />
        </div>
      ) : null}

      <section style={sectionCardStyle}>
        <div style={sectionHeaderStyle}>
          <div style={{ display: "grid", gap: "0.35rem" }}>
            <p style={sectionEyebrowStyle}>基本入力</p>
            <h2 style={sectionTitleStyle}>レビューの起点</h2>
            <p style={sectionDescriptionStyle}>
              スクリーンショットと説明は必須です。タイトル、タグ、メモを付けておくと一覧や比較で識別しやすくなります。
            </p>
          </div>
        </div>

        <div style={fieldGridStyle}>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>タイトル</span>
            <input name="runTitle" type="text" maxLength={120} placeholder="例: LP 初回レビュー" style={inputStyle} />
            <small style={helpTextStyle}>一覧・比較・詳細で表示されます。未入力時は実行IDを表示します。</small>
          </label>

          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>タグ</span>
            <input name="runTags" type="text" placeholder="smoke, landing, happy-path" style={inputStyle} />
            <small style={helpTextStyle}>カンマ区切りで入力します。最大 10 件、各タグは 24 文字までです。</small>
          </label>

          <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
            <span style={fieldLabelStyle}>メモ</span>
            <textarea
              name="runMemo"
              rows={4}
              maxLength={2000}
              placeholder="後で他の実行と比較するためのメモや、この実行を残す理由を書いてください。"
              style={inputStyle}
            />
            <small style={helpTextStyle}>後で他の実行と比較するためのメモとして保存され、一覧検索にも使えます。</small>
          </label>

          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>スクリーンショットを追加</span>
            <input name="screenshot" type="file" accept="image/*" required style={fileInputStyle} />
            <small style={helpTextStyle}>この MVP では UI スクリーンショット 1 枚が必須です。</small>
          </label>

          <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
            <span style={fieldLabelStyle}>説明</span>
            <textarea
              name="explanatoryText"
              required
              rows={7}
              placeholder="画面の目的、ユーザーが達成したいこと、レビューで考慮してほしい点を書いてください。"
              style={inputStyle}
            />
            <small style={helpTextStyle}>ユーザーの目的、想定フロー、無視してよい条件を含めるとレビュー精度が上がります。</small>
          </label>

          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Notebook ID</span>
            <input name="notebookId" type="text" placeholder="knowledge-registry notebook id" style={inputStyle} />
            <small style={helpTextStyle}>この実行のナレッジ要約スナップショットを保存する場合に使います。</small>
          </label>

          <label style={fieldStyle}>
            <span style={checkboxRowStyle}>
              <input
                name="runFigmaMake"
                type="checkbox"
                checked={runFigmaMake}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setRunFigmaMake(checked);
                  if (!checked && figmaMakeMode === "manual_capture") {
                    setFigmaMakeMode("disabled");
                  }
                }}
              />
              <span style={fieldLabelStyle}>Figma Make を改善案レイヤーとして追加する</span>
            </span>
            <small style={helpTextStyle}>
              Phase 1 では manual_capture で改善案を取り込みます。mcp_assisted は次フェーズ向けの予約モードです。
            </small>
          </label>

          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Figma Make モード</span>
            <select
              name="figmaMakeMode"
              value={figmaMakeMode}
              onChange={(event) => setFigmaMakeMode(event.target.value as FigmaMakeMode)}
              style={inputStyle}
            >
              <option value="disabled">disabled</option>
              <option value="manual_capture">manual_capture</option>
              <option value="mcp_assisted">mcp_assisted</option>
            </select>
            <small style={helpTextStyle}>
              manual_capture では Figma Make の出力テキストをそのまま改善案として保存します。
            </small>
          </label>

          <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
            <span style={fieldLabelStyle}>Figma Make プロンプト</span>
            <textarea
              name="figmaMakePrompt"
              rows={4}
              value={figmaMakePrompt}
              onChange={(event) => setFigmaMakePrompt(event.target.value)}
              placeholder="例: Hero の CTA を目立たせつつ、説明ブロックとの情報階層を整理したい"
              style={inputStyle}
            />
            <small style={helpTextStyle}>
              改善案を作る時に使ったプロンプトや依頼文を残します。artifacts には request として保存されます。
            </small>
          </label>

          <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
            <span style={fieldLabelStyle}>Figma Make 出力テキスト</span>
            <textarea
              name="figmaMakeOutputText"
              rows={6}
              value={figmaMakeOutputText}
              onChange={(event) => setFigmaMakeOutputText(event.target.value)}
              placeholder="Figma Make から得た改善案を貼り付けてください。箇条書きでも段落でも構いません。"
              style={inputStyle}
            />
            <small style={helpTextStyle}>
              manual_capture ではこの内容から 1〜3 件の改善案 finding を作成し、response artifact にも保存します。
            </small>
          </label>

          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Figma Check モード</span>
            <select
              name="figmaCheckMode"
              value={figmaCheckMode}
              onChange={(event) => setFigmaCheckMode(event.target.value as FigmaCheckMode)}
              style={inputStyle}
            >
              <option value="disabled">disabled</option>
              <option value="manual_ingest">manual_ingest</option>
            </select>
            <small style={helpTextStyle}>
              Check designs の結果は Phase 1 では manual_ingest で監査レイヤーとして取り込みます。
            </small>
          </label>

          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Figma Check レポートファイル</span>
            <input
              name="figmaCheckReportFile"
              type="file"
              accept=".json,.md,.txt"
              onChange={(event) => setFigmaCheckReportFileName(event.target.files?.[0]?.name ?? "")}
              style={fileInputStyle}
            />
            <small style={helpTextStyle}>
              JSON / Markdown / テキストをそのまま report artifact として保存します。summary text と併用できます。
            </small>
          </label>

          <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
            <span style={fieldLabelStyle}>Figma Check 要約メモ</span>
            <textarea
              name="figmaCheckSummaryText"
              rows={5}
              value={figmaCheckSummaryText}
              onChange={(event) => setFigmaCheckSummaryText(event.target.value)}
              placeholder="例: ボタン半径が 8px / 10px / 12px で混在。見出し余白もコンポーネントごとにばらつきがある。"
              style={inputStyle}
            />
            <small style={helpTextStyle}>
              manual_ingest ではこの要約から 1〜3 件の監査指摘 finding を作成します。
            </small>
          </label>
        </div>
      </section>

      <section style={sectionCardStyle}>
        <div style={sectionHeaderStyle}>
          <div style={{ display: "grid", gap: "0.35rem" }}>
            <p style={sectionEyebrowStyle}>オプション入力</p>
            <h2 style={sectionTitleStyle}>Figma コンテキスト</h2>
            <p style={sectionDescriptionStyle}>
              読み取り専用です。必要な場合のみ有効化し、ファイル・ノード・フレーム URL からコンテキストを保存します。
            </p>
          </div>
        </div>

        <div style={fieldGridStyle}>
          <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
            <span style={checkboxRowStyle}>
              <input name="runFigma" type="checkbox" checked={runFigma} onChange={(event) => setRunFigma(event.target.checked)} />
              <span style={fieldLabelStyle}>Figma の読み取り専用コンテキスト取得を実行する</span>
            </span>
            <small style={helpTextStyle}>この MVP では Figma への書き戻しや自動反映は行いません。</small>
          </label>

          <label style={{ ...fieldStyle, gridColumn: "1 / -1" }}>
            <span style={fieldLabelStyle}>Figma URL</span>
            <input
              name="figmaUrl"
              type="url"
              value={figmaUrl}
              onChange={(event) => setFigmaUrl(event.target.value)}
              placeholder="https://www.figma.com/file/FILE_KEY/Design?node-id=1-2"
              style={inputStyle}
            />
            <small style={helpTextStyle}>上の設定を有効にした場合のみ必要です。ファイル、ノード、フレーム URL に対応します。</small>
          </label>
        </div>
      </section>

      <section style={sectionCardStyle}>
        <div style={sectionHeaderStyle}>
          <div style={{ display: "grid", gap: "0.35rem" }}>
            <p style={sectionEyebrowStyle}>オプション入力</p>
            <h2 style={sectionTitleStyle}>Semgrep 入力</h2>
            <p style={sectionDescriptionStyle}>
              Semgrep の JSON レポート取り込み、またはローカルリポジトリ実行を選べます。UI レビューのみなら未設定で構いません。
            </p>
          </div>
        </div>

        <div style={fieldGridStyle}>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>Semgrep モード</span>
            <select name="semgrepMode" value={semgrepMode} onChange={(event) => setSemgrepMode(event.target.value as SemgrepMode)} style={inputStyle}>
              <option value="">Semgrep を使わない</option>
              <option value="json_ingest">JSON 取り込み</option>
              <option value="local_exec">ローカル実行</option>
            </select>
            <small style={helpTextStyle}>
              {semgrepMode === ""
                ? "UI レビューだけでよい場合は未設定のままにしてください。"
                : semgrepMode === "json_ingest"
                  ? "既存の Semgrep JSON レポートパスを指定してください。"
                  : "ローカルのリポジトリパスを指定してください。bin 上書きは内部確認向けです。"}
            </small>
          </label>

          {semgrepMode === "json_ingest" ? (
            <label style={fieldStyle}>
              <span style={fieldLabelStyle}>Semgrep JSON パス</span>
              <input
                name="semgrepJsonPath"
                type="text"
                value={semgrepJsonPath}
                onChange={(event) => setSemgrepJsonPath(event.target.value)}
                placeholder="D:\\path\\to\\semgrep-report.json"
                style={inputStyle}
              />
              <small style={helpTextStyle}>`JSON 取り込み` を選んだ場合に必須です。</small>
            </label>
          ) : null}

          {semgrepMode === "local_exec" ? (
            <>
              <label style={fieldStyle}>
                <span style={fieldLabelStyle}>リポジトリパス</span>
                <input
                  name="repositoryPath"
                  type="text"
                  value={repositoryPath}
                  onChange={(event) => setRepositoryPath(event.target.value)}
                  placeholder="D:\\path\\to\\repository"
                  style={inputStyle}
                />
                <small style={helpTextStyle}>`ローカル実行` を選んだ場合に必須です。</small>
              </label>

              <label style={fieldStyle}>
                <span style={fieldLabelStyle}>Semgrep 設定</span>
                <input
                  name="semgrepConfig"
                  type="text"
                  value={semgrepConfig}
                  onChange={(event) => setSemgrepConfig(event.target.value)}
                  placeholder="auto"
                  style={inputStyle}
                />
                <small style={helpTextStyle}>空欄時はアダプタ既定値を使います。</small>
              </label>

              <details style={detailsStyle}>
                <summary style={detailsSummaryStyle}>内部確認向けの上書き設定</summary>
                <div style={{ display: "grid", gap: "0.9rem", marginTop: "0.9rem" }}>
                  <label style={fieldStyle}>
                    <span style={fieldLabelStyle}>Semgrep bin 上書き</span>
                    <input
                      name="semgrepBin"
                      type="text"
                      value={semgrepBin}
                      onChange={(event) => setSemgrepBin(event.target.value)}
                      placeholder="node または C:\\tools\\semgrep.exe"
                      style={inputStyle}
                    />
                  </label>

                  <label style={fieldStyle}>
                    <span style={fieldLabelStyle}>Semgrep bin 引数</span>
                    <input
                      name="semgrepBinArgs"
                      type="text"
                      value={semgrepBinArgs}
                      onChange={(event) => setSemgrepBinArgs(event.target.value)}
                      placeholder="[&quot;D:\\ai-review-hub\\apps\\web\\fixtures\\semgrep\\mock-semgrep.js&quot;]"
                      style={inputStyle}
                    />
                  </label>
                </div>
              </details>
            </>
          ) : null}
        </div>
      </section>

      <section style={sectionCardStyle}>
        <div style={sectionHeaderStyle}>
          <div style={{ display: "grid", gap: "0.35rem" }}>
            <p style={sectionEyebrowStyle}>オプション入力</p>
            <h2 style={sectionTitleStyle}>ZAP API スキャン入力</h2>
            <p style={sectionDescriptionStyle}>
              この MVP では API 仕様ファイル起点の入力のみ扱います。ページ URL やサイト URL のスキャンは create 画面では扱いません。
            </p>
          </div>
        </div>

        <div style={fieldGridStyle}>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>API 仕様ファイル</span>
            <input
              name="apiSpecFile"
              type="file"
              accept=".json,.yaml,.yml,.xml,.graphql,.gql,.wsdl"
              onChange={(event) => setApiSpecFileName(event.target.files?.[0]?.name ?? "")}
              style={fileInputStyle}
            />
            <small style={helpTextStyle}>OpenAPI、SOAP/WSDL、GraphQL スキーマなどを指定できます。</small>
          </label>

          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>API 仕様形式</span>
            <select
              name="apiSpecFormat"
              value={apiSpecFormat}
              onChange={(event) => setApiSpecFormat(event.target.value as ApiSpecFormat)}
              style={inputStyle}
            >
              <option value="">形式を選択</option>
              <option value="openapi">OpenAPI</option>
              <option value="soap">SOAP</option>
              <option value="graphql">GraphQL</option>
            </select>
            <small style={helpTextStyle}>この実行で ZAP 指摘を使う場合に必要です。</small>
          </label>

          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>ZAP モード</span>
            <select name="zapMode" value={zapMode} onChange={(event) => setZapMode(event.target.value as ZapMode)} style={inputStyle}>
              <option value="">ZAP を使わない</option>
              <option value="mock_api_scan">モック API スキャン</option>
              <option value="json_ingest">JSON 取り込み</option>
            </select>
            <small style={helpTextStyle}>
              {zapMode === ""
                ? "API セキュリティ指摘が不要なら未設定のままで構いません。"
                : zapMode === "mock_api_scan"
                  ? "アップロードした API 仕様と fixture ベースの ZAP 出力を使います。"
                  : "API 仕様ファイルに加えて保存済み ZAP JSON パスが必要です。"}
            </small>
          </label>

          {zapMode === "json_ingest" ? (
            <>
              <label style={fieldStyle}>
                <span style={fieldLabelStyle}>ZAP JSON パス</span>
                <input
                  name="zapJsonPath"
                  type="text"
                  value={zapJsonPath}
                  onChange={(event) => setZapJsonPath(event.target.value)}
                  placeholder="D:\\path\\to\\zap-report.json"
                  style={inputStyle}
                />
                <small style={helpTextStyle}>`JSON 取り込み` を選んだ場合に必須です。</small>
              </label>

              <label style={fieldStyle}>
                <span style={fieldLabelStyle}>ZAP HTML パス</span>
                <input
                  name="zapHtmlPath"
                  type="text"
                  value={zapHtmlPath}
                  onChange={(event) => setZapHtmlPath(event.target.value)}
                  placeholder="D:\\path\\to\\zap-report.html"
                  style={inputStyle}
                />
                <small style={helpTextStyle}>HTML レポートも成果物として残したい場合のみ指定してください。</small>
              </label>
            </>
          ) : null}

          {zapMode !== "" ? (
            <div style={hintBannerStyle}>
              <strong>API 仕様ファイルが必要です</strong>
              <p style={{ margin: "0.35rem 0 0", lineHeight: 1.55 }}>
                `API 仕様ファイル` と `API 仕様形式` が両方ないと ZAP はスキップまたは失敗します。先に仕様を追加してからモードを選んでください。
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section style={sectionCardStyle}>
        <div style={sectionHeaderStyle}>
          <div style={{ display: "grid", gap: "0.35rem" }}>
            <p style={sectionEyebrowStyle}>オプション入力</p>
            <h2 style={sectionTitleStyle}>CodeQL 取り込み</h2>
            <p style={sectionDescriptionStyle}>
              この MVP では CodeQL は取り込み専用で、公開リポジトリのみ対象です。SARIF または正規化 JSON レポートを追加できます。
            </p>
          </div>
        </div>

        <div style={fieldGridStyle}>
          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>リポジトリ公開設定</span>
            <select
              name="repositoryVisibility"
              value={repositoryVisibility}
              onChange={(event) => setRepositoryVisibility(event.target.value as RepositoryVisibilityState)}
              style={inputStyle}
            >
              <option value="">CodeQL を使わない</option>
              <option value="public">公開</option>
              <option value="private">非公開</option>
            </select>
            <small style={helpTextStyle}>非公開リポジトリはレポートを追加してもこの MVP ではスキップされます。</small>
          </label>

          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>CodeQL モード</span>
            <select name="codeqlMode" value={codeqlMode} onChange={(event) => setCodeqlMode(event.target.value as CodeqlModeState)} style={inputStyle}>
              <option value="">CodeQL を使わない</option>
              <option value="sarif_ingest">SARIF 取り込み</option>
              <option value="json_ingest">JSON 取り込み</option>
            </select>
            <small style={helpTextStyle}>
              {codeqlMode === ""
                ? "既存の CodeQL レポートを取り込みたい場合のみ設定してください。"
                : codeqlMode === "sarif_ingest"
                  ? "CodeQL から出力した SARIF レポートを追加してください。"
                  : "取り込みアダプタの形式に合う正規化 JSON レポートを追加してください。"}
            </small>
          </label>

          <label style={fieldStyle}>
            <span style={fieldLabelStyle}>CodeQL レポートファイル</span>
            <input
              name="codeqlReportFile"
              type="file"
              accept=".sarif,.json"
              onChange={(event) => setCodeqlReportFileName(event.target.files?.[0]?.name ?? "")}
              style={fileInputStyle}
            />
            <small style={helpTextStyle}>CodeQL モードを有効にした場合に必須です。アップロードしたファイルは成果物として保存されます。</small>
          </label>

          {codeqlMode !== "" || repositoryVisibility !== "" || codeqlReportFileName !== "" ? (
            <div style={hintBannerStyle}>
              <strong>公開リポジトリのみ対象です</strong>
              <p style={{ margin: "0.35rem 0 0", lineHeight: 1.55 }}>
                CodeQL 取り込みは MVP では公開リポジトリのみ対応です。`公開` とレポートファイル、モードを揃えて使ってください。
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </form>
  );
}

function ValidationPanel(props: { title: string; messages: string[]; tone: "error" | "warning" }) {
  const palette =
    props.tone === "error"
      ? {
          background: "rgba(198, 63, 89, 0.08)",
          border: "rgba(198, 63, 89, 0.22)",
          color: "#a7374f"
        }
      : {
          background: "rgba(214, 146, 54, 0.1)",
          border: "rgba(214, 146, 54, 0.2)",
          color: "#9b5f10"
        };

  return (
    <div
      style={{
        padding: "1rem 1.05rem",
        borderRadius: 18,
        background: palette.background,
        border: `1px solid ${palette.border}`,
        color: palette.color
      }}
    >
      <strong>{props.title}</strong>
      <ul style={{ margin: "0.55rem 0 0", paddingLeft: "1.1rem", display: "grid", gap: "0.35rem" }}>
        {props.messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}

function LinkText(props: { href: string; label: string }) {
  return (
    <a href={props.href} style={{ color: "#2f6fed", fontWeight: 700, textDecoration: "none" }}>
      {props.label}
    </a>
  );
}

function validateCreateReviewInput(input: {
  semgrepMode: SemgrepMode;
  runFigma: boolean;
  figmaUrl: string;
  runFigmaMake: boolean;
  figmaMakeMode: FigmaMakeMode;
  figmaCheckMode: FigmaCheckMode;
  figmaMakePrompt: string;
  figmaMakeOutputText: string;
  figmaCheckSummaryText: string;
  figmaCheckReportFileName: string;
  repositoryPath: string;
  semgrepJsonPath: string;
  semgrepBin: string;
  semgrepBinArgs: string;
  apiSpecFileName: string;
  apiSpecFormat: ApiSpecFormat;
  zapMode: ZapMode;
  zapJsonPath: string;
  zapHtmlPath: string;
  codeqlMode: CodeqlModeState;
  repositoryVisibility: RepositoryVisibilityState;
  codeqlReportFileName: string;
}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (input.runFigma && !input.figmaUrl.trim()) {
    errors.push("Figma コンテキスト取得には Figma URL が必要です。");
  }

  if (!input.runFigma && input.figmaUrl.trim()) {
    warnings.push("Figma URL は、読み取り専用コンテキスト取得を有効にした場合のみ使われます。");
  }

  if (input.runFigmaMake && input.figmaMakeMode === "disabled") {
    errors.push("Figma Make を使う場合は Figma Make モードを選択してください。");
  }

  if (input.runFigmaMake && input.figmaMakeMode === "manual_capture" && !input.figmaMakeOutputText.trim()) {
    errors.push("Figma Make の manual_capture には出力テキストが必要です。");
  }

  if (input.runFigmaMake && input.figmaMakeMode === "mcp_assisted") {
    warnings.push("Figma Make の mcp_assisted は Phase 1 では自動実行されません。暫定的に manual_capture を使ってください。");
  }

  if (
    !input.runFigmaMake &&
    (input.figmaMakeMode !== "disabled" || input.figmaMakePrompt.trim() || input.figmaMakeOutputText.trim())
  ) {
    warnings.push("Figma Make の入力は、Figma Make を有効にした場合のみ使われます。");
  }

  if (input.runFigmaMake && !input.figmaUrl.trim()) {
    warnings.push("Figma Make でも Figma URL を指定しておくと、ファイルやノード前提との照合がしやすくなります。");
  }

  if (
    input.figmaCheckMode === "manual_ingest" &&
    !input.figmaCheckSummaryText.trim() &&
    !input.figmaCheckReportFileName.trim()
  ) {
    errors.push("Figma Check の manual_ingest には要約メモまたはレポートファイルが必要です。");
  }

  if (
    input.figmaCheckMode === "disabled" &&
    (input.figmaCheckSummaryText.trim() || input.figmaCheckReportFileName.trim())
  ) {
    warnings.push("Figma Check を使わない場合は、Figma Check モードを manual_ingest に変更してください。");
  }

  if (input.figmaCheckMode === "manual_ingest" && !input.figmaUrl.trim()) {
    warnings.push("Figma Check でも Figma URL を指定しておくと、監査結果の前提が分かりやすくなります。");
  }

  if (input.semgrepMode === "json_ingest" && !input.semgrepJsonPath.trim()) {
    errors.push("Semgrep の JSON 取り込みには JSON パスが必要です。");
  }

  if (input.semgrepMode === "local_exec" && !input.repositoryPath.trim()) {
    errors.push("Semgrep のローカル実行にはリポジトリパスが必要です。");
  }

  if (input.semgrepMode !== "local_exec" && (input.semgrepBin.trim() || input.semgrepBinArgs.trim())) {
    warnings.push("Semgrep の bin 上書きは `ローカル実行` の場合のみ使われます。");
  }

  const hasAnyZapInput = input.zapMode !== "" || input.apiSpecFileName.trim() !== "" || input.apiSpecFormat !== "";

  if (hasAnyZapInput && !input.apiSpecFileName.trim()) {
    errors.push("ZAP には API 仕様ファイルのアップロードが必要です。");
  }

  if (hasAnyZapInput && input.apiSpecFormat === "") {
    errors.push("ZAP には API 仕様形式の指定が必要です。");
  }

  if (input.zapMode === "json_ingest" && !input.zapJsonPath.trim()) {
    errors.push("ZAP の JSON 取り込みには JSON パスが必要です。");
  }

  if (input.zapMode === "" && input.zapHtmlPath.trim()) {
    warnings.push("ZAP HTML パスは `JSON 取り込み` の場合のみ使われます。");
  }

  if (input.zapMode !== "json_ingest" && input.zapJsonPath.trim()) {
    warnings.push("ZAP JSON パスは `JSON 取り込み` の場合のみ使われます。");
  }

  if (input.apiSpecFileName && input.zapMode === "") {
    warnings.push("API 仕様ファイルはアップロードされていますが、ZAP モードが未設定のため成果物保存のみ行います。");
  }

  const hasAnyCodeqlInput = input.codeqlMode !== "" || input.repositoryVisibility !== "" || input.codeqlReportFileName.trim() !== "";

  if (hasAnyCodeqlInput && input.repositoryVisibility === "") {
    errors.push("CodeQL 取り込みにはリポジトリ公開設定が必要です。");
  }

  if (input.codeqlMode !== "" && !input.codeqlReportFileName.trim()) {
    errors.push("CodeQL 取り込みにはレポートファイルのアップロードが必要です。");
  }

  if (input.codeqlMode === "" && input.codeqlReportFileName.trim()) {
    warnings.push("CodeQL レポートはアップロードされていますが、CodeQL モードが未設定のため成果物保存のみ行います。");
  }

  if (input.repositoryVisibility === "private") {
    warnings.push("非公開リポジトリは MVP では CodeQL をスキップします。");
  }

  return { errors, warnings };
}

const heroActionStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "1rem",
  flexWrap: "wrap",
  alignItems: "start",
  padding: "1.2rem 1.25rem",
  borderRadius: 22,
  border: "1px solid rgba(111, 138, 164, 0.14)",
  background: "linear-gradient(180deg, rgba(248, 251, 255, 0.98), rgba(243, 248, 253, 0.94))",
  boxShadow: "0 14px 28px rgba(27, 55, 89, 0.04)"
};

const sectionCardStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
  padding: "1.3rem",
  borderRadius: 22,
  border: "1px solid rgba(111, 138, 164, 0.12)",
  background: "rgba(255, 255, 255, 0.98)",
  boxShadow: "0 12px 24px rgba(27, 55, 89, 0.04)"
};

const sectionHeaderStyle: CSSProperties = {
  display: "grid",
  gap: "0.35rem"
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))"
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: "0.46rem"
};

const fieldLabelStyle: CSSProperties = {
  color: "#203040",
  fontWeight: 700
};

const inputStyle: CSSProperties = {
  padding: "0.92rem 1rem",
  borderRadius: 16,
  border: "1px solid rgba(111, 138, 164, 0.16)",
  background: "rgba(255, 255, 255, 0.98)",
  color: "#203040",
  boxShadow: "inset 0 1px 2px rgba(36, 76, 120, 0.04)"
};

const fileInputStyle: CSSProperties = {
  ...inputStyle,
  padding: "0.8rem 0.9rem"
};

const helpTextStyle: CSSProperties = {
  color: "#6f8297",
  lineHeight: 1.5
};

const sectionEyebrowStyle: CSSProperties = {
  margin: 0,
  color: "#4d78c9",
  fontSize: "0.8rem",
  textTransform: "uppercase" as const,
  letterSpacing: "0.16em",
  fontWeight: 800
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.38rem",
  color: "#16212b"
};

const heroTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "1.48rem",
  color: "#16212b"
};

const sectionDescriptionStyle: CSSProperties = {
  margin: 0,
  color: "#617488",
  lineHeight: 1.68
};

const submitButtonStyle: CSSProperties = {
  width: "fit-content",
  padding: "0.98rem 1.45rem",
  borderRadius: 999,
  border: "none",
  background: "linear-gradient(135deg, #2f6fed, #245dd1)",
  color: "#f8fbff",
  cursor: "pointer",
  fontWeight: 700,
  alignSelf: "start",
  boxShadow: "0 14px 30px rgba(47, 111, 237, 0.24)"
};

const hintBannerStyle: CSSProperties = {
  padding: "1rem 1.05rem",
  borderRadius: 18,
  background: "rgba(47, 111, 237, 0.06)",
  border: "1px solid rgba(47, 111, 237, 0.16)",
  color: "#31506d",
  gridColumn: "1 / -1"
};

const successPanelStyle: CSSProperties = {
  padding: "1rem 1.05rem",
  borderRadius: 18,
  background: "rgba(22, 151, 166, 0.08)",
  border: "1px solid rgba(22, 151, 166, 0.18)",
  color: "#0d7682"
};

const detailsStyle: CSSProperties = {
  gridColumn: "1 / -1",
  padding: "0.95rem 1rem",
  borderRadius: 18,
  border: "1px solid rgba(111, 138, 164, 0.12)",
  background: "linear-gradient(180deg, rgba(248, 251, 255, 0.98), rgba(243, 248, 253, 0.94))"
};

const detailsSummaryStyle: CSSProperties = {
  cursor: "pointer",
  fontWeight: 700,
  color: "#203040"
};

const checkboxRowStyle: CSSProperties = {
  display: "flex",
  gap: "0.7rem",
  alignItems: "center",
  flexWrap: "wrap"
};
