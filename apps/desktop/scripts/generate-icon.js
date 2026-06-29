#!/usr/bin/env node
/**
 * Product-icon generator (ROADMAP M1.4).
 *
 * Derives the macOS/Windows/Linux app icons from the canonical Recoder cube
 * logo so the packaged app (and the dock) shows a real brand mark instead of a
 * placeholder. Outputs, written under apps/desktop/assets:
 *
 *   - icon.png  : 1024x1024 RGBA, used by the win/linux electron-builder targets
 *                 and by the dock/tray fallback in main.js.
 *   - icon.icns : multi-resolution macOS icon, used by the mac/dmg targets and
 *                 set on app.dock at runtime.
 *
 * Source of truth is assets/icon-source.png (the cube logo). Regenerate with:
 *
 *   node scripts/generate-icon.js
 *
 * On macOS we use the built-in `sips` + `iconutil` so no extra dependency is
 * needed in CI runners. If those are unavailable we fall back to ImageMagick
 * (`magick`/`convert`). The .icns step is macOS-only (iconutil); on other hosts
 * we still (re)generate icon.png and leave a pre-built icon.icns in place.
 *
 * This script is intentionally dependency-free and idempotent: running it twice
 * produces the same artifacts. It is wired as a prerequisite of the desktop
 * build (see package.json "generate:icon" + "prepackage").
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');
const sourcePng = path.join(assetsDir, 'icon-source.png');
const outPng = path.join(assetsDir, 'icon.png');
const outIcns = path.join(assetsDir, 'icon.icns');

/** The macOS .iconset resolutions iconutil expects (size, @1x/@2x suffix). */
const ICONSET_VARIANTS = [
  { size: 16, scale: 1 },
  { size: 16, scale: 2 },
  { size: 32, scale: 1 },
  { size: 32, scale: 2 },
  { size: 128, scale: 1 },
  { size: 128, scale: 2 },
  { size: 256, scale: 1 },
  { size: 256, scale: 2 },
  { size: 512, scale: 1 },
  { size: 512, scale: 2 },
];

function has(bin) {
  try {
    execFileSync('which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function resizePng(src, dest, size) {
  if (has('sips')) {
    // -Z scales the longest side to `size` while preserving aspect.
    execFileSync('sips', ['-s', 'format', 'png', '-Z', String(size), src, '--out', dest], {
      stdio: 'ignore',
    });
    return;
  }
  if (has('magick')) {
    execFileSync('magick', [src, '-resize', `${size}x${size}`, dest], { stdio: 'ignore' });
    return;
  }
  if (has('convert')) {
    execFileSync('convert', [src, '-resize', `${size}x${size}`, dest], { stdio: 'ignore' });
    return;
  }
  throw new Error(
    'No image resizer available. Install macOS sips (default) or ImageMagick (magick/convert).',
  );
}

function buildIconset(iconsetDir) {
  fs.mkdirSync(iconsetDir, { recursive: true });
  for (const { size, scale } of ICONSET_VARIANTS) {
    const px = size * scale;
    const suffix = scale === 2 ? `${size}x${size}@2x` : `${size}x${size}`;
    const dest = path.join(iconsetDir, `icon_${suffix}.png`);
    resizePng(sourcePng, dest, px);
  }
}

function generateIcns() {
  if (process.platform !== 'darwin' || !has('iconutil')) {
    console.warn(
      '[generate-icon] iconutil unavailable (not macOS); leaving existing icon.icns in place.',
    );
    return false;
  }
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'recoder-iconset-'));
  const iconsetDir = path.join(tmpRoot, 'icon.iconset');
  try {
    buildIconset(iconsetDir);
    execFileSync('iconutil', ['--convert', 'icns', '--output', outIcns, iconsetDir], {
      stdio: 'inherit',
    });
    return true;
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function main() {
  if (!fs.existsSync(sourcePng)) {
    throw new Error(
      `[generate-icon] source cube logo missing at ${sourcePng}. ` +
        'Copy the canonical Recoder cube logo there before generating icons.',
    );
  }

  console.log(`[generate-icon] source: ${path.relative(process.cwd(), sourcePng)}`);

  // 1024x1024 master used by win/linux + dock/tray fallback.
  resizePng(sourcePng, outPng, 1024);
  console.log(`[generate-icon] wrote ${path.relative(process.cwd(), outPng)} (1024x1024)`);

  const icnsBuilt = generateIcns();
  if (icnsBuilt) {
    console.log(`[generate-icon] wrote ${path.relative(process.cwd(), outIcns)}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

module.exports = { ICONSET_VARIANTS };
