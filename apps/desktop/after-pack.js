/**
 * electron-builder afterPack hook — release-artifact assertion.
 *
 * Runs after the app directory (app.asar + app.asar.unpacked) is assembled for
 * each platform, before signing/notarization and before the dmg/nsis/AppImage
 * is produced. It fails the build if the two native-module packaging invariants
 * regress, so a broken installer can never ship silently:
 *
 *   1. node-pty must be UNPACKED (app.asar.unpacked/node_modules/node-pty) and
 *      carry its native binary for THIS platform's arch plus, on posix, the
 *      `spawn-helper` that node-pty exec()s at runtime. If node-pty were packed
 *      inside app.asar the terminal would fail on every clean install because
 *      `spawn-helper` is not an executable path inside an archive.
 *   2. electron-updater must be BUNDLED (inside app.asar, since it is pure JS),
 *      so auto-update is present in the shipped app.
 *
 * This mirrors the input check in before-build.js but verifies the real packaged
 * output, which is the only thing that proves the asar/asarUnpack config in
 * package.json actually took effect.
 */
const fs = require('fs');
const path = require('path');

function fail(message) {
  throw new Error(`[after-pack] ${message}`);
}

/** Locate the packaged "resources" dir that holds app.asar / app.asar.unpacked. */
function resolveResourcesDir(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const productFilename =
    (packager && packager.appInfo && packager.appInfo.productFilename) || 'Recoder';

  if (electronPlatformName === 'darwin' || electronPlatformName === 'mas') {
    return path.join(appOutDir, `${productFilename}.app`, 'Contents', 'Resources');
  }
  // win32 + linux: resources sits directly under the app output dir.
  return path.join(appOutDir, 'resources');
}

/** True when the asar contains the given package (read its archived header). */
function asarHasPackage(asarPath, pkgName) {
  if (!fs.existsSync(asarPath)) return false;
  let asar;
  try {
    // electron-builder always has @electron/asar in its dependency tree.
    asar = require('@electron/asar');
  } catch {
    try {
      asar = require('asar');
    } catch {
      // No asar reader available — fall back to a substring scan of the header.
      const buf = fs.readFileSync(asarPath);
      return buf.includes(Buffer.from(`node_modules/${pkgName}`));
    }
  }
  try {
    const files = asar.listPackage(asarPath);
    const needle = `node_modules${path.sep}${pkgName}`.replace(/\\/g, '/');
    return files.some((f) => f.replace(/\\/g, '/').includes(needle));
  } catch {
    const buf = fs.readFileSync(asarPath);
    return buf.includes(Buffer.from(`node_modules/${pkgName}`));
  }
}

/** Recursively collect file names matching a predicate under a directory. */
function findFiles(root, predicate) {
  const out = [];
  if (!fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (predicate(entry.name, full)) out.push(full);
    }
  }
  return out;
}

exports.default = async function afterPack(context) {
  const { electronPlatformName } = context;
  const resourcesDir = resolveResourcesDir(context);
  const asarPath = path.join(resourcesDir, 'app.asar');
  const unpackedDir = path.join(resourcesDir, 'app.asar.unpacked');

  // --- Invariant 1: node-pty is unpacked with a usable native binary. ---
  const ptyUnpacked = path.join(unpackedDir, 'node_modules', 'node-pty');
  if (!fs.existsSync(ptyUnpacked)) {
    fail(
      `node-pty is not in app.asar.unpacked (${ptyUnpacked} missing). ` +
        'The terminal would fail on a clean install. Check "asarUnpack" in package.json.',
    );
  }

  const nativeNodes = findFiles(ptyUnpacked, (name) => name.endsWith('.node'));
  if (nativeNodes.length === 0) {
    fail(
      `node-pty in app.asar.unpacked has no .node native binary under ${ptyUnpacked}.`,
    );
  }

  // On macOS/Linux node-pty exec()s spawn-helper from disk; it MUST be unpacked.
  if (electronPlatformName === 'darwin' || electronPlatformName === 'linux') {
    const helpers = findFiles(ptyUnpacked, (name) => name === 'spawn-helper');
    if (helpers.length === 0) {
      fail(
        `node-pty spawn-helper missing from app.asar.unpacked (${ptyUnpacked}). ` +
          'node-pty exec()s this file at runtime; without it on disk the terminal cannot fork.',
      );
    }
    // The helper must be executable for node-pty to exec it.
    for (const helper of helpers) {
      try {
        fs.accessSync(helper, fs.constants.X_OK);
      } catch {
        fail(`node-pty spawn-helper is not executable: ${helper}`);
      }
    }
  }

  // --- Invariant 2: electron-updater is bundled (pure JS, lives in app.asar). ---
  const updaterUnpacked = path.join(unpackedDir, 'node_modules', 'electron-updater');
  const updaterInAsar = asarHasPackage(asarPath, 'electron-updater');
  if (!updaterInAsar && !fs.existsSync(updaterUnpacked)) {
    fail(
      'electron-updater is not bundled (absent from both app.asar and ' +
        'app.asar.unpacked). Auto-update would be missing from the shipped app. ' +
        'Check the "files" whitelist in package.json.',
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    `[after-pack] release-artifact assertions passed for ${electronPlatformName}: ` +
      `node-pty unpacked (${nativeNodes.length} .node binary file(s)), ` +
      'electron-updater bundled.',
  );
};
