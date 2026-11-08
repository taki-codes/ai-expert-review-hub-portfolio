---
name: semgrep-runner
description: Run or ingest Semgrep Community Edition results and normalize findings for the review hub.
---
Use this skill when a repository or source snapshot is available for static analysis.

## Inputs
- repository path or Semgrep JSON output
- review run id

## Rules
- Prefer community rules in the MVP.
- Save raw Semgrep JSON.
- Normalize findings into the common finding model.
- Do not block the whole run if Semgrep fails.
