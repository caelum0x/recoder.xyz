const fs = require('node:fs');
const path = require('node:path');

const repoRoot = process.cwd();

const retiredPaths = [
  'recoder-web',
  'packages/recoder-code/packages/cli/src/commands/recoderWeb.ts',
  'packages/recoder-code/packages/cli/src/commands/web.ts',
  'packages/recoder-code/packages/cli/src/services/PlatformSyncService.ts',
  'packages/recoder-code/packages/cli/src/services/RecoderWebService.ts',
  'scripts/e2e-web-ide-authenticated.mjs',
  'scripts/e2e-web-ide-followup-edit.mjs',
  'scripts/a2a-smoke-test.ts',
];

const forbiddenContent = [
  ['app/lib/config/platforms.ts', /id:\s*['"]web['"]/],
  ['app/lib/services/platform-aggregator.ts', /web\.recoder\.xyz/],
  ['app/app/api/platform/access/route.ts', /platform:\s*['"]web['"]/],
  ['app/Dockerfile', /NEXT_PUBLIC_RECODER_WEB_URL/],
  ['docker-compose.deploy.yml', /NEXT_PUBLIC_RECODER_WEB_URL/],
  ['docker-compose.deploy.yml', /(?:^|\s)recoder-web:/m],
  ['app/lib/subagent-workflow.ts', /\/recoder-web/],
  ['ecosystem.config.js', /NEXT_PUBLIC_RECODER_WEB_URL/],
  ['packages/ecosystem-config/src/index.ts', /web:\s*['"]https:\/\/web\.recoder\.xyz/],
];

const failures = [];

for (const relativePath of retiredPaths) {
  if (fs.existsSync(path.join(repoRoot, relativePath))) {
    failures.push(`retired path exists: ${relativePath}`);
  }
}

for (const [relativePath, pattern] of forbiddenContent) {
  const absolutePath = path.join(repoRoot, relativePath);
  const content = fs.readFileSync(absolutePath, 'utf8');
  if (pattern.test(content)) {
    failures.push(`retired browser surface is active in ${relativePath}`);
  }
}

if (failures.length > 0) {
  console.error('Retired Recoder Web surface check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Retired Recoder Web surface check passed.');
}
