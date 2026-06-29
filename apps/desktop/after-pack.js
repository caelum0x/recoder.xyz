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

/** True when the asar contains a file at (or ending with) the given relative path. */
function asarHasFile(asarPath, relPath) {
  if (!fs.existsSync(asarPath)) return false;
  const needle = relPath.replace(/\\/g, '/');
  let asar;
  try {
    asar = require('@electron/asar');
  } catch {
    try {
      asar = require('asar');
    } catch {
      // No asar reader — fall back to a substring scan of the archive bytes.
      const buf = fs.readFileSync(asarPath);
      return buf.includes(Buffer.from(needle));
    }
  }
  try {
    const files = asar.listPackage(asarPath);
    return files.some((f) => f.replace(/\\/g, '/').replace(/^\//, '').endsWith(needle));
  } catch {
    const buf = fs.readFileSync(asarPath);
    return buf.includes(Buffer.from(needle));
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

  // --- Invariant 3: the embedded backend is bundled and can boot + mint. ---
  // extraResources places it next to app.asar, under Resources/backend.
  const backendDir = path.join(resourcesDir, 'backend');
  const backendServer = path.join(backendDir, 'dist', 'server.js');
  const backendMint = path.join(backendDir, 'dist', 'conductor', 'mint-conductor-key.js');
  const backendNodeModules = path.join(backendDir, 'node_modules');
  if (!fs.existsSync(backendServer)) {
    fail(
      `embedded backend server missing (${backendServer}). The packaged app could ` +
        'not boot its local backend. Check "extraResources" in package.json and the ' +
        'before-build backend build step.',
    );
  }
  if (!fs.existsSync(backendMint)) {
    fail(
      `embedded backend mint entrypoint missing (${backendMint}). The supervisor ` +
        'could not mint a conductor key. Check src/conductor/mint-conductor-key.ts is compiled.',
    );
  }
  if (!fs.existsSync(backendNodeModules)) {
    fail(
      `embedded backend node_modules missing (${backendNodeModules}). The backend ` +
        'would fail to require its dependencies. Check "extraResources" in package.json.',
    );
  }

  // --- Invariant 3b: the governance daemon ships with the backend (if present). ---
  // The conductor governance daemon (resource-governor + governance-gate) is
  // compiled into backend/dist alongside server.js, not as a separate binary.
  // It exists in the source tree today, so once the backend dist is present we
  // require it too: a tsc regression that drops it must fail the pack rather than
  // ship a backend that boots without resource governance.
  const governorEntry = path.join(backendDir, 'dist', 'conductor', 'resource-governor.js');
  const gateEntry = path.join(backendDir, 'dist', 'conductor', 'governance-gate.js');
  const governorPresent = fs.existsSync(governorEntry);
  const gatePresent = fs.existsSync(gateEntry);
  if (governorPresent !== gatePresent) {
    fail(
      'governance daemon is only partially bundled in the embedded backend dist ' +
        `(resource-governor.js: ${governorPresent}, governance-gate.js: ${gatePresent}). ` +
        'Expected both or neither. Check the docker-backend tsc output.',
    );
  }
  const governanceBundled = governorPresent && gatePresent;

  // --- Invariant 4: the vendored tmux binary is bundled and executable. ---
  // The conductor substrate drives this binary; without it tmux:false on health.
  // (Only assert for the platform that ships the bundled binary — darwin here.)
  const tmuxBin = path.join(backendDir, 'c', 'tmux', 'tmux');
  if (electronPlatformName === 'darwin') {
    if (!fs.existsSync(tmuxBin)) {
      fail(
        `vendored tmux binary missing (${tmuxBin}). The conductor substrate would ` +
          'report tmux:false. Check the c/tmux/tmux extraResources entry.',
      );
    }
    try {
      fs.accessSync(tmuxBin, fs.constants.X_OK);
    } catch {
      fail(`vendored tmux binary is not executable: ${tmuxBin}`);
    }
  }

  // --- Invariant 5: the product icon assets ship inside app.asar. ---
  // The dock/tray code in main.js loads assets/icon.icns (mac) / icon.png from
  // the asar at runtime, and electron-builder reads them for the installer icon.
  // If the assets/**/* glob regressed, the app would fall back to the default
  // Electron icon. We require the icon for THIS platform to be present in asar.
  const iconAssetByPlatform = {
    darwin: 'assets/icon.icns',
    mas: 'assets/icon.icns',
    win32: 'assets/icon.png',
    linux: 'assets/icon.png',
  };
  const requiredIconAsset = iconAssetByPlatform[electronPlatformName] || 'assets/icon.png';
  if (!asarHasFile(asarPath, requiredIconAsset)) {
    fail(
      `product icon ${requiredIconAsset} is not bundled in app.asar. The app would ` +
        'fall back to the default Electron icon. Check the "assets/**/*" entry in ' +
        'the "files" whitelist and that scripts/generate-icon.js ran in before-build.',
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    `[after-pack] release-artifact assertions passed for ${electronPlatformName}: ` +
      `node-pty unpacked (${nativeNodes.length} .node binary file(s)), ` +
      'electron-updater bundled, embedded backend (server.js + mint + node_modules) ' +
      `present, governance daemon ${governanceBundled ? 'bundled' : 'absent'}, ` +
      `vendored tmux bundled, product icon (${requiredIconAsset}) bundled.`,
  );
};
