#!/usr/bin/env node

import { generateAgentDocs } from './index.js';

function printHelp() {
  console.log(`AgentDocMap

Usage:
  agentdocmap generate --target <repo> --out <dir> [--project-name <name>] [--no-clean]

Commands:
  generate    Build an AI-agent documentation packet for a target project.

Options:
  --target <path>        Target repository root.
  --out <path>           Output directory.
  --project-name <name>  Display name used in generated docs.
  --generated-at <text>  Timestamp/label override. Defaults to target commit date.
  --source-metadata <mode>
                         Source metadata mode: git or none. Defaults to git.
  --no-clean             Do not delete the output directory before writing.
  -h, --help             Show help.
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  const options = { clean: true };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--target') {
      options.target = args[++i];
    } else if (arg === '--out') {
      options.out = args[++i];
    } else if (arg === '--project-name') {
      options.projectName = args[++i];
    } else if (arg === '--generated-at') {
      options.generatedAt = args[++i];
    } else if (arg === '--source-metadata') {
      options.sourceMetadata = args[++i];
    } else if (arg === '--no-clean') {
      options.clean = false;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { command, options };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!command || command === 'help' || options.help) {
    printHelp();
    return;
  }

  if (command !== 'generate') {
    throw new Error(`Unknown command: ${command}`);
  }

  if (!options.target) {
    throw new Error('Missing required option: --target');
  }

  if (!options.out) {
    throw new Error('Missing required option: --out');
  }

  if (options.sourceMetadata && !['git', 'none'].includes(options.sourceMetadata)) {
    throw new Error("--source-metadata must be either 'git' or 'none'.");
  }

  const result = await generateAgentDocs(options);
  console.log(`AgentDocMap wrote ${result.outputFiles.length} files to ${result.outDir}`);
  console.log(`Indexed ${result.stats.fileCount} files and ${result.stats.docletCount} JSDoc doclets.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
