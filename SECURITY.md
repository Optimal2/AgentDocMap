# Security Policy

## Supported Versions

AgentDocMap is early-stage software. Security fixes are made on the `main`
branch first.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |
| < 0.1   | No        |

## Reporting a Vulnerability

Please report vulnerabilities through GitHub's private vulnerability reporting
or security advisory flow for this repository when available. If that is not
available, open a minimal public issue that asks for a private contact path
without including exploit details.

Include:

- affected version or commit
- operating system and Node.js version
- the command that processes untrusted input
- the smallest safe reproduction you can share

Do not include secrets, private source code, customer data, or generated
documentation from private repositories in public reports.

## Security Model

AgentDocMap reads source files and JSDoc comments from a target repository and
writes generated documentation. It does not execute target application code
and makes no network requests. However, it runs the JSDoc CLI with the
target's `jsdoc.json`, and JSDoc loads any `plugins` listed there. Unless
`--source-metadata none` is used, it also runs `git` in the target, and Git
reads the target's `.git/config`, which can name programs that Git starts.
Treat target source trees as input that should come from repositories you
trust.

Trust boundaries, each protection and its known limits are described in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#security-model).

Built-in protections:

- sensitive file and directory names (`.env*`, keys and certificates,
  credential config files, `secrets/`, `.aws/`, ...) are kept out of the
  file inventory (`src/lib/fileInventory.js`), and doclets from sensitive
  files and directories are dropped from the packet (`normalizeDoclets()`
  in `src/lib/mapBuilder.js`); the JSDoc child process
  selects its own files and can still read them from disk
- secrets in package scripts and dependency versions are redacted before output
  (`redactScript()` in `src/lib/mapBuilder.js`)
- the output directory is only deleted when it passes
  `assertSafeCleanOutputDirectory()` (`src/lib/outputGuard.js`)

Recommended use:

- run AgentDocMap in a normal developer or CI workspace
- review generated output before publishing it
- avoid generating public docs from private repositories unless that is
  explicitly intended
- do not pass secrets or deployment payloads into generated documentation
