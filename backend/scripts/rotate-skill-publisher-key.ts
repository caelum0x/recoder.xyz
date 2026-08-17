/**
 * rotate-skill-publisher-key.ts
 *
 * Rotates the FIRST-PARTY governed-skill publisher key: mints a fresh ed25519
 * keypair, re-signs the built-in `recoder.workspace` manifest, and rewrites the two
 * committed constants in `skill-builtin-manifest.ts`
 * (`RECODER_BUILTIN_PUBLIC_KEY_HEX` + `RECODER_WORKSPACE_SIGNATURE`) IN PLACE. The
 * new PRIVATE key is written to a gitignored file (`backend/.skill-publisher-key.pem`)
 * and printed once — store it in a vault; it re-signs the manifest whenever its
 * actions change, and it is NEVER committed.
 *
 * Run after changing the built-in skill's actions, or to rotate the dev key that
 * was shared in a transcript, so production trusts a key whose private half never
 * left your control.
 *
 * Usage: tsx scripts/rotate-skill-publisher-key.ts
 * Verify afterwards: the locked test `skill-builtin-manifest.test.ts` must stay green
 * (it proves the committed signature verifies against the committed public key).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const MANIFEST_MODULE = resolve(
  process.cwd(),
  'src/domains/conductor/skill/skill-builtin-manifest.ts',
);
const PRIVATE_KEY_OUT = resolve(process.cwd(), '.skill-publisher-key.pem');

function fail(message: string): never {
  process.stderr.write(`[rotate-skill-publisher-key] ${message}\n`);
  process.exit(1);
}

/** Replace `export const NAME = '<old>';` with the new value, or fail loudly. */
function replaceConst(source: string, name: string, value: string): string {
  const re = new RegExp(`(export const ${name} =\\s*)'[^']*'`, 'm');
  if (!re.test(source)) fail(`could not find committed constant '${name}' to rewrite`);
  return source.replace(re, `$1'${value}'`);
}

async function main(): Promise<void> {
  const [{ generateSkillPublisherKeypair, signSkillManifest }, { recoderWorkspaceSkillBody }] =
    await Promise.all([
      import('../src/domains/conductor/skill/skill-manifest-signer.js'),
      import('../src/domains/conductor/skill/skill-builtin-manifest.js'),
    ]);

  const { publicKeyHex, privateKeyPem } = generateSkillPublisherKeypair();
  // Sign the SAME canonical body the runtime verifier checks (signature field ignored).
  const signature = signSkillManifest(
    { ...recoderWorkspaceSkillBody(), signature: '' },
    privateKeyPem,
  );

  let source = await readFile(MANIFEST_MODULE, 'utf8');
  source = replaceConst(source, 'RECODER_BUILTIN_PUBLIC_KEY_HEX', publicKeyHex);
  source = replaceConst(source, 'RECODER_WORKSPACE_SIGNATURE', signature);
  await writeFile(MANIFEST_MODULE, source, 'utf8');

  // The private key is a SECRET — write it to the gitignored path (never committed).
  await writeFile(PRIVATE_KEY_OUT, privateKeyPem, { mode: 0o600 });

  process.stdout.write(
    JSON.stringify({
      rotated: true,
      publicKeyHex,
      manifestModule: 'src/domains/conductor/skill/skill-builtin-manifest.ts',
      privateKeyFile: '.skill-publisher-key.pem (gitignored — store in a vault)',
      next: 'run `npx vitest run src/domains/conductor/skill` to confirm the locked signature test is green, then commit the manifest change (NOT the .pem).',
    }) + '\n',
  );
}

void main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
