# Iteration Log

This log captures the early AgentDocMap feedback loop using OpenDocViewer as the
real validation target.

## Iteration 1 - End-to-end packet

- Added a Node CLI that reads a target repository and writes an agent
  documentation packet.
- Used OpenDocViewer's existing `jsdoc.json` without changing the target source.
- Added a small fixture test to keep the generator behavior executable.
- First ODV run succeeded, but raw JSDoc output produced 16,473 doclets, which was
  too noisy for agent use.

## Iteration 2 - Signal filtering

- Filtered out undocumented JSDoc internals.
- Kept comments and API-shape doclets that are useful to agents.
- Stripped HTML markup from JSDoc descriptions.
- ODV symbol count dropped from 16,473 to 1,266 useful symbols.

## Iteration 3 - Better navigation

- Split `src` into more useful module chunks such as `src/utils`,
  `src/components/DocumentToolbar`, and `src/integrations`.
- Added `ENTRYPOINTS.md` for package scripts, startup files, and import hubs.
- Increased generated ODV packet from 9 broad files to 27 more navigable files.

## Iteration 4 - Better source fallbacks

- Improved default-export detection for React wrappers such as
  `React.memo(Component)`.
- Improved summaries for files that have no JSDoc doclets by using source-derived
  exports and declarations.
- Cleaned the report wording so it distinguishes JSDoc-backed summaries from
  source-derived summaries.

## Iteration 5 - Reproducible packets

- Changed the default generated timestamp to the target repository commit date
  when available.
- Kept a `--generated-at` CLI override for explicit timestamping.
- This keeps committed example packets stable when the target source commit has
  not changed.
