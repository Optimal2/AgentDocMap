# AgentDocMap

AgentDocMap turns an existing JavaScript project into a compact documentation
packet for AI agents. It uses the project's existing JSDoc comments as-is and
adds source maps, import graphs, symbol indexes, and short navigation reports.

The first validation target is OpenDocViewer because it already has broad JSDoc
coverage and a real React/Vite codebase.

## Quick Start

```powershell
npm install
npm run build:odv
```

The generated packet is written to:

```text
examples/opendocviewer-agent-docs
```

Start with `AGENT_CONTEXT.md` in that folder. It is the short entry point an AI
agent should read before opening the detailed JSON or per-file maps.

## CLI

```powershell
node src/cli.js generate --target ..\OpenDocViewer --out examples\opendocviewer-agent-docs --project-name OpenDocViewer
```

Options:

- `--target <path>`: Target repository root.
- `--out <path>`: Output directory for the generated packet.
- `--project-name <name>`: Optional display name.
- `--generated-at <text>`: Optional timestamp or label override. Defaults to the
  target commit date when available, which keeps generated output stable.
- `--source-metadata <git|none>`: Include or omit target Git metadata. Use
  `none` for documentation committed into the same target repository, where the
  current commit hash would otherwise make the generated files unstable.
- `--no-clean`: Keep existing files in the output directory.

## Output Files

- `AGENT_CONTEXT.md`: shortest useful entry point for a new AI agent.
- `DEPENDENCIES.md`: declared packages combined with observed import usage.
- `ENTRYPOINTS.md`: package scripts, startup files, and import hubs.
- `agent-map.json`: structured project map for tools and agents.
- `symbol-index.json`: normalized JSDoc symbol list.
- `FILE_MAP.md`: file inventory, imports, exports, and documentation density.
- `SYMBOL_INDEX.md`: human-readable symbol index.
- `MODULES.md`: top-level module grouping.
- `REPORT.md`: coverage and next-iteration signals.
- `chunks/*.md`: compact per-folder context chunks.

## Design Principles

- Existing comments should be enough. Applications should not need
  AgentDocMap-specific annotations.
- Markdown should be compact, factual, and easy for an agent to skim.
- JSON should carry the full structured detail.
- Generated output should point agents to the right files quickly instead of
  trying to replace source inspection.

## Repository Quality

This public repository keeps the same basic hygiene expected from the other
public project repositories:

- CI runs the fixture test and regenerates the OpenDocViewer example packet.
- `SECURITY.md` describes the supported version line and reporting flow.
- `CONTRIBUTING.md` describes validation and generated example expectations.
- `docs/ITERATION_LOG.md` records the agent-feedback iterations that shaped the
  generator.
