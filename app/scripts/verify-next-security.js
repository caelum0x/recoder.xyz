const { version } = require('next/package.json');

function parse(versionString) {
  const match = versionString.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Unable to parse Next.js version: ${versionString}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function isAtLeast(current, target) {
  if (current.major !== target.major) {
    return current.major > target.major;
  }
  if (current.minor !== target.minor) {
    return current.minor > target.minor;
  }
  return current.patch >= target.patch;
}

function isSafeNextVersion(versionString) {
  const current = parse(versionString);

  if (current.major < 15) {
    return false;
  }

  if (current.major > 16) {
    return true;
  }

  if (current.major === 16) {
    return isAtLeast(current, { major: 16, minor: 0, patch: 7 });
  }

  if (current.minor < 4) {
    return false;
  }

  if (current.minor === 4) {
    return isAtLeast(current, { major: 15, minor: 4, patch: 11 });
  }

  if (current.minor === 5) {
    return isAtLeast(current, { major: 15, minor: 5, patch: 7 });
  }

  return true;
}

if (!isSafeNextVersion(version)) {
  throw new Error(
    `Blocked build: Next.js ${version} is below the minimum patched version. `
    + 'Use 15.4.11+, 15.5.7+, or 16.0.7+ before deploying.'
  );
}

console.log(`[security] Next.js ${version} passes the minimum patched-version gate.`);
