# AI Review Hub — Setup and Verification Reference

This technical reference preserves the integration and verification details previously kept in the root README. Paths are relative to the repository unless noted.

## Workflow steps

| Step | Role | Executes when | Typical skipped reason |
| --- | --- | --- | --- |
| `ingest` | Save inputs, request payload, knowledge snapshot | Always | n/a |
| `gemini` | First-pass UI review | Always in current MVP | n/a |
| `gpt` | Executive summary and prioritization | Always after Gemini | n/a |
| `figma` | Read-only design context capture | `runFigma=true` and `figmaUrl` provided | `Figma URL was not provided for read-only context lookup.` |
| `figmaMake` | Manual Figma Make improvement capture | `runFigmaMake=true` and `figmaMakeMode=manual_capture` with output text | `This run did not enable the Figma Make improvement layer.` |
| `figmaCheckDesigns` | Manual Figma Check designs ingest | `figmaCheckMode=manual_ingest` with summary text or report file | `This run did not enable the Figma Check designs audit layer.` |
| `semgrep` | Static-analysis ingest or local execution | `semgrepMode` configured | `No Semgrep mode was configured for this run.` |
| `zap` | API security report ingest or mock API scan | API spec file and format provided | `API spec file and format were not provided for ZAP API scan.` |
| `codeql` | SARIF or normalized JSON ingest | `repositoryVisibility=public` and CodeQL report provided | `CodeQL ingest is limited to public repositories in MVP.` |
| `finalize` | Persist summary and normalized findings artifact | Always unless the whole orchestration aborts early | n/a |

## Execution constraints
- Gemini and GPT use explicit env-controlled provider modes: `mock` or `real`.
- Keep both in `mock` by default for the free-leaning path.
- Figma also uses an explicit env-controlled adapter mode: `mock` or `real`.
- Keep `FIGMA_ADAPTER_MODE=mock` by default unless you are validating live read-only access.
- Figma runs only as read-only context capture.
- Figma Make Phase 1 supports `manual_capture` now and accepts `mcp_assisted` only as a reserved future mode.
- Figma Check Phase 1 supports `manual_ingest` only.
- ZAP requires `apiSpecFile` plus `apiSpecFormat` of `openapi`, `soap`, or `graphql`.
- CodeQL accepts only `sarif_ingest` or `json_ingest`.
- `repositoryVisibility=private` forces the CodeQL step to `skipped`.
- Optional step failures produce `partial_success` and still persist the final summary and findings artifact.

## Storage layout
Run artifacts are stored under `data/review-runs/<reviewRunId>/`.

Representative structure:

```text
data/review-runs/<reviewRunId>/
  inputs/
  gemini/
  gpt/
  figma/
  figma-make/
  figma-check/
  semgrep/
  zap/
  codeql/
  final/
```

Common artifacts:
- `inputs/request.json`
- `inputs/knowledge-summary.json`
- `gemini/request.json`
- `gemini/response.json`
- `gpt/request.json`
- `gpt/response.json`
- `figma/context.json`
- `figma-make/request.json`
- `figma-make/response.md`
- `figma-make/summary.txt`
- `figma-check/report.json` or `figma-check/report.md`
- `figma-check/summary.txt`
- `semgrep/report.json`
- `zap/report.json`
- `zap/report.html`
- `codeql/report.sarif` or `codeql/report.json`
- `final/executive-summary.txt`
- `final/findings.json`

## Local setup
Current working slice lives in `apps/web`.

1. Copy `apps/web/.env.example` to `apps/web/.env`
2. Keep `GEMINI_ADAPTER_MODE=mock` and `GPT_ADAPTER_MODE=mock` unless you are validating real providers
3. Keep `FIGMA_ADAPTER_MODE=mock` unless you are validating real Figma read-only access
4. For real providers, set:
   - `GEMINI_API_KEY`
   - `OPENAI_API_KEY`
   - `FIGMA_ACCESS_TOKEN` with `file_content:read`
   - optional `GEMINI_MODEL`, `OPENAI_MODEL`, `GEMINI_BASE_URL`, `OPENAI_BASE_URL`, `FIGMA_BASE_URL`
5. Keep `DATABASE_URL="file:./dev.db"`
6. Run from `apps/web`
   - `npm install`
   - `npm run prisma:generate`
   - `npm run db:init`
   - `npm run dev`

### SQLite path note
For Prisma SQLite, relative `file:` paths are resolved from `apps/web/prisma/schema.prisma`.

- Correct: `DATABASE_URL="file:./dev.db"`
- Incorrect in this repo: `DATABASE_URL="file:./prisma/dev.db"`

