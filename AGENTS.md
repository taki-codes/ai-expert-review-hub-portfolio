# AI Review Hub — AGENTS.md

## Project goal
Build and maintain a free-leaning MVP for an AI review hub.
The MVP accepts screenshots, videos, and explanatory text, then runs these steps:
1. Gemini UI/UX review
2. GPT normalization and summary
3. Optional Figma MCP design-context lookup
4. Semgrep scan
5. ZAP baseline scan
6. Optional CodeQL ingest for public repositories only

## Scope guardrails
- Do not add auto-implementation, auto-PR creation, or auto-merge flows.
- Do not add Stitch automation in the MVP.
- Do not add automatic Figma write-back in the MVP.
- Treat NotebookLM as a knowledge-source registry only. Do not build the MVP around direct NotebookLM chat execution.
- CodeQL is allowed only when the target repository is public.

## Working agreements
- Start with the smallest working slice.
- Prefer incremental changes over broad rewrites.
- Keep all external integrations behind adapter interfaces.
- Preserve raw request/response payloads for every executed step.
- Normalize findings from all tools into one common persistence model.
- Prefer configuration through environment variables.
- Keep API contracts stable. If you must change a contract, update the schema in `contracts/` first.

## Required architecture boundaries
- `docs/architecture.md` is the source of truth for system flow.
- `contracts/` contains JSON Schemas and shared contracts.
- `integrations/` contains adapter boundaries and provider-specific notes.
- `skills/` contains reusable task playbooks for Codex.
- `ops/` contains local-run and deployment-adjacent templates.

## Delivery order
1. Persistence models and storage layout
2. Review creation/list/detail APIs
3. Gemini adapter
4. GPT normalizer adapter
5. Findings normalization
6. Semgrep + ZAP execution
7. Optional Figma MCP read-only integration
8. Optional CodeQL ingest for public repos

## Output preservation rules
For each review run, save artifacts under a run-specific path:
- original screenshots/videos
- request payloads
- raw provider responses
- normalized JSON
- generated summaries
- security reports

## Safety / cost rules
- Assume Figma MCP usage is limited; do not call it by default.
- Assume GPT is paid; use it only for normalization and summary.
- Prefer Gemini for first-pass review.
- Prefer ZAP baseline scan, not full scan, in the MVP.

## When planning work
Before major changes, write or update `PLANS.md` with:
- scope
- files to change
- contract impact
- test plan
- rollback notes
