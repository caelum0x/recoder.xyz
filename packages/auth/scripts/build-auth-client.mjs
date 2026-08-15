import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const clientRoot = path.join(packageRoot, 'prisma', 'auth-client');
const repoRoot = path.resolve(packageRoot, '..', '..');

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function normalizeGeneratedClient() {
  const replacements = [
    [path.join(repoRoot, 'packages', 'auth', 'prisma', 'auth-client'), '/__RECODER_REPO__/packages/auth/prisma/auth-client'],
    [path.join(repoRoot, 'packages', 'auth', 'prisma', 'schema.prisma'), '/__RECODER_REPO__/packages/auth/prisma/schema.prisma'],
  ];
  for (const file of ['index.js', 'edge.js', 'wasm.js']) {
    const target = path.join(clientRoot, file);
    if (!fs.existsSync(target)) continue;
    let text = fs.readFileSync(target, 'utf8');
    for (const [from, to] of replacements) {
      text = text.split(from).join(to);
    }
    if (file === 'index.js') {
      text = text.replace(
        /if \(!fs\.existsSync\(path\.join\(__dirname, 'schema\.prisma'\)\)\) \{[\s\S]*?config\.dirname = path\.join\(process\.cwd\(\), alternativePath\)\n  config\.isBundled = true\n\}/,
        `if (!fs.existsSync(path.join(__dirname, 'schema.prisma'))) {
  config.dirname = path.join(/* turbopackIgnore: true */ process.cwd(), 'prisma/auth-client')
  config.isBundled = true
}`
      );
      text = text.replaceAll(
        'path.join(process.cwd(), "prisma/auth-client/libquery_engine-darwin-arm64.dylib.node")',
        'path.join(/* turbopackIgnore: true */ process.cwd(), "prisma/auth-client/libquery_engine-darwin-arm64.dylib.node")'
      );
      text = text.replaceAll(
        'path.join(process.cwd(), "prisma/auth-client/libquery_engine-debian-openssl-3.0.x.so.node")',
        'path.join(/* turbopackIgnore: true */ process.cwd(), "prisma/auth-client/libquery_engine-debian-openssl-3.0.x.so.node")'
      );
      text = text.replaceAll(
        'path.join(process.cwd(), "prisma/auth-client/libquery_engine-debian-openssl-1.1.x.so.node")',
        'path.join(/* turbopackIgnore: true */ process.cwd(), "prisma/auth-client/libquery_engine-debian-openssl-1.1.x.so.node")'
      );
      text = text.replaceAll(
        'path.join(process.cwd(), "prisma/auth-client/schema.prisma")',
        'path.join(/* turbopackIgnore: true */ process.cwd(), "prisma/auth-client/schema.prisma")'
      );
    }
    fs.writeFileSync(target, text);
  }
}

run('prisma', ['generate', '--schema=./prisma/schema.prisma', '--no-hints'], packageRoot);
normalizeGeneratedClient();
