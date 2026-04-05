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

  if (current.major < 14) {
    return false;
  }

  if (current.major > 16) {
    return true;
  }

  if (current.major === 16) {
    return isAtLeast(current, { major: 16, minor: 0, patch: 10 });
  }

  if (current.major === 15) {
    const floors = {
      0: { major: 15, minor: 0, patch: 7 },
      1: { major: 15, minor: 1, patch: 11 },
      2: { major: 15, minor: 2, patch: 8 },
      3: { major: 15, minor: 3, patch: 8 },
      4: { major: 15, minor: 4, patch: 10 },
      5: { major: 15, minor: 5, patch: 9 },
    };
    const floor = floors[current.minor];
    if (!floor) {
      return true;
    }
    return isAtLeast(current, floor);
  }

  if (current.major === 14) {
    return isAtLeast(current, { major: 14, minor: 2, patch: 35 });
  }

  return false;
}

if (!isSafeNextVersion(version)) {
  throw new Error(
    `Blocked build: Next.js ${version} is below the minimum patched version. `
    + 'Use 14.2.35+, 15.0.7+, 15.1.11+, 15.2.8+, 15.3.8+, 15.4.10+, 15.5.9+, or 16.0.10+ before deploying.'
  );
}

console.log(`[security] Next.js ${version} passes the minimum patched-version gate.`);
