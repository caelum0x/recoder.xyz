import { spawn } from 'node:child_process';
import { SESSION_TOKEN } from './lib/recoder-auth.mjs';

const steps = [
  {
    name: 'agents',
    cmd: ['node', 'scripts/e2e-agents-auth.mjs'],
    env: {},
  },
  {
    name: 'web',
    cmd: ['node', 'scripts/e2e-web-ide-authenticated.mjs'],
    env: {},
  },
  {
    name: 'pm',
    cmd: ['node', 'scripts/e2e-pm-authenticated.mjs'],
    env: {
      RECODER_SESSION_TOKEN: SESSION_TOKEN,
      PM_URL: process.env.PM_URL || 'https://pm.recoder.xyz/features/cmn8m0gm90000ht7v8f75w2rg',
    },
  },
];

function runStep(step) {
  return new Promise((resolve) => {
    const child = spawn(step.cmd[0], step.cmd.slice(1), {
      stdio: 'inherit',
      env: {
        ...process.env,
        ...step.env,
      },
    });
    child.on('exit', (code, signal) => {
      resolve({
        name: step.name,
        code: code ?? 1,
        signal: signal || null,
      });
    });
  });
}

(async () => {
  const results = [];
  for (const step of steps) {
    console.log(`\n=== RUN ${step.name.toUpperCase()} ===\n`);
    results.push(await runStep(step));
  }

  const failed = results.filter((result) => result.code !== 0);
  console.log('\n=== PRODUCT FLOW SUMMARY ===\n');
  for (const result of results) {
    console.log(
      `${result.code === 0 ? 'PASS' : 'FAIL'} ${result.name} code=${result.code}${result.signal ? ` signal=${result.signal}` : ''}`,
    );
  }

  process.exit(failed.length > 0 ? 1 : 0);
})();
