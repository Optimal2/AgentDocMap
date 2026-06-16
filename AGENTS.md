# AGENTS.md

## Project workflow

AgentDocMap generates compact, machine-readable project documentation for AI
agents from existing source code and JSDoc comments.

Before making changes:
- Inspect the actual repository and the target project used for validation.
- Keep generated documentation deterministic and compact.
- Do not require target applications to change their source comments.
- Keep code, comments, scripts, and docs in English.
- Validate with the fixture test and at least one real target project when changing
  parsing or output behavior.
- Commit and push focused changes when the task produces repository changes.

## Local validation target

OpenDocViewer is the primary real-world validation target during early
development:

```powershell
npm run build:odv
```

This command reads `..\OpenDocViewer\jsdoc.json`, uses the existing JSDoc
comments as-is, and writes an agent-focused documentation packet below
`examples/opendocviewer-agent-docs`.
