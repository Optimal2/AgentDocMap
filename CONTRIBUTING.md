# Contributing to AgentDocMap

AgentDocMap is built for compact, stable, AI-agent-oriented documentation. The
goal is not to replace source inspection; it is to help agents choose the right
files and symbols faster.

## Change Guidelines

- Keep target application source comments compatible with normal JSDoc.
- Do not require AgentDocMap-specific annotations in target repositories.
- Keep generated output deterministic when it is meant to be committed.
- Prefer small parser and writer changes that can be validated with both the
  fixture test and OpenDocViewer.
- Keep code, comments, scripts, and documentation in English.

## Validation

Run the full validation before committing parser, map, writer, or CLI changes:

```bash
npm run validate
```

This runs the test suite (`node --test test/*.test.js`, including the
fixture project in `test/fixture-project/`) and regenerates the
OpenDocViewer example packet. `npm run build:odv` expects an OpenDocViewer
checkout next to this repository (`../OpenDocViewer`); CI checks out both
repositories side by side.

For documentation-only changes:

```bash
git diff --check
```

## Generated Example Packet

`examples/opendocviewer-agent-docs/` is intentionally committed. It is the
current real-world calibration target for the generator and should be updated
when generator behavior changes.

Do not include generated packets from private or customer-specific repositories
in this public repository.

## Downstream Impact

OpenDocViewer's workflows check out this repository's default branch without
pinning a ref. Its "Agent Documentation" workflow regenerates its committed
`docs-agent/` packet and fails if the result differs. A change that alters
generated output therefore needs a matching `docs-agent/` regeneration in
OpenDocViewer.
