---
name: figma-context-reader
description: Retrieve read-only Figma design context for a specific file, frame, or node and store it as run context.
---
Use this skill only when a review run includes a Figma URL and Figma usage budget permits a lookup.

## Inputs
- Figma file URL or node URL
- review run id

## Rules
- Read only.
- Do not write to canvas in the MVP.
- Save raw design context under the run artifact path.
- Save a concise summary for dashboard display.
