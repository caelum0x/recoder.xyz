#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const appJsonPath = path.join(repoRoot, "apps/mobile/app.json");
const iosPlistPath = path.join(repoRoot, "apps/mobile/ios/Recoder/Info.plist");
const androidGradlePath = path.join(repoRoot, "apps/mobile/android/app/build.gradle");

let failCount = 0;

function pass(msg) {
  console.log(`PASS ${msg}`);
}

function fail(msg) {
  failCount += 1;
  console.error(`FAIL ${msg}`);
}

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    fail(`cannot read ${filePath}: ${error.message}`);
    return "";
  }
}

function plistStringValue(plistXml, key) {
  const regex = new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`);
  const match = plistXml.match(regex);
  return match ? match[1].trim() : "";
}

const appJsonRaw = readFile(appJsonPath);
const plistRaw = readFile(iosPlistPath);
const gradleRaw = readFile(androidGradlePath);

if (failCount > 0) {
  process.exit(1);
}

let appJson;
try {
  appJson = JSON.parse(appJsonRaw);
} catch (error) {
  fail(`apps/mobile/app.json is invalid JSON: ${error.message}`);
  process.exit(1);
}

const expo = appJson.expo || {};
const expoVersion = String(expo.version || "").trim();
const runtimeVersion = String(expo.runtimeVersion || "").trim();
const iosBundle = String(expo.ios?.bundleIdentifier || "").trim();
const androidPackage = String(expo.android?.package || "").trim();

const iosShortVersion = plistStringValue(plistRaw, "CFBundleShortVersionString");
const iosBuildVersion = plistStringValue(plistRaw, "CFBundleVersion");

const androidVersionNameMatch = gradleRaw.match(/versionName\s+"([^"]+)"/);
const androidVersionCodeMatch = gradleRaw.match(/versionCode\s+([0-9]+)/);
const androidVersionName = androidVersionNameMatch ? androidVersionNameMatch[1].trim() : "";
const androidVersionCode = androidVersionCodeMatch ? androidVersionCodeMatch[1].trim() : "";

if (!expoVersion) {
  fail("app.json expo.version is missing");
}
if (!runtimeVersion) {
  fail("app.json expo.runtimeVersion is missing");
} else if (runtimeVersion !== expoVersion) {
  fail(`expo.runtimeVersion (${runtimeVersion}) must match expo.version (${expoVersion})`);
} else {
  pass(`expo runtimeVersion matches app version (${expoVersion})`);
}

if (!iosShortVersion) {
  fail("iOS CFBundleShortVersionString missing in Info.plist");
} else if (expoVersion && iosShortVersion !== expoVersion) {
  fail(`iOS CFBundleShortVersionString (${iosShortVersion}) must match expo.version (${expoVersion})`);
} else {
  pass(`iOS short version matches app version (${iosShortVersion})`);
}

if (!androidVersionName) {
  fail("Android versionName missing in build.gradle");
} else if (expoVersion && androidVersionName !== expoVersion) {
  fail(`Android versionName (${androidVersionName}) must match expo.version (${expoVersion})`);
} else {
  pass(`Android versionName matches app version (${androidVersionName})`);
}

if (!iosBuildVersion || !/^[0-9]+$/.test(iosBuildVersion)) {
  fail(`iOS CFBundleVersion must be numeric (got "${iosBuildVersion || "missing"}")`);
}
if (!androidVersionCode || !/^[0-9]+$/.test(androidVersionCode)) {
  fail(`Android versionCode must be numeric (got "${androidVersionCode || "missing"}")`);
}
if (
  iosBuildVersion &&
  androidVersionCode &&
  /^[0-9]+$/.test(iosBuildVersion) &&
  /^[0-9]+$/.test(androidVersionCode)
) {
  if (iosBuildVersion !== androidVersionCode) {
    fail(`iOS CFBundleVersion (${iosBuildVersion}) must match Android versionCode (${androidVersionCode})`);
  } else {
    pass(`iOS CFBundleVersion matches Android versionCode (${iosBuildVersion})`);
  }
}

if (!iosBundle || !androidPackage) {
  fail("bundle/package identifiers missing in app.json");
} else if (iosBundle !== androidPackage) {
  fail(`iOS bundleIdentifier (${iosBundle}) must match Android package (${androidPackage})`);
} else {
  pass(`iOS/Android identifiers aligned (${iosBundle})`);
}

if (failCount > 0) {
  console.error(`Version consistency checks failed (${failCount})`);
  process.exit(1);
}

console.log("Version consistency checks passed");
