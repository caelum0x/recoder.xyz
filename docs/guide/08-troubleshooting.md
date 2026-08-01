# Troubleshooting

Recoder is built to **degrade truthfully** — when something's missing, the relevant
surface tells you instead of faking success. This page maps the common "not
connected / not available" states to fixes.

## "Backend not connected" everywhere

The desktop app runs a local control-plane backend on `http://127.0.0.1:3100` and
supervises it. If views show a neutral "not connected" state:

- Give it a moment on first launch — the backend takes a few seconds to boot.
- Make sure nothing else is bound to port `3100`. You can override the port with
  the `RECODER_BACKEND_PORT` environment variable before launching.
- If it persists, quit and relaunch so the supervisor respawns the backend.

The app never fabricates data when the backend is down — a cold/disconnected view
is telling you the truth, not hiding an error.

## An agent isn't detected

Recoder detects agents by probing your `PATH`.

- Confirm the CLI runs from a normal terminal: `claude --version`, `codex
  --version`, `opencode --version`, etc.
- Make sure it's on the same `PATH` Recoder inherited. If you installed the agent
  **after** launching Recoder, just refresh — detection is a live `PATH` probe.
- If the agent is installed but shows as unauthenticated, complete its own login /
  set its provider key (see [BYOK](./07-byok-and-keys.md)), then refresh.

## An agent is detected but its runs fail auth

That's the agent's provider auth, not Recoder. Recoder passes your environment
through; the agent talks to its provider with your keys. Verify the agent works
standalone (run it directly in a terminal against the same repo), fix its auth
there, then retry in Recoder.

## A merge won't land

- **Waiting on approval:** check the **Approvals** view — a policy-gated merge
  pauses for a human decision. Approve it there.
- **Denied:** the governance gate blocked it and shows a reason. Address the
  reason (e.g. a forbidden path or a risk policy) rather than trying to bypass it.
- **Illegal transition:** a workspace has to be in a reviewable state before it can
  merge. Finish review/converge first.

## Converge marked a file as a conflict

When two agents edit the **same lines** incompatibly, synthesize won't invent a
resolution — it flags the conflict and stops on that file. Resolve it by **picking**
one agent's version of that file instead, or converge the rest and handle that file
by hand.

## An engine/feature says "not configured" or "unavailable"

Some optional engines (semantic code search, browser verification, and similar)
depend on components that may not be present in every build or environment — for
example provider keys or Python sidecars. When a dependency is missing, the engine
reports `not configured` / `unavailable` **on purpose**, rather than pretending to
work. The core parallel-run → converge → governed-merge loop does not depend on
these optional engines.

## Verifying your download

If macOS won't open the app, or you want to confirm integrity:

```bash
# integrity
shasum -a 256 ~/Downloads/Recoder-<version>-arm64.dmg   # compare to the site's digest
# signature + notarization
codesign --verify --deep --strict /Applications/Recoder.app && echo "signature OK"
xcrun stapler validate ~/Downloads/Recoder-<version>-arm64.dmg
```

A notarized, stapled build opens without Gatekeeper prompts. If these checks fail,
re-download from [recoder.xyz/download](https://recoder.xyz/download).

## Still stuck?

Check the [changelog](https://recoder.xyz/changelog) for known issues with the
latest build, and the rest of this [guide](./README.md) for the surface you're on.
