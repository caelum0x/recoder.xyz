const { Arch } = require("electron-builder");
const pkg = require("./package.json");
const fs = require("fs");
const path = require("path");
const { assertExtraResourcesExist, buildExtraResourcesGateOptions } = require("./build/assert-extra-resources.cjs");
const {
    assertRestrictedEngineInputs,
    assertRestrictedEnginesAbsentFromArtifact,
    writeLicenseBoundaryEvidence,
} = require("./build/assert-license-boundary.cjs");

// Notarization is automatic when Apple API (or apple-id) creds are present — this
// obsoletes the old untracked electron-builder.notarize.cjs helper. Absent creds →
// a plain unsigned dev build, never a half-configured notarize that fails the run.
const macShouldNotarize = !!(
    (process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER) ||
    (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID)
);

// mac target arch: arm64 by default. RECODER_MAC_ARCH=x64|universal switches it
// ONCE cross-built native artifacts exist (owner runbook). Guarded so a normal
// build stays arm64 and the arch-aware beforePack gate keeps rejecting a dmg whose
// bundled .node/bd binaries don't match the target arch.
const macArch = (() => {
    const v = (process.env.RECODER_MAC_ARCH || "arm64").trim();
    return v === "x64" || v === "universal" ? v : "arm64";
})();

// Staged Windows/Linux targets, OFF by default (bd recoder-di8l). Same env-gate
// shape as RECODER_MAC_ARCH: RECODER_BUILD_TARGETS is a comma list ("win",
// "linux") and only the named platforms emit a target block below, so an UNSET
// env yields the exact mac-only config — byte-identical to before these blocks
// existed. The blocks are inert staging, not a shippable path: every bundled
// engine artifact on disk today is arm64-darwin (the Rust NAPI addons, beads
// `bd`, tmux, recoder-server), so a real win/linux artifact set plus on-target
// native rebuilds are required before either produces a runnable app. See
// docs/DESKTOP-CROSS-PLATFORM.md for the per-artifact readiness table + recipe.
const buildTargets = new Set(
    (process.env.RECODER_BUILD_TARGETS || "")
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
);

// Deliberate cloud-or-degrade artifacts: absence is LOGGED LOUD by the
// beforePack gate, never fatal. The Lance embedded vector store degrades to
// Qdrant/no-op at runtime (backend/src/domains/memory). Its napi crate does not
// yet exist at the repo root (crates/lance/npm-bindings is absent — it cannot be
// built here), so the entry is retained purely so the gate emits an explicit
// degrade line instead of silence. When Lance is later vendored + built, move
// this out so its absence fails loud again.
const OPTIONAL_EXTRA_RESOURCES = new Set(["../../../crates/lance/npm-bindings/target/release/lance_npm_bindings.node"]);

// Native binaries whose CPU arch must match the dmg target arch. The gate reads
// each Mach-O header and aborts on an arm64-in-x64-dmg (or vice-versa) mismatch.
// Every entry here is arm64-only on disk today, which is why the mac target is
// restricted to arm64 below until per-arch variants exist.
const ARCH_SENSITIVE_EXTRA_RESOURCES = new Set([
    "../../../backend/engines/rust/recoder-governance/target/release/recoder-governance-napi.node",
    "../../../crates/lance/npm-bindings/target/release/lance_npm_bindings.node",
    "../../../backend/engines/rust/openfang/target/release/openfang_napi.node",
    "../../../backend/engines/rust/tensorzero/crates/target/release/tensorzero_gateway_napi.node",
    "../server/engines/beads/bin/bd",
    "../engines/loom/target/release/loom",
]);

/**
 * @type {import('electron-builder').Configuration}
 * @see https://www.electron.build/configuration/configuration
 */
