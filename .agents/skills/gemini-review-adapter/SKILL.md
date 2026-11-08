---
name: gemini-review-adapter
description: Run the first-pass UI/UX review using Gemini and return JSON that matches contracts/gemini-ui-review-minimal.schema.json.
---
Use this skill when the task is to review screenshots, videos, and explanatory text for UI/UX issues.

## Inputs
- screenshots (0..n)
- videos (0..n)
- explanatory text
- knowledge summary derived from NotebookLM-curated review rules

## Required output
Return JSON that matches `contracts/gemini-ui-review-minimal.schema.json`.

## Review priorities
1. Layout clarity
2. Visual hierarchy
3. Primary CTA clarity
4. Form usability
5. Navigation clarity
6. Accessibility risk
7. Mobile usability when relevant

## Rules
- Do not invent hidden screens or user flows.
- Base findings on the provided inputs only.
- Prefer fewer, better-supported issues over many weak ones.
- Use `high` only for issues likely to block task completion or cause serious confusion.

## Storage expectations
- Save raw request payload under the run artifact path.
- Save raw response payload under the run artifact path.
- Save normalized summary text for quick display.
