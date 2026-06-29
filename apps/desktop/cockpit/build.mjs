/**
 * Cockpit build — bundles the Preact renderer to static assets the Electron
 * shell can loadFile(). Produces dist/index.html + dist/cockpit.js + dist/cockpit.css.
 *
 * No dev server is needed at runtime: the output is a self-contained static bundle.
 */
import { build } from 'esbuild';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:* http://127.0.0.1:* https://*;" />
  <title>Recoder Cockpit</title>
  <link rel="stylesheet" href="./cockpit.css" />
</head>
<body>
  <div id="cockpit-root"></div>
  <script src="./cockpit.js"></script>
</body>
</html>
`;

async function main() {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  const result = await build({
    entryPoints: [join(root, 'src', 'main.tsx')],
    bundle: true,
    minify: true,
    sourcemap: false,
    format: 'iife',
    target: ['chrome120'],
    jsx: 'automatic',
    jsxImportSource: 'preact',
    outfile: join(dist, 'cockpit.js'),
    // apps/desktop is outside the pnpm workspace and the package ships no dist
    // during dev, so resolve @recoder/conductor-ui to its TS source. esbuild
    // bundles it in-tree, exactly like the cockpit's own src/.
    alias: {
      '@recoder/conductor-ui': join(root, '..', '..', '..', 'packages', 'conductor-ui', 'src', 'index.ts'),
    },
    loader: { '.css': 'css' },
    logLevel: 'info',
    metafile: true,
  });

  await writeFile(join(dist, 'index.html'), html, 'utf-8');

  const outputs = Object.keys(result.metafile.outputs);
  // eslint-disable-next-line no-console
  console.log('[cockpit] built:', ['dist/index.html', ...outputs.map((o) => o.replace(`${root}/`, ''))].join(', '));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[cockpit] build failed:', err);
  process.exit(1);
});
