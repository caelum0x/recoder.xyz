#!/usr/bin/env node
/**
 * recoder-a2a enroll — Register this terminal with a unique Ziti identity.
 *
 * Usage:
 *   npx recoder-a2a enroll
 *   npx recoder-a2a enroll --controller https://zrok.recoder.xyz
 *
 * What it does:
 *   1. Contacts the Ziti controller to request a new identity
 *   2. Stores the X.509 identity in ~/.recoder/ziti/
 *   3. Future bridge connections use Ziti fabric instead of WSS
 *
 * This is a foundation stub — full Ziti SDK integration requires
 * the @openziti/ziti-sdk-nodejs package and a running Ziti controller.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const IDENTITY_DIR = path.join(process.env.HOME || '~', '.recoder', 'ziti');
const IDENTITY_FILE = path.join(IDENTITY_DIR, 'identity.json');

function getControllerUrl() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--controller');
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : 'https://zrok.recoder.xyz';
}

async function enroll() {
  const controllerUrl = getControllerUrl();

  console.log('[recoder-a2a] Ziti Enrollment');
  console.log(`Controller: ${controllerUrl}`);
  console.log(`Identity dir: ${IDENTITY_DIR}`);

  // Check for existing identity
  if (fs.existsSync(IDENTITY_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf-8'));
      console.log(`\nExisting identity found:`);
      console.log(`  Fingerprint: ${existing.fingerprint}`);
      console.log(`  Enrolled: ${existing.enrolledAt}`);
      console.log(`  Agent ID: ${existing.agentId}`);
      console.log(`\nTo re-enroll, delete ${IDENTITY_FILE} and run again.`);
      process.exit(0);
    } catch {
      // Corrupted file — re-enroll
    }
  }

  // Generate a local keypair (placeholder — real Ziti uses controller-issued certs)
  const fingerprint = crypto.randomBytes(20).toString('hex');
  const agentId = process.env.RECODER_AGENT_ID || 'claude_code';
  const sessionId = `${agentId}_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;

  const identity = {
    version: 1,
    fingerprint,
    agentId,
    sessionId,
    controllerUrl,
    enrolledAt: new Date().toISOString(),
    // Placeholder fields for when Ziti SDK is integrated:
    zitiIdentity: null,  // Will hold the full Ziti identity JSON
    certPem: null,        // X.509 client certificate
    keyPem: null,         // Private key (never leaves this machine)
  };

  // Store identity
  fs.mkdirSync(IDENTITY_DIR, { recursive: true });
  fs.writeFileSync(IDENTITY_FILE, JSON.stringify(identity, null, 2), { mode: 0o600 });

  console.log(`\nIdentity created:`);
  console.log(`  Fingerprint: ${fingerprint}`);
  console.log(`  Agent ID: ${agentId}`);
  console.log(`  Session: ${sessionId}`);
  console.log(`  Stored: ${IDENTITY_FILE}`);
  console.log(`\nNote: Full Ziti fabric transport requires @openziti/ziti-sdk-nodejs`);
  console.log(`and a running Ziti controller. This identity will be used for`);
  console.log(`authenticated bridge connections once Ziti is deployed.`);
}

enroll().catch((err) => {
  console.error(`Enrollment failed: ${err.message}`);
  process.exit(1);
});
