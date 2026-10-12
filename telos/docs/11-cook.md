# 11 — Cook (desktop + mobile)

Cook produces store-shaped binaries. It does not publish.

`studio.cook` is blocked when `telos.toml [studio].require_playproof = true` and the last Playproof on this revision failed or is missing.

## Targets

| Target | Worker | Output | v1 |
|---|---|---|---|
| `linux` | Studio box | `.zip` + executable | yes (Bevy/Godot) |
| `windows` | Studio box or Win worker | `.zip` | yes if cross or Win image |
| `macos` | Mac worker | `.zip` / `.app` | later |
| `android` | Studio box + SDK/NDK | `.aab` + `.apk` | yes (Godot C# first) |
| `ios` | Mac worker + certs | `.xcarchive` | later, human certs |
| `web` | — | — | **not a target** |

## Android (v1)

Godot C# lane:

```
godot --headless --export-release Android /studio/<id>/builds/cook/game.aab
```

Then optional emulator **replay** of the same `playproof.yaml` tape (verification only). Failure here does not replace desktop Playproof; it is extra.

Signing: debug key in v1. Release keystore is a secret the human uploads (`secrets.needed` lists `ANDROID_KEYSTORE`). Agent never invents a keystore.

Unity lane (later): batchmethod `Recoder.Native.BuildAndroid` → AAB.

Bevy Android (`cargo apk`) after desktop loop is proven.

## iOS

1. Engine emits an Xcode project or archive-ready tree on Linux/Win if the engine supports it.
2. Job queued to `cook-ios-mac`.
3. Fastlane / `xcodebuild` with uploaded cert + profile.
4. TestFlight upload only with `approval_id`.

No “agent published to App Store.”

## Desktop

Bevy: `cargo build --release` → zip.  
Godot: export Linux/Win templates.  
Unity: `BuildTarget.StandaloneWindows64` / `StandaloneOSX` via batchmode.

Steam upload is out of scope for 90 days.

## Job model

```
cook_jobs (
  id, studio_id, target, status, artifact_path, sha256, logs, created_at
)
```

Status: `queued | running | failed | done`.  
`studio.logs stream=cook` tails the job.

## Failures the agent must see

- export preset missing
- SDK/NDK version mismatch
- signing missing
- playproof gate
- quota
