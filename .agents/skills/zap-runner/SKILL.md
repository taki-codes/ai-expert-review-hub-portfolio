---
name: zap-runner
description: Run or ingest OWASP ZAP Baseline Scan output and normalize alerts for the review hub.
---
Use this skill when a target URL is available and the MVP needs a lightweight dynamic scan.

## Inputs
- target URL
- optional auth notes if available
- review run id

## Rules
- Use Baseline Scan only in the MVP.
- Save raw JSON and HTML if available.
- Normalize alerts into the common finding model.
- If the scan fails, mark the step failed but continue the rest of the workflow.
