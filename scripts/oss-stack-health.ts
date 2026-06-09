import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

type Component = {
  id: string;
  name: string;
  path?: string;
  command?: string;
  endpoint?: string;
};

const repoRoot = process.cwd();
const manifestPaths = [
  'oss/manifests/oss-components.yaml',
  'oss/manifests/recoder-components.yaml',
];

function parseComponents(source: string): Component[] {
  const blocks = source.split(/\n\s*-\s+id:\s+/).slice(1);
  return blocks.map((block) => {
    const id = block.split(/\r?\n/)[0]?.trim() ?? 'unknown';
    const name = block.match(/\n\s+name:\s+(.+)/)?.[1]?.trim() ?? id;
    const componentPath = block.match(/\n\s+path:\s+(.+)/)?.[1]?.trim();
    const command = block.match(/\n\s+command:\s+(.+)/)?.[1]?.trim();
    const endpoint = block.match(/\n\s+endpoint:\s+(.+)/)?.[1]?.trim();
    return { id, name, path: componentPath, command, endpoint };
  });
}

function main(): void {
  const missingManifests = manifestPaths.filter((manifestPath) => !existsSync(path.join(repoRoot, manifestPath)));
  if (missingManifests.length > 0) {
    console.error(`Missing OSS component manifest(s): ${missingManifests.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const manifests = manifestPaths.map((manifestPath) => {
    const components = parseComponents(readFileSync(path.join(repoRoot, manifestPath), 'utf8'));
    const rows = components.map((component) => {
      const sourcePath = component.path ? path.join(repoRoot, component.path) : undefined;
      return {
        id: component.id,
        name: component.name,
        sourcePath: component.path ?? '(not declared)',
        sourceExists: sourcePath ? existsSync(sourcePath) : false,
        healthCheck: component.command ?? component.endpoint ?? '(not declared)',
      };
    });

    return {
      manifest: manifestPath,
      ok: rows.every((row) => row.sourceExists || row.sourcePath === '(not declared)'),
      components: rows,
    };
  });

  console.log(JSON.stringify({
    ok: manifests.every((manifest) => manifest.ok),
    manifests,
  }, null, 2));
}

main();
