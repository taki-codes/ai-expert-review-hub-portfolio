# AI Review Hub Architecture

## Objective
Aggregate one review run from UI input, optional design context, and optional security signals while keeping the MVP inexpensive and operationally simple.

## Core flow
1. `ingest`
2. `gemini`
3. `gpt`
4. `figma`
5. `semgrep`
6. `zap`
7. `codeql`
8. `finalize`

## Step responsibilities
- `ingest`
  - Save screenshot, request payload, and knowledge summary snapshot
  - Save optional uploaded API spec and CodeQL report inputs
- `gemini`
  - Produce first-pass UI review JSON
- `gpt`
  - Produce executive summary and normalized prioritization
- `figma`
  - Read-only Figma file or node context capture
  - Save raw context JSON and short summary
- `semgrep`
  - Ingest Semgrep JSON or run local Semgrep
- `zap`
  - Ingest ZAP JSON or run mock API-spec scan
  - API-spec driven only in the MVP
- `codeql`
  - Ingest SARIF or normalized JSON
  - Public repository only
- `finalize`
  - Save final summary and normalized findings artifact

## Execution model
- Required path: `ingest -> gemini -> gpt -> finalize`
- Optional steps run after GPT and before finalize.
- Optional step failures are non-blocking.
- If an optional step fails, the run becomes `partial_success` and `finalize` still runs.
- If a required step fails before optional steps, the run is marked `failed`, the failed step keeps its `errorMessage`, pending steps are marked `skipped`, and the run detail remains inspectable.

## MVP constraints
- No package split yet. Current implementation lives under `apps/web`.
- No Figma write-back.
- No PR creation, merge automation, or Stitch automation.
- No ZAP site or page scanning. Only API-spec driven usage is part of the MVP.
- No CodeQL support for private repositories.

## Persistence model
- `ReviewRun`
- `ReviewInput`
- `ReviewStep`
- `ReviewFinding`
- `ReviewArtifact`

## Artifact layout
```text
data/review-runs/<reviewRunId>/
  inputs/
  gemini/
  gpt/
  figma/
  semgrep/
  zap/
  codeql/
  final/
```

## Detail API contract
The detail response shape is intentionally stable for the MVP:
- `run`
- `steps`
- `findings`
- `artifacts`
- `artifactsByStep`
- `findingsBySeverity`
- `latestStepStatus`
- `executiveSummary`
- `knowledgeSummaryArtifactPath`
- `displaySummary`

## Notes
- Findings are normalized only for Gemini, Semgrep, ZAP, and CodeQL.
- Figma is currently context-only and does not create findings.
- Raw request and response payloads are preserved per executed step.
- Gemini and GPT support explicit `mock` / `real` provider modes via env.
