---
name: gpt-normalizer
description: Transform Gemini review JSON into an executive summary, prioritized items, and action list using contracts/gpt-review-plan-minimal.schema.json.
---
Use this skill when Gemini has already produced a first-pass review and the result needs to be normalized for dashboard display.

## Inputs
- Gemini raw JSON matching `contracts/gemini-ui-review-minimal.schema.json`
- optional Figma context summary
- optional security summaries for context only

## Required output
Return JSON that matches `contracts/gpt-review-plan-minimal.schema.json`.

## Rules
- Merge duplicates.
- Do not create implementation details that are not grounded in the source review.
- Keep priorities concise and actionable.
- Prefer business-readable language.

## Priority guidance
- `p0`: urgent blockers or severe confusion
- `p1`: meaningful quality issues that should be addressed soon
- `p2`: polish or lower-risk improvements