const config = {
    appId: pkg.build.appId,
    productName: pkg.productName,
    executableName: pkg.productName,
    artifactName: "${productName}-${platform}-${arch}-${version}.${ext}",
    generateUpdatesFilesForAllChannels: true,
    npmRebuild: false,
    nodeGypRebuild: false,
    electronCompile: false,
    files: [
        {
            from: "./dist",
            to: "./dist",
            filter: ["**/*", "!bin/*", "bin/recoder-server.${arch}*", "bin/wsh*", "!tsunamiscaffold/**/*"],
        },
        {
            from: ".",
            to: ".",
            filter: ["package.json"],
        },
        "!node_modules", // We don't need electron-builder to package in Node modules as Vite has already bundled any code that our program is using.
    ],
    extraResources: [
        {
            from: "dist/tsunamiscaffold",
            to: "tsunamiscaffold",
        },
        // Embedded Node backend (spawned by emain-backend.ts with
        // ELECTRON_RUN_AS_NODE=1 + process.execPath, running
        // <resources>/backend/dist/server.js).
        {
            from: "../../../backend/dist",
            to: "backend/dist",
            filter: ["**/*"],
        },
        {
            // Default = the in-repo pnpm symlink farm. For a SIGNED build this
            // must instead point at a self-contained deploy whose symlinks all
            // resolve inside the tree (real native .node binaries built in
            // place) — the source symlinks escape the .app bundle and dangle,
            // which aborts codesign with ENOENT. Set
            // RECODER_BACKEND_NODE_MODULES to the deploy's node_modules.
            from: process.env.RECODER_BACKEND_NODE_MODULES || "../../../backend/node_modules",
            to: "backend/node_modules",
            filter: ["**/*"],
        },
        {
            from: "../../../backend/package.json",
            to: "backend/package.json",
        },
        {
            from: "../../../backend/data",
            to: "backend/data-template",
            filter: ["**/*"],
        },
        // Pinned tmux binary the conductor (and wave terminal blocks) drive.
        {
            from: "../engines/tmux/tmux",
            to: "backend/engines/tmux/tmux",
        },
        // Vendored loom engine binary (the agent-aware multiplexer substrate).
        // Host-arch cargo release build (Rust 1.96.1 + zig 0.15.2), a git-ignored
        // build artifact like the tmux/beads/.node engines — NOT in git. Build:
        //   cd apps/desktop/engines/loom && ZIG=<zig-0.15.2> cargo build --release --locked
        // Backend resolves it at <resources>/backend/engines/loom/loom
        // (loom-path.ts: resourcesPath + dist-relative), before any dev/PATH loom.
        {
            from: "../engines/loom/target/release/loom",
            to: "backend/engines/loom/loom",
        },
        // Owned beads `bd` binary (issue-graph memory). Host-arch local build
        // like tmux/the .node addons — DELIBERATELY NOT in git (>100MB, stripped
        // from history; see apps/desktop/server/engines/beads/.gitignore). Build:
        //   cd apps/desktop/server/engines/beads && go build -o bin/bd ./cmd/bd
        // Backend resolves it at <resources>/backend/engines/beads/bin/bd
        // (beads-bin.ts: resourcesPath + dist-relative), before any PATH bd.
        {
            from: "../server/engines/beads/bin/bd",
            to: "backend/engines/beads/bin/bd",
        },
        // Vendored dmux engine dist. The backend resolver lands on
        // <resources>/backend/apps/desktop/engines/... in packaged mode:
        // dmux-adapter.ts walks ancestors for apps/desktop/engines/dmux. The
        // package.json files ride along so Node treats the dists as ESM
        // ("type": "module").
        //
        // recodergit is DELIBERATELY NOT bundled (bd recoder-rxn0): its engine
        // is PolyForm Noncommercial 1.0.0 — commercial distribution is not
        // licensed. recodergit-service.ts degrades truthfully to 'unavailable'
        // when the dist is absent (never throws into a request path). Do not
        // re-add without a commercial license or a permissive replacement.
        {
            from: "../engines/dmux/dist",
            to: "backend/apps/desktop/engines/dmux/dist",
            filter: ["**/*"],
        },
        {
            from: "../engines/dmux/dmux",
            to: "backend/apps/desktop/engines/dmux/dmux",
        },
        {
            from: "../engines/dmux/package.json",
            to: "backend/apps/desktop/engines/dmux/package.json",
        },
        // Native NAPI addons the backend loads in-process.
        {
            from: "../../../backend/engines/rust/recoder-governance/target/release/recoder-governance-napi.node",
            to: "native/recoder-governance-napi.node",
        },
        {
            from: "../../../crates/lance/npm-bindings/target/release/lance_npm_bindings.node",
            to: "native/lance_npm_bindings.node",
        },
        {
            from: "../../../backend/engines/rust/openfang/target/release/openfang_napi.node",
            to: "native/openfang_napi.node",
        },
        {
            from: "../../../backend/engines/rust/tensorzero/crates/target/release/tensorzero_gateway_napi.node",
            to: "native/tensorzero_gateway_napi.node",
        },
    ],
    directories: {
        output: "make",
    },
    asarUnpack: [
        "dist/bin/**/*", // recoder-server and wsh binaries
        "dist/schema/**/*", // schema files for Monaco editor
    ],
    mac: {
        // arm64 by default: every native .node addon and the beads bd binary on
        // disk is host arm64 (verified). An x64 dmg would copy arm64 binaries →
        // runtime dlopen failure, and the arch-aware gate would reject it. Set
        // RECODER_MAC_ARCH=x64|universal only once cross-built native artifacts
        // exist (owner runbook §1b).
        target: [
            {
                target: "zip",
                arch: [macArch],
            },
            {
                target: "dmg",
                arch: [macArch],
            },
        ],
        category: "public.app-category.developer-tools",
        minimumSystemVersion: "10.15.0",
        mergeASARs: true,
        singleArchFiles: "**/dist/bin/recoder-server.*",
        // Hardened runtime + notarization turn on automatically when Apple creds
        // are present (macShouldNotarize); a keyless dev build stays unsigned.
        hardenedRuntime: macShouldNotarize,
        gatekeeperAssess: false,
        notarize: macShouldNotarize,
        entitlements: "build/entitlements.mac.plist",
        entitlementsInherit: "build/entitlements.mac.plist",
        icon: "build/icon.icns",
        extendInfo: {
            NSContactsUsageDescription: "A CLI application running in Recoder wants to use your contacts.",
            NSRemindersUsageDescription: "A CLI application running in Recoder wants to use your reminders.",
            NSLocationWhenInUseUsageDescription:
                "A CLI application running in Recoder wants to use your location information while active.",
            NSLocationAlwaysUsageDescription:
                "A CLI application running in Recoder wants to use your location information, even in the background.",
            NSCameraUsageDescription: "A CLI application running in Recoder wants to use the camera.",
            NSMicrophoneUsageDescription: "A CLI application running in Recoder wants to use your microphone.",
            NSCalendarsUsageDescription: "A CLI application running in Recoder wants to use Calendar data.",
            NSLocationUsageDescription: "A CLI application running in Recoder wants to use your location information.",
            NSAppleEventsUsageDescription: "A CLI application running in Recoder wants to use AppleScript.",
        },
    },
    // Windows/Linux target blocks are STAGED below the config (attached only
    // when RECODER_BUILD_TARGETS names them) rather than inlined here, so the
    // default mac-only object stays byte-identical. They remain inert until a
    // per-platform engine artifact set exists: every bundled engine binary on
    // disk today — the Rust NAPI addons in ARCH_SENSITIVE_EXTRA_RESOURCES, beads
    // `bd`, tmux, recoder-server — is arm64-darwin, so a mac-host win/linux pack
    // would ship engines that cannot start. See docs/DESKTOP-CROSS-PLATFORM.md.
    publish: {
        provider: "generic",
        url: "https://dl.recoder.xyz/releases",
    },
    // Fail-loud gate: abort packaging (with the full missing list) if any
    // extraResources source is absent, instead of electron-builder silently
    // skipping it and shipping a desktop app without its native engines.
    beforePack: async (context) => {
        // context.arch is an Arch enum member; universal is a merged binary so the
        // per-arch check is skipped (null targetArch), matching the gate contract.
        const platform = context && context.electronPlatformName;
        const archName = context && context.arch != null ? Arch[context.arch] : null;
        assertRestrictedEngineInputs(config, __dirname);
        // The Mach-O CPU-arch gate only applies to the mac build: every path in
        // ARCH_SENSITIVE_EXTRA_RESOURCES is a darwin .node/bd artifact. For a
        // win/linux target those must be swapped for on-target native builds
        // (RECODER_BACKEND_NODE_MODULES → a per-platform deploy) and validated on
        // that machine — reading a mac Mach-O header here would falsely reject or
        // falsely pass them. So off darwin we keep the fail-loud EXISTENCE gate
        // but truthfully skip the CPU-arch check (documented: DESKTOP-CROSS-PLATFORM.md).
        assertExtraResourcesExist(
            config.extraResources,
            __dirname,
            buildExtraResourcesGateOptions(platform, archName, OPTIONAL_EXTRA_RESOURCES, ARCH_SENSITIVE_EXTRA_RESOURCES)
        );
    },
    afterPack: (context) => {
        // This is a workaround to restore file permissions to the recoder-server binaries on macOS after packaging the universal binary.
        if (context.electronPlatformName === "darwin" && context.arch === Arch.universal) {
            const packageBinDir = path.resolve(
                context.appOutDir,
                `${pkg.productName}.app/Contents/Resources/app.asar.unpacked/dist/bin`
            );

            // Reapply file permissions to the recoder-server binaries in the final app package
            fs.readdirSync(packageBinDir, {
                recursive: true,
                withFileTypes: true,
            })
                .filter((f) => f.isFile() && f.name.startsWith("recoder-server"))
                .forEach((f) => fs.chmodSync(path.resolve(f.parentPath ?? f.path, f.name), 0o755)); // 0o755 corresponds to -rwxr-xr-x
        }

        const resourcesDir = context.packager.getResourcesDir(context.appOutDir);
        const report = assertRestrictedEnginesAbsentFromArtifact(resourcesDir);
        const archName = context.arch != null ? Arch[context.arch] : "unknown";
        writeLicenseBoundaryEvidence(
            {
                ...report,
                platform: context.electronPlatformName,
                arch: archName,
                packagingInputs: assertRestrictedEngineInputs(config, __dirname),
            },
            path.join(context.outDir, `license-boundary-${context.electronPlatformName}-${archName}.json`)
        );
    },
};

// Attach the staged cross-platform blocks only when explicitly requested. When
// RECODER_BUILD_TARGETS is unset `buildTargets` is empty, so `config` keeps
// exactly the mac-only shape above and the existing packaging test's mac
// assertions are unaffected. x64 only — win-arm64/linux-arm64 native artifacts
// are not built yet (docs/DESKTOP-CROSS-PLATFORM.md §readiness).
if (buildTargets.has("win")) {
    config.win = {
        target: [
            { target: "nsis", arch: ["x64"] },
            { target: "portable", arch: ["x64"] },
        ],
        icon: "build/icon.ico",
    };
    config.nsis = {
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
    };
}

if (buildTargets.has("linux")) {
    config.linux = {
        target: [
            { target: "AppImage", arch: ["x64"] },
            { target: "deb", arch: ["x64"] },
        ],
        icon: "build/icon.png",
        category: "Development",
        maintainer: "Recoder <support@recoder.xyz>",
    };
}

module.exports = config;
