# Integrations Boundary Notes

## Purpose
Keep all provider-specific logic behind adapters so the application core does not depend on vendor SDK details.

## Suggested adapters
- KnowledgeNotebookRegistry
- GeminiReviewer
- GptNormalizer
- FigmaContextProvider
- SemgrepRunner
- ZapRunner
- CodeqlIngestor

## Minimal responsibilities
### KnowledgeNotebookRegistry
- store notebook metadata
- map review runs to notebook ids
- provide a precomputed knowledge summary reference

### GeminiReviewer
- accept screenshots/videos/text + knowledge summary
- return JSON matching `contracts/gemini-ui-review-minimal.schema.json`

### GptNormalizer
- accept Gemini JSON
- return JSON matching `contracts/gpt-review-plan-minimal.schema.json`

### FigmaContextProvider
- accept a Figma URL or node reference
- return read-only context payload

### SemgrepRunner
- run scan or ingest JSON output
- map results into common findings

### ZapRunner
- run baseline scan or ingest baseline report
- map results into common findings

### CodeqlIngestor
- ingest existing SARIF or query GitHub alerts
- only allow on public repositories in the MVP

## Current provider modes
The MVP intentionally separates mock-mode validation from real-provider integration.

### Gemini
- Current modes: `mock`, `real`
- Mode selection: `GEMINI_ADAPTER_MODE`
- Required env for real mode: `GEMINI_API_KEY`
- Real mode preserves request and response payloads and writes step-level failure details
- Recommended default model candidates for production validation:
  - `gemini-2.5-flash`
  - `gemini-2.5-pro`
  - keep preview variants opt-in and verify project access before using them as defaults

### GPT
- Current modes: `mock`, `real`
- Mode selection: `GPT_ADAPTER_MODE`
- Required env for real mode: `OPENAI_API_KEY`
- Real mode uses the OpenAI Responses API and preserves request and response payloads

### Figma
- Current default: read-only mock context parsing from `figmaUrl`
- Real-provider cutover point: replace the current context reader behind `createFigmaContextReader()`
- MVP rule remains read-only even after provider cutover

### Semgrep
- Current modes: `json_ingest`, `local_exec`
- Real-provider cutover point: keep the same runner interface and replace execution details only

### ZAP
- Current modes: `json_ingest`, `mock_api_scan`
- Real-provider cutover point: introduce real API-spec-driven execution behind `createZapRunner()`
- MVP scope remains API-spec based, not URL/site scanning

### CodeQL
- Current modes: `sarif_ingest`, `json_ingest`
- Real-provider cutover point: add GitHub or other hosted-source ingestion behind `createCodeqlRunner()`
- MVP rule remains public-repository only
