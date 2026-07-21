const { Arch } = require("electron-builder");
const pkg = require("./package.json");
const fs = require("fs");
const path = require("path");
const { assertExtraResourcesExist } = require("./build/assert-extra-resources.cjs");

const windowsShouldSign = !!process.env.SM_CODE_SIGNING_CERT_SHA1_HASH;

// Deliberate cloud-or-degrade artifacts: absence is LOGGED LOUD by the
// beforePack gate, never fatal. The Lance embedded vector store degrades to
// Qdrant/no-op at runtime (backend/src/domains/memory). Its napi crate does not
// yet exist at the repo root (crates/lance/npm-bindings is absent — it cannot be
// built here), so the entry is retained purely so the gate emits an explicit
// degrade line instead of silence. When Lance is later vendored + built, move
// this out so its absence fails loud again.
const OPTIONAL_EXTRA_RESOURCES = new Set([
    "../../../crates/lance/npm-bindings/target/release/lance_npm_bindings.node",
]);

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
            from: "../../../backend/node_modules",
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
        // Vendored recodergit + dmux engine dists. Both backend resolvers land on
        // <resources>/backend/apps/desktop/engines/... in packaged mode:
        // recodergit-service.ts resolves dist-relative
        // (__dirname=backend/dist/domains/engines, three ups + ../apps/...), and
        // dmux-adapter.ts walks ancestors for apps/desktop/engines/dmux. The
        // package.json files ride along so Node treats the dists as ESM
        // ("type": "module").
        {
            from: "../engines/recodergit/recodergit/dist",
            to: "backend/apps/desktop/engines/recodergit/recodergit/dist",
            filter: ["**/*"],
        },
        {
            from: "../engines/recodergit/recodergit/package.json",
            to: "backend/apps/desktop/engines/recodergit/recodergit/package.json",
        },
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
        // Cockpit SPA served by the embedded backend in packaged builds (W3).
        {
            from: "../cockpit/dist",
            to: "cockpit/dist",
            filter: ["**/*"],
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
        // arm64 only: every native .node addon and the beads bd binary on disk is
        // host arm64 (verified). An x64 dmg would copy arm64 binaries → runtime
        // dlopen failure, and the arch-aware gate would reject it anyway. x64 /
        // universal returns once cross-built native artifacts exist (owner runbook).
        target: [
            {
                target: "zip",
                arch: ["arm64"],
            },
            {
                target: "dmg",
                arch: ["arm64"],
            },
        ],
        category: "public.app-category.developer-tools",
        minimumSystemVersion: "10.15.0",
        mergeASARs: true,
        singleArchFiles: "**/dist/bin/recoder-server.*",
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
    linux: {
        artifactName: "${name}-${platform}-${arch}-${version}.${ext}",
        category: "TerminalEmulator",
        icon: "build/icon.png",
        executableName: pkg.name,
        target: ["zip", "deb", "rpm", "snap", "AppImage", "pacman"],
        synopsis: pkg.description,
        description: null,
        desktop: {
            entry: {
                Name: pkg.productName,
                Comment: pkg.description,
                Keywords: "developer;terminal;emulator;",
                Categories: "Development;Utility;",
            },
        },
        executableArgs: ["--enable-features", "UseOzonePlatform", "--ozone-platform-hint", "auto"], // Hint Electron to use Ozone abstraction layer for native Wayland support
    },
    deb: {
        afterInstall: "build/deb-postinstall.tpl",
    },
    win: {
        target: ["nsis", "msi", "zip"],
        icon: "build/icon.ico",
        signtoolOptions: windowsShouldSign && {
            signingHashAlgorithms: ["sha256"],
            publisherName: "Command Line Inc",
            certificateSubjectName: "Command Line Inc",
            certificateSha1: process.env.SM_CODE_SIGNING_CERT_SHA1_HASH,
        },
    },
    appImage: {
        license: "../LICENSE",
    },
    snap: {
        base: "core22",
        confinement: "classic",
        allowNativeWayland: true,
        artifactName: "${name}_${version}_${arch}.${ext}",
    },
    rpm: {
        // this should remove /usr/lib/.build-id/ links which can conflict with other electron apps like slack
        fpm: ["--rpm-rpmbuild-define", "_build_id_links none"],
    },
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
        const archName = context && context.arch != null ? Arch[context.arch] : null;
        assertExtraResourcesExist(config.extraResources, __dirname, {
            targetArch: archName === "universal" ? null : archName,
            optional: OPTIONAL_EXTRA_RESOURCES,
            archSensitive: ARCH_SENSITIVE_EXTRA_RESOURCES,
        });
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
    },
};

module.exports = config;
