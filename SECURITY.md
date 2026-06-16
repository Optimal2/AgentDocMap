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
writes generated documentation. It does not execute target application code.
However, it does run the JSDoc parser over target files, so treat target source
trees as input that should come from repositories you trust.

Recommended use:

- run AgentDocMap in a normal developer or CI workspace
- review generated output before publishing it
- avoid generating public docs from private repositories unless that is
  explicitly intended
- do not pass secrets or deployment payloads into generated documentation
