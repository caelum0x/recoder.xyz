// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { contextBridge, ipcRenderer } from "electron";

function isLoopbackHostname(hostname: string): boolean {
    return hostname == "127.0.0.1" || hostname == "localhost" || hostname == "[::1]";
}

// Recoder cockpit bridge — only exposed to pages served from the loopback
// backend (the embedded cockpit). This is a convenience seam, NOT the trust
// boundary: the host webview re-validates guest origin + payload before acting
// (frontend/app/view/recoder/recoder-open-terminal.ts), and the main process
// re-verifies event.senderFrame.url against the real backend origin before
// handing back any config — arbitrary sites get null.
//
// exposeInMainWorld is once-per-key, so the terminal action and the runtime
// config ({backendUrl, token} — the seam cockpit/src/lib/config.ts reads) are
// resolved first and exposed together in a single call.
try {
    const loc = globalThis.location;
    if (loc != null && loc.protocol == "http:" && isLoopbackHostname(loc.hostname)) {
        void (async () => {
            const bridge: Record<string, unknown> = {
                openWorkspaceTerminal: (payload: { sessionName: string; cwd?: string }) => {
                    ipcRenderer.sendToHost("recoder:open-workspace-terminal", payload);
                },
                // Redacted, secret-free supervisor-phase projection. Exposed
                // UNCONDITIONALLY (before the cockpit-config block) so it exists
                // precisely when the backend is NOT READY — the phases the phase
                // banner needs. The main process re-gates on a loopback frame.
                backendStatus: () => ipcRenderer.invoke("recoder:backend-status"),
            };
            try {
                const cfg = await ipcRenderer.invoke("recoder:cockpit-config");
                if (cfg != null && typeof cfg.backendUrl == "string") {
                    bridge.backendUrl = cfg.backendUrl;
                    bridge.token = cfg.token;
                    if (cfg.identity != null) {
                        bridge.identity = cfg.identity;
                    }
                    // Device-flow auth bridge (main process drives recoder.xyz; the
                    // cockpit only displays the prompt + result — never a token).
                    bridge.deviceLogin = () => ipcRenderer.invoke("recoder:device-login");
                    bridge.refreshToken = () => ipcRenderer.invoke("recoder:auth-refresh");
                    bridge.signOut = () => ipcRenderer.invoke("recoder:auth-signout");
                    bridge.onDeviceLoginPrompt = (callback: (prompt: unknown) => void) => {
                        const listener = (_event: unknown, prompt: unknown) => callback(prompt);
                        ipcRenderer.on("recoder:device-login-prompt", listener);
                        return () => ipcRenderer.removeListener("recoder:device-login-prompt", listener);
                    };
                }
            } catch (e) {
                console.log("recoder:cockpit-config unavailable", e);
            }
            contextBridge.exposeInMainWorld("__RECODER_COCKPIT__", bridge);
        })();
    }
} catch (e) {
    console.log("recoder cockpit bridge not exposed", e);
}

document.addEventListener("contextmenu", (event) => {
    console.log("contextmenu event", event);
    if (event.target == null) {
        return;
    }
    const targetElement = event.target as HTMLElement;
    // Check if the right-click is on an image
    if (targetElement.tagName === "IMG") {
        setTimeout(() => {
            if (event.defaultPrevented) {
                return;
            }
            event.preventDefault();
            const imgElem = targetElement as HTMLImageElement;
            const imageUrl = imgElem.src;
            ipcRenderer.send("webview-image-contextmenu", { src: imageUrl });
        }, 50);
        return;
    }
    // do nothing
});

document.addEventListener("mouseup", (event) => {
    // Mouse button 3 = back, button 4 = forward
    if (!event.isTrusted) {
        return;
    }
    if (event.button === 3 || event.button === 4) {
        event.preventDefault();
        ipcRenderer.send("webview-mouse-navigate", event.button === 3 ? "back" : "forward");
    }
});

console.log("loaded wave preload-webview.ts");
