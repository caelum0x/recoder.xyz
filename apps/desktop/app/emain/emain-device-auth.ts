// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * emain-device-auth.ts — electron glue around the device-flow sign-in core
 * (emain-device-auth-core.ts): safeStorage encryption for the persisted
 * session, the userData session path, and the system-browser opener. The IPC
 * surface (recoder:device-login / auth-refresh / auth-signout) lives in
 * emain-ipc.ts; the renderer bridge in preload-webview.ts.
 */

import { app, safeStorage, shell } from "electron";
import * as nodePath from "path";
import { DefaultAuthBaseUrl, DeviceAuthManager } from "./emain-device-auth-core";

export type { DeviceAuthResult, DeviceIdentity, DeviceLoginPrompt } from "./emain-device-auth-core";

function encryptSession(plaintext: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("encryption is not available");
    }
    return safeStorage.encryptString(plaintext).toString("base64");
}

function decryptSession(ciphertext: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("encryption is not available");
    }
    return safeStorage.decryptString(Buffer.from(ciphertext, "base64"));
}

let managerSingleton: DeviceAuthManager = null;

/** The app-wide device auth manager (session file lives in userData). */
export function getDeviceAuthManager(): DeviceAuthManager {
    if (managerSingleton == null) {
        managerSingleton = new DeviceAuthManager({
            baseUrl: process.env.RECODER_AUTH_BASE_URL || DefaultAuthBaseUrl,
            sessionPath: nodePath.join(app.getPath("userData"), "recoder-device-session.json"),
            encrypt: encryptSession,
            decrypt: decryptSession,
            openExternal: (url) => shell.openExternal(url),
        });
    }
    return managerSingleton;
}
