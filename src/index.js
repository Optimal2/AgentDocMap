import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readJsonIfExists } from './lib/fsUtils.js';
import { collectSourceFiles } from './lib/fileInventory.js';
import { analyzeSources } from './lib/sourceAnalyzer.js';
import { collectJsdocDoclets } from './lib/jsdocDoclets.js';
import { buildAgentMap } from './lib/mapBuilder.js';
import { writeAgentDocs } from './lib/writers.js';
import { getGitInfo } from './lib/gitInfo.js';

export async function generateAgentDocs(options) {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const targetRoot = path.resolve(options.target);
  const outDir = path.resolve(options.out);
  const packageJson = await readJsonIfExists(path.join(targetRoot, 'package.json'));
  const projectName = options.projectName || packageJson?.name || path.basename(targetRoot);
  const jsdocConfigPath = path.join(targetRoot, 'jsdoc.json');
  const jsdocConfig = await readJsonIfExists(jsdocConfigPath);
  const git = await getGitInfo(targetRoot);

  const sourceFiles = await collectSourceFiles({ targetRoot, jsdocConfig });
  const sourceAnalysis = await analyzeSources({ targetRoot, sourceFiles });
  const doclets = await collectJsdocDoclets({ projectRoot, targetRoot, jsdocConfigPath });

  const map = buildAgentMap({
    projectName,
    targetRoot,
    generatedBy: 'AgentDocMap',
    generatedAtUtc: options.generatedAt || git.commitDate || new Date().toISOString(),
    git,
    packageJson,
    sourceAnalysis,
    doclets,
  });

  const outputFiles = await writeAgentDocs({
    outDir,
    map,
    clean: options.clean !== false,
  });

  return {
    outDir,
    outputFiles,
    stats: map.stats,
    fileUrl: pathToFileURL(outDir).href,
  };
}
