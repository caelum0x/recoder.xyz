import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  downloadHref,
  platformChecksum,
  releaseVersionLabel,
  releasesArePublic,
  releaseVisibility,
} from "./releases";

const RELEASE_ENV_KEYS = [
  "NEXT_PUBLIC_GITHUB_RELEASES_URL",
  "NEXT_PUBLIC_DOWNLOAD_MACOS_URL",
  "NEXT_PUBLIC_DOWNLOAD_WINDOWS_URL",
  "NEXT_PUBLIC_DOWNLOAD_LINUX_URL",
  "NEXT_PUBLIC_DOWNLOAD_MACOS_SHA256",
  "NEXT_PUBLIC_RELEASE_VERSION",
  "NEXT_PUBLIC_RELEASE_VISIBILITY",
] as const;

const ORIGINAL_ENV = Object.fromEntries(RELEASE_ENV_KEYS.map((key) => [key, process.env[key]]));

function restoreReleaseEnv() {
  for (const key of RELEASE_ENV_KEYS) {
    const value = ORIGINAL_ENV[key];
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(() => restoreReleaseEnv());

describe("release visibility", () => {
  it("defaults to invite-only private beta", () => {
    delete process.env.NEXT_PUBLIC_RELEASE_VISIBILITY;
    process.env.NEXT_PUBLIC_DOWNLOAD_MACOS_URL = "https://dl.example.test/Recoder-0.16.1-arm64.dmg";

    assert.equal(releaseVisibility(), "private-beta");
    assert.equal(releasesArePublic(), false);
  });

  it("requires explicit public visibility before the site shows a public download", () => {
    process.env.NEXT_PUBLIC_RELEASE_VISIBILITY = "public";
    process.env.NEXT_PUBLIC_DOWNLOAD_MACOS_URL = "https://dl.example.test/Recoder-0.16.1-arm64.dmg";

    assert.equal(releaseVisibility(), "public");
    assert.equal(releasesArePublic(), true);
  });

  it("keeps the generic releases-page fallback for macOS only", () => {
    process.env.NEXT_PUBLIC_RELEASE_VISIBILITY = "public";
    process.env.NEXT_PUBLIC_GITHUB_RELEASES_URL = "https://github.com/example/recoder/releases";

    assert.equal(downloadHref("macos"), "https://github.com/example/recoder/releases");
    assert.equal(downloadHref("windows"), undefined);
    assert.equal(downloadHref("linux"), undefined);
  });
});

describe("release metadata helpers", () => {
  it("trims the version label and filters malformed checksums", () => {
    process.env.NEXT_PUBLIC_RELEASE_VERSION = "  v0.16.1  ";
    process.env.NEXT_PUBLIC_DOWNLOAD_MACOS_SHA256 = "not-a-checksum";

    assert.equal(releaseVersionLabel(), "v0.16.1");
    assert.equal(platformChecksum("macos"), undefined);

    process.env.NEXT_PUBLIC_DOWNLOAD_MACOS_SHA256 =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    assert.equal(
      platformChecksum("macos"),
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
    );
  });
});
