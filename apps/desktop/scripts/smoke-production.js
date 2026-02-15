#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const mainPath = path.join(root, 'main.js');
const pkgPath = path.join(root, 'package.json');
const readmePath = path.join(root, 'README.md');
const envExamplePath = path.join(root, '.env.example');

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf-8');
}

const main = read(mainPath);
const pkg = JSON.parse(read(pkgPath));
const readme = read(readmePath);
const envExample = read(envExamplePath);

if (!main.includes("const PROTOCOL_SCHEME = 'recoder';")) {
  fail('desktop deep-link protocol must be recoder://');
} else {
  pass('deep-link protocol is recoder://');
}

if (!main.includes("const APP_URL = process.env.APP_URL || 'https://recoder.xyz/';")) {
  fail('desktop APP_URL default must target https://recoder.xyz/');
} else {
  pass('APP_URL default points to recoder.xyz');
}

if (main.includes('supabase.co/auth') || main.includes('/auth/v1/authorize')) {
  fail('desktop auth flow still references Supabase OAuth endpoints');
} else {
  pass('no Supabase OAuth endpoint residue in desktop auth flow');
}

if (!main.includes('DESKTOP_AUTO_UPDATE')) {
  fail('desktop updater must support DESKTOP_AUTO_UPDATE gate');
} else {
  pass('desktop updater has explicit DESKTOP_AUTO_UPDATE gate');
}

if (!main.includes('DESKTOP_CRASH_WEBHOOK_URL')) {
  fail('desktop runtime must support DESKTOP_CRASH_WEBHOOK_URL telemetry');
} else {
  pass('desktop crash telemetry webhook support present');
}

if (!main.includes("ipcMain.handle('agent:getWorkflowPlan'")) {
  fail('desktop runtime must expose agent:getWorkflowPlan IPC handler');
} else {
  pass('desktop exposes agent:getWorkflowPlan IPC handler');
}

if (!read(path.join(root, 'preload.js')).includes('getAgentWorkflowPlan')) {
  fail('desktop preload must expose getAgentWorkflowPlan');
} else {
  pass('desktop preload exposes getAgentWorkflowPlan');
}

if (pkg.name !== 'recoder-desktop') {
  fail(`desktop package name should be recoder-desktop (found ${pkg.name})`);
} else {
  pass('desktop package name is recoder-desktop');
}

if (readme.match(/kortix/gi)) {
  fail('desktop README contains legacy Kortix references');
} else {
  pass('desktop README has no legacy Kortix references');
}

if (envExample.match(/Kortix/gi)) {
  fail('.env.example contains legacy Kortix references');
} else {
  pass('.env.example has no legacy Kortix references');
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
