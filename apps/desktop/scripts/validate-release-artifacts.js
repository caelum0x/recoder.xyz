#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args[key] = value;
    }
  }
  return args;
}

function walkFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function toSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const args = parseArgs(process.argv);
const distDir = path.resolve(args.dist || 'dist');
const platform = String(args.platform || '').toLowerCase();

if (!platform || !['linux', 'windows', 'mac'].includes(platform)) {
  fail('Usage: --platform <linux|windows|mac> --dist <path>');
}

if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) {
  fail(`dist directory not found: ${distDir}`);
}

const files = walkFiles(distDir).filter((file) => !file.endsWith('.blockmap'));
if (files.length === 0) {
  fail(`no artifacts produced in ${distDir}`);
}

const patternsByPlatform = {
  linux: [/\.AppImage$/i, /\.deb$/i, /\.rpm$/i, /\.snap$/i],
  windows: [/\.exe$/i, /\.msi$/i],
  mac: [/\.dmg$/i, /\.zip$/i, /\.pkg$/i],
};

const platformPatterns = patternsByPlatform[platform];
const releaseFiles = files.filter((file) => platformPatterns.some((pattern) => pattern.test(file)));

if (releaseFiles.length === 0) {
  const names = files.map((file) => path.basename(file)).join(', ');
  fail(`no ${platform} release artifact found. files: ${names}`);
}

console.log(`PASS: found ${releaseFiles.length} ${platform} release artifact(s)`);
for (const file of releaseFiles) {
  console.log(` - ${path.relative(process.cwd(), file)}`);
}

const checksums = releaseFiles
  .map((file) => `${toSha256(file)}  ${path.basename(file)}`)
  .join('\n');
const checksumPath = path.join(distDir, `checksums-${platform}.txt`);
fs.writeFileSync(checksumPath, `${checksums}\n`, 'utf-8');
console.log(`PASS: wrote checksums ${path.relative(process.cwd(), checksumPath)}`);