## Minimal API verification
The detail API returns these top-level fields:
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

The list API supports:
- `GET /api/reviews`
- optional `status=<all|draft|running|completed|partial_success|failed>`
- optional `keyword=<text>`
- optional `tag=<text>`
- optional `showArchived=true`
- optional `page=<number>`
- optional `pageSize=<number>`
- optional `sort=<createdAt_desc|createdAt_asc|updatedAt_desc|updatedAt_asc>`

The compare API supports:
- `GET /api/reviews/compare?left=<reviewRunId>&right=<reviewRunId>`

Use the smoke test for the shortest end-to-end confirmation:

```powershell
cd apps/web
npm run build
npm run test:api:smoke
```

The smoke test creates three primary runs:
- `happy`: Figma success, Semgrep success, ZAP success, CodeQL success
- `failed`: CodeQL invalid JSON with non-blocking finalize
- `skipped`: Figma URL omitted and CodeQL private repository

It also creates three stub-backed real-Figma verification runs:
- `realFigma.success`: real adapter success against a local read-only Figma API stub
- `realFigma.failed`: real adapter 404 failure with non-blocking finalize
- `realFigma.skipped`: `runFigma=true` without `figmaUrl`

It also verifies:
- `GET /`
- create-page Japanese labels and major sections
- `GET /api/reviews`
- `GET /api/reviews?tag=<tag>`
- `GET /api/reviews?showArchived=true`
- `GET /api/reviews?page=1&pageSize=2&sort=updatedAt_desc&keyword=<run-id-fragment>`
- `GET /api/reviews?status=partial_success&keyword=<run-id-fragment>&page=1&pageSize=1&sort=updatedAt_desc`
- `GET /reviews?status=partial_success&keyword=<run-id-fragment>&page=1&pageSize=1&sort=updatedAt_desc`
- `/reviews` keyword, tag, pagination, compare selection, and archived visibility markers
- `GET /api/reviews/compare?left=<happy-run-id>&right=<failed-run-id>`
- `GET /reviews/compare?left=<happy-run-id>&right=<failed-run-id>`
- compare-page key differences, tag comparison, memo comparison, and left/right detail links
- `PATCH /api/reviews/<reviewRunId>` archive / restore behavior
- `/reviews/<reviewRunId>` metadata and archive-state markers

`apps/web/.verification-smoke/smoke-results.json` is the latest local smoke-test index. It records the representative run IDs produced by the most recent smoke execution. Treat it as local verification output, not as a stable fixture.

## Verification evidence

The public repository runs the mock providers, local Figma HTTP stub, and API/page smoke tests in GitHub Actions. See [the code and verification guide](portfolio.md) and [public CI runs](https://github.com/taki-codes/ai-expert-review-hub-portfolio/actions).

Actual provider responses, private design files, and individual live-run records are not distributed in this public source. A local mock or stub test is not a successful call to an external provider.

## Additional manual checks
- Gemini / GPT real happy path:
  - `GEMINI_ADAPTER_MODE=real`
  - `GPT_ADAPTER_MODE=real`
  - valid `GEMINI_API_KEY`
  - valid `OPENAI_API_KEY`
  - select an available model for the account and configure it in the environment
  - the checked-in defaults are implementation settings, not a recommendation about current provider pricing or availability
- Gemini real failed path:
  - `GEMINI_ADAPTER_MODE=real`
  - invalid or missing `GEMINI_API_KEY`
  - confirm `run.status=failed`, `gemini.status=failed`, `gpt.status=skipped`
- Figma success:
  - `FIGMA_ADAPTER_MODE=real`
  - valid `FIGMA_ACCESS_TOKEN`
  - token holder can access the shared file
  - token includes `file_content:read`
  - `runFigma=true`
  - valid `figmaUrl`
- Figma failed:
  - `FIGMA_ADAPTER_MODE=real`
  - invalid or missing `FIGMA_ACCESS_TOKEN`, missing `file_content:read`, or a file that is not readable by the token
  - confirm `figma.status=failed` and `finalize.status=success`
- Figma skipped:
  - `runFigma=true`
  - omit `figmaUrl`
- CodeQL failed:
  - `repositoryVisibility=public`
  - `codeqlMode=json_ingest`
  - upload `apps/web/fixtures/codeql/invalid-normalized.json`
- ZAP success:
  - upload `apiSpecFile`
  - set `apiSpecFormat`
  - set `zapMode`

## Related docs
- [docs/architecture.md](architecture.md)
- [docs/portfolio.md](portfolio.md)
- [integrations/README.md](../integrations/README.md)

