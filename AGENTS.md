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

This command reads `../OpenDocViewer/jsdoc.json`, uses the existing JSDoc
comments as-is, and writes an agent-focused documentation packet below
`examples/opendocviewer-agent-docs`.

## Run everything headless — no visible windows

Agents work on the operator's own workstation. A console window that pops up in the middle of
their work steals focus and can swallow keystrokes meant for something else, so everything an
agent starts runs hidden and never waits for input.

- Never start a visible console window. Scripts, builds, tests and helper processes run hidden —
  both what you start directly and what your scripts start in turn.
- Python: background and scheduled scripts use `pythonw.exe`, or
  `subprocess.Popen(..., creationflags=subprocess.CREATE_NO_WINDOW)` when a process without its
  own console starts children. Never use `os.startfile` or the `start` command to run a script.
- PowerShell: `pwsh -NoProfile -NonInteractive -WindowStyle Hidden -File …`. Never use
  `Start-Process` without `-WindowStyle Hidden` or `-NoNewWindow`, and never `cmd /c start …`.
- Scheduled tasks start through `conhost.exe --headless <program> …` or through `wscript.exe`
  with a `.vbs` that runs hidden. Never register a task without one of those patterns.
- Node: `child_process.spawn/exec` with `windowsHide: true`.
- Never wait for input: no `Read-Host`, `pause`, `input()` or interactive flags (`-i`). Set
  `GIT_TERMINAL_PROMPT=0` and run non-interactively (`--yes`, `-NonInteractive`, `--no-input`
  where the tool has it). Never run a command that can prompt without someone watching it.
- Browsers and GUI programs start only when the task needs them, never as a side effect of a
  script.
- If a window you caused appears, fix how it is started in the same piece of work and say so in
  your report. If it comes from a tool we do not control, report it so the operator can raise it
  with the vendor.
