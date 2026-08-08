// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as electron from "electron";
import { FastAverageColor } from "fast-average-color";
import fs from "fs";
import * as child_process from "node:child_process";
import * as path from "path";
import { PNG } from "pngjs";
import { Readable } from "stream";
import { RpcApi } from "../frontend/app/store/wshclientapi";
import { getWebServerEndpoint } from "../frontend/util/endpoints";
import * as keyutil from "../frontend/util/keyutil";
import { fireAndForget, parseDataUrl } from "../frontend/util/util";
import {
    incrementTermCommandsDurable,
    incrementTermCommandsRemote,
    incrementTermCommandsRun,
    incrementTermCommandsWsl,
    setWasActive,
} from "./emain-activity";
import { getBackendAuth } from "./emain-backend";
import { getDeviceAuthManager } from "./emain-device-auth";
import { expandLeadingTilde } from "./emain-path-util";
import { createBuilderWindow, getAllBuilderWindows, getBuilderWindowByWebContentsId } from "./emain-builder";
import { callWithOriginalXdgCurrentDesktopAsync, unamePlatform } from "./emain-platform";
import { getWaveTabViewByWebContentsId } from "./emain-tabview";
import { handleCtrlShiftState } from "./emain-util";
import { getWaveVersion } from "./emain-wavesrv";
import { createNewWaveWindow, getWaveWindowByWebContentsId } from "./emain-window";
import { ElectronWshClient } from "./emain-wsh";

const electronApp = electron.app;

// Home-relative credential files each coding-agent CLI writes on its OWN login.
// Presence is a truthful POSITIVE auth signal; absence is inconclusive (a CLI may
// keep its login in the OS keychain), so a miss reports "unknown", never "signed
// out". Keyed by conductor runtimeId. Runtimes absent here always probe "unknown".
const AGENT_CREDENTIAL_FILES: Record<string, string[]> = {
    claude_code: [".claude/.credentials.json"],
    codex: [".codex/auth.json"],
    opencode: [".local/share/opencode/auth.json", ".config/opencode/auth.json"],
    gemini_cli: [".gemini/oauth_creds.json"],
    qwen_code: [".qwen/oauth_creds.json"],
};

let webviewFocusId: number = null;
let webviewKeys: string[] = [];

export function openBuilderWindow(appId?: string) {
    const normalizedAppId = appId || "";
    const existingBuilderWindows = getAllBuilderWindows();
    const existingWindow = existingBuilderWindows.find((win) => win.builderAppId === normalizedAppId);
    if (existingWindow) {
        existingWindow.focus();
        return;
    }
    fireAndForget(() => createBuilderWindow(normalizedAppId));
}

type UrlInSessionResult = {
    stream: Readable;
    mimeType: string;
    fileName: string;
};

function getSingleHeaderVal(headers: Record<string, string | string[]>, key: string): string {
    const val = headers[key];
    if (val == null) {
        return null;
    }
    if (Array.isArray(val)) {
        return val[0];
    }
    return val;
}

function cleanMimeType(mimeType: string): string {
    if (mimeType == null) {
        return null;
    }
    const parts = mimeType.split(";");
    return parts[0].trim();
}

function getFileNameFromUrl(url: string): string {
    try {
        const pathname = new URL(url).pathname;
        const filename = pathname.substring(pathname.lastIndexOf("/") + 1);
        return filename;
    } catch (e) {
        return null;
    }
}

function getUrlInSession(session: Electron.Session, url: string): Promise<UrlInSessionResult> {
    return new Promise((resolve, reject) => {
        if (url.startsWith("data:")) {
            try {
                const parsed = parseDataUrl(url);
                const buffer = Buffer.from(parsed.buffer);
                const readable = Readable.from(buffer);
                resolve({ stream: readable, mimeType: parsed.mimeType, fileName: "image" });
            } catch (err) {
                return reject(err);
            }
            return;
        }
        const request = electron.net.request({
            url,
            method: "GET",
            session,
        });
        const readable = new Readable({
            read() {},
        });
        request.on("response", (response) => {
            const statusCode = response.statusCode;
            if (statusCode < 200 || statusCode >= 300) {
                readable.destroy();
                request.abort();
                reject(new Error(`HTTP request failed with status ${statusCode}: ${response.statusMessage || ""}`));
                return;
            }

            const mimeType = cleanMimeType(getSingleHeaderVal(response.headers, "content-type"));
            const fileName = getFileNameFromUrl(url) || "image";
            response.on("data", (chunk) => {
                readable.push(chunk);
            });
            response.on("end", () => {
                readable.push(null);
                resolve({ stream: readable, mimeType, fileName });
            });
            response.on("error", (err) => {
                readable.destroy(err);
                reject(err);
            });
        });
        request.on("error", (err) => {
            readable.destroy(err);
            reject(err);
        });
        request.end();
    });
}

function saveImageFileWithNativeDialog(
    sender: electron.WebContents,
    defaultFileName: string,
    mimeType: string,
    readStream: Readable
) {
    if (defaultFileName == null || defaultFileName == "") {
        defaultFileName = "image";
    }
    const ww = electron.BrowserWindow.fromWebContents(sender);
    if (ww == null) {
        readStream.destroy();
        return;
    }
    const mimeToExtension: { [key: string]: string } = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/gif": "gif",
        "image/webp": "webp",
        "image/bmp": "bmp",
        "image/tiff": "tiff",
        "image/heic": "heic",
        "image/svg+xml": "svg",
    };
    function addExtensionIfNeeded(fileName: string, mimeType: string): string {
        const extension = mimeToExtension[mimeType];
        if (!path.extname(fileName) && extension) {
            return `${fileName}.${extension}`;
        }
        return fileName;
    }
    defaultFileName = addExtensionIfNeeded(defaultFileName, mimeType);
    electron.dialog
        .showSaveDialog(ww, {
            title: "Save Image",
            defaultPath: defaultFileName,
            filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "heic"] }],
        })
        .then((file) => {
            if (file.canceled) {
                readStream.destroy();
                return;
            }
            const writeStream = fs.createWriteStream(file.filePath);
            readStream.pipe(writeStream);
            writeStream.on("finish", () => {
                console.log("saved file", file.filePath);
            });
            writeStream.on("error", (err) => {
                console.log("error saving file (writeStream)", err);
                readStream.destroy();
            });
            readStream.on("error", (err) => {
                console.error("error saving file (readStream)", err);
                writeStream.destroy();
            });
        })
        .catch((err) => {
            console.log("error trying to save file", err);
        });
}

let attentionBadgeCount = 0;

function clearAttentionBadge() {
    if (attentionBadgeCount == 0) {
        return;
    }
    attentionBadgeCount = 0;
    electron.app.setBadgeCount(0);
}

// Main-process Notification (not the renderer's web Notification) so the click
// handler survives renderer GC and can natively restore/focus the window before
// routing the workspaceId back to the exact webContents that asked for it.
function showAttentionNotification(sender: Electron.WebContents, workspaceId: string, title: string, body: string) {
    if (!electron.Notification.isSupported()) {
        return;
    }
    const notification = new electron.Notification({ title, body });
    notification.on("click", () => {
        clearAttentionBadge();
        if (sender.isDestroyed()) {
            return;
        }
        const ww = electron.BrowserWindow.fromWebContents(sender);
        if (ww != null) {
            if (ww.isMinimized()) {
                ww.restore();
            }
            ww.show();
            ww.focus();
        }
        electron.app.focus({ steal: true });
        sender.send("recoder:attention-click", workspaceId);
    });
    notification.show();
    if (electron.BrowserWindow.getFocusedWindow() == null) {
        attentionBadgeCount++;
        electron.app.setBadgeCount(attentionBadgeCount);
    }
}

export function initIpcHandlers() {
    // Wave-frontend sign-in bridge (optional, offline-safe). These serve the
    // trusted app window (preload.ts `api`), whose frame is not the backend
    // origin — so they are not origin-gated; the curated preload surface is the
    // boundary. They use the device-auth manager, so recoder.xyz stays the auth
    // source of truth and the renderer only ever sees the display identity,
    // never the token.
    electron.ipcMain.handle("recoder:get-identity", () => {
        return getDeviceAuthManager().getIdentity();
    });
    electron.ipcMain.handle("recoder:sign-in", async (event) => {
        const sender = event.sender;
        return getDeviceAuthManager().deviceLogin((prompt) => {
            if (!sender.isDestroyed()) {
                sender.send("recoder:device-login-prompt", prompt);
            }
        });
    });
    electron.ipcMain.handle("recoder:sign-out", () => {
        return getDeviceAuthManager().signOut();
    });
    electron.ipcMain.handle("recoder:ensure-session", () => {
        return getDeviceAuthManager().ensureFreshSession();
    });
    // DT-7.1: hand the renderer the embedded backend's REAL loopback URL. The
    // supervisor prefers 3100 but falls back to a free port, so the renderer's
    // hardcoded default would target the wrong one. Sync so the renderer can read
    // it at boot; null before the backend is truthfully READY (the renderer then
    // keeps its default and picks up the pushed URL below once ready).
    electron.ipcMain.on("recoder:get-backend-url", (event) => {
        event.returnValue = getBackendAuth()?.backendUrl ?? null;
    });
    electron.ipcMain.on("open-external", (event, url) => {
        if (url && typeof url === "string") {
            fireAndForget(() =>
                callWithOriginalXdgCurrentDesktopAsync(() =>
                    electron.shell.openExternal(url).catch((err) => {
                        console.error(`Failed to open URL ${url}:`, err);
                    })
                )
            );
        } else {
            console.error("Invalid URL received in open-external event:", url);
        }
    });

    electron.ipcMain.on("webview-image-contextmenu", (event: electron.IpcMainEvent, payload: { src: string }) => {
        const menu = new electron.Menu();
        const win = getWaveWindowByWebContentsId(event.sender.hostWebContents?.id);
        if (win == null) {
            return;
        }
        menu.append(
            new electron.MenuItem({
                label: "Save Image",
                click: () => {
                    const resultP = getUrlInSession(event.sender.session, payload.src);
                    resultP
                        .then((result) => {
                            saveImageFileWithNativeDialog(
                                event.sender.hostWebContents,
                                result.fileName,
                                result.mimeType,
                                result.stream
                            );
                        })
                        .catch((e) => {
                            console.log("error getting image", e);
                        });
                },
            })
        );
        menu.popup();
    });

    electron.ipcMain.on("webview-mouse-navigate", (event: electron.IpcMainEvent, direction: string) => {
        if (direction === "back") {
            event.sender.navigationHistory.goBack();
        } else if (direction === "forward") {
            event.sender.navigationHistory.goForward();
        }
    });

    electron.ipcMain.on("download", (event, payload) => {
        const baseName = encodeURIComponent(path.basename(payload.filePath));
        const streamingUrl =
            getWebServerEndpoint() + "/wave/stream-file/" + baseName + "?path=" + encodeURIComponent(payload.filePath);
        event.sender.downloadURL(streamingUrl);
    });

    electron.ipcMain.on("get-cursor-point", (event) => {
        const tabView = getWaveTabViewByWebContentsId(event.sender.id);
        if (tabView == null) {
            event.returnValue = null;
            return;
        }
        const screenPoint = electron.screen.getCursorScreenPoint();
        const windowRect = tabView.getBounds();
        const retVal: Electron.Point = {
            x: screenPoint.x - windowRect.x,
            y: screenPoint.y - windowRect.y,
        };
        event.returnValue = retVal;
    });

    electron.ipcMain.handle("capture-screenshot", async (event, rect) => {
        const tabView = getWaveTabViewByWebContentsId(event.sender.id);
        if (!tabView) {
            throw new Error("No tab view found for the given webContents id");
        }
        const image = await tabView.webContents.capturePage(rect);
        const base64String = image.toPNG().toString("base64");
        return `data:image/png;base64,${base64String}`;
    });

    electron.ipcMain.on("get-env", (event, varName) => {
        event.returnValue = process.env[varName] ?? null;
    });

    electron.ipcMain.on("get-about-modal-details", (event) => {
        event.returnValue = getWaveVersion() as AboutModalDetails;
    });

    electron.ipcMain.on("get-zoom-factor", (event) => {
        event.returnValue = event.sender.getZoomFactor();
    });

    const hasBeforeInputRegisteredMap = new Map<number, boolean>();

    electron.ipcMain.on("webview-focus", (event: Electron.IpcMainEvent, focusedId: number) => {
        webviewFocusId = focusedId;
        console.log("webview-focus", focusedId);
        if (focusedId == null) {
            return;
        }
        const parentWc = event.sender;
        const webviewWc = electron.webContents.fromId(focusedId);
        if (webviewWc == null) {
            webviewFocusId = null;
            return;
        }
        if (!hasBeforeInputRegisteredMap.get(focusedId)) {
            hasBeforeInputRegisteredMap.set(focusedId, true);
            webviewWc.on("before-input-event", (e, input) => {
                let waveEvent = keyutil.adaptFromElectronKeyEvent(input);
                handleCtrlShiftState(parentWc, waveEvent);
                if (webviewFocusId != focusedId) {
                    return;
                }
                if (input.type != "keyDown") {
                    return;
                }
                for (let keyDesc of webviewKeys) {
                    if (keyutil.checkKeyPressed(waveEvent, keyDesc)) {
                        e.preventDefault();
                        parentWc.send("reinject-key", waveEvent);
                        console.log("webview reinject-key", keyDesc);
                        return;
                    }
                }
            });
            webviewWc.on("destroyed", () => {
                hasBeforeInputRegisteredMap.delete(focusedId);
            });
        }
    });

    electron.ipcMain.on("register-global-webview-keys", (event, keys: string[]) => {
        webviewKeys = keys ?? [];
    });

    electron.ipcMain.on("set-keyboard-chord-mode", (event) => {
        event.returnValue = null;
        const tabView = getWaveTabViewByWebContentsId(event.sender.id);
        tabView?.setKeyboardChordMode(true);
    });

    electron.ipcMain.handle("set-is-active", () => {
        setWasActive(true);
    });

    const fac = new FastAverageColor();
    electron.ipcMain.on("update-window-controls-overlay", async (event, rect: Dimensions) => {
        if (unamePlatform === "darwin") return;
        try {
            const fullConfig = await RpcApi.GetFullConfigCommand(ElectronWshClient);
            if (fullConfig?.settings?.["window:nativetitlebar"] && unamePlatform !== "win32") return;

            const zoomFactor = event.sender.getZoomFactor();
            const electronRect: Electron.Rectangle = {
                x: rect.left * zoomFactor,
                y: rect.top * zoomFactor,
                height: rect.height * zoomFactor,
                width: rect.width * zoomFactor,
            };
            const overlay = await event.sender.capturePage(electronRect);
            const overlayBuffer = overlay.toPNG();
            const png = PNG.sync.read(overlayBuffer);
            const color = fac.prepareResult(fac.getColorFromArray4(png.data));
            const ww = getWaveWindowByWebContentsId(event.sender.id);
            if (ww == null) return;
            ww.setTitleBarOverlay({
                color: unamePlatform === "linux" ? color.rgba : "#00000000",
                symbolColor: color.isDark ? "white" : "black",
            });
        } catch (e) {
            console.error("Error updating window controls overlay:", e);
        }
    });

    electron.ipcMain.on("quicklook", (event, filePath: string) => {
        if (unamePlatform !== "darwin") return;
        child_process.execFile("/usr/bin/qlmanage", ["-p", filePath], (error, stdout, stderr) => {
            if (error) {
                console.error(`Error opening Quick Look: ${error}`);
            }
        });
    });

    electron.ipcMain.handle("clear-webview-storage", async (event, webContentsId: number) => {
        try {
            const wc = electron.webContents.fromId(webContentsId);
            if (wc && wc.session) {
                await wc.session.clearStorageData();
                console.log("Cleared cookies and storage for webContentsId:", webContentsId);
            }
        } catch (e) {
            console.error("Failed to clear cookies and storage:", e);
            throw e;
        }
    });

    electron.ipcMain.on("open-native-path", (event, filePath: string) => {
        console.log("open-native-path", filePath);
        filePath = expandLeadingTilde(filePath, electronApp.getPath("home"));
        fireAndForget(() =>
            callWithOriginalXdgCurrentDesktopAsync(() =>
                electron.shell.openPath(filePath).then((excuse) => {
                    if (excuse) console.error(`Failed to open ${filePath} in native application: ${excuse}`);
                })
            )
        );
    });

    electron.ipcMain.on("set-window-init-status", (event, status: "ready" | "wave-ready") => {
        const tabView = getWaveTabViewByWebContentsId(event.sender.id);
        if (tabView != null && tabView.initResolve != null) {
            if (status === "ready") {
                tabView.initResolve();
                if (tabView.savedInitOpts) {
                    console.log("savedInitOpts calling wave-init", tabView.waveTabId);
                    tabView.webContents.send("wave-init", tabView.savedInitOpts);
                }
            } else if (status === "wave-ready") {
                tabView.waveReadyResolve();
            }
            return;
        }

        const builderWindow = getBuilderWindowByWebContentsId(event.sender.id);
        if (builderWindow != null) {
            if (status === "ready") {
                if (builderWindow.savedInitOpts) {
                    console.log("savedInitOpts calling builder-init", builderWindow.savedInitOpts.builderId);
                    builderWindow.webContents.send("builder-init", builderWindow.savedInitOpts);
                }
            }
            return;
        }

        console.log("set-window-init-status: no window found for webContentsId", event.sender.id);
    });

    electron.ipcMain.on("fe-log", (event, logStr: string) => {
        console.log("fe-log", logStr);
    });

    electron.ipcMain.on(
        "increment-term-commands",
        (event, opts?: { isRemote?: boolean; isWsl?: boolean; isDurable?: boolean }) => {
            incrementTermCommandsRun();
            if (opts?.isRemote) {
                incrementTermCommandsRemote();
            }
            if (opts?.isWsl) {
                incrementTermCommandsWsl();
            }
            if (opts?.isDurable) {
                incrementTermCommandsDurable();
            }
        }
    );

    electron.ipcMain.on("native-paste", (event) => {
        event.sender.paste();
    });

    electron.ipcMain.on("open-builder", (event, appId?: string) => {
        openBuilderWindow(appId);
    });

    electron.ipcMain.on("set-builder-window-appid", (event, appId: string) => {
        const bw = getBuilderWindowByWebContentsId(event.sender.id);
        if (bw == null) {
            return;
        }
        bw.builderAppId = appId;
        console.log("set-builder-window-appid", bw.builderId, appId);
    });

    electron.ipcMain.on("open-new-window", () => fireAndForget(createNewWaveWindow));

    electron.ipcMain.on("close-builder-window", async (event) => {
        const bw = getBuilderWindowByWebContentsId(event.sender.id);
        if (bw == null) {
            return;
        }
        const builderId = bw.builderId;
        if (builderId) {
            try {
                await RpcApi.SetRTInfoCommand(ElectronWshClient, {
                    oref: `builder:${builderId}`,
                    data: {} as ObjRTInfo,
                    delete: true,
                });
            } catch (e) {
                console.error("Error deleting builder rtinfo:", e);
            }
        }
        const wc = bw.webContents;
        if (wc.isDevToolsOpened()) {
            wc.closeDevTools();
        }
        for (const guest of electron.webContents.getAllWebContents()) {
            if (guest.getType() === "webview" && guest.hostWebContents?.id === wc.id) {
                if (guest.isDevToolsOpened()) {
                    guest.closeDevTools();
                }
            }
        }
        bw.destroy();
    });

    electron.ipcMain.on("do-refresh", (event) => {
        event.sender.reloadIgnoringCache();
    });

    electron.ipcMain.handle("recoder:select-directory", async (event) => {
        const ww = electron.BrowserWindow.fromWebContents(event.sender);
        if (ww == null) {
            return null;
        }
        const result = await electron.dialog.showOpenDialog(ww, {
            title: "Choose a repository folder",
            defaultPath: electron.app.getPath("home"),
            properties: ["openDirectory", "createDirectory"],
        });
        if (result.canceled || result.filePaths.length == 0) {
            return null;
        }
        return result.filePaths[0];
    });

    electron.ipcMain.handle("recoder:is-git-repo", async (_event, dirPath: string) => {
        if (dirPath == null || dirPath == "") {
            return true;
        }
        return await new Promise<boolean>((resolve) => {
            child_process.execFile(
                "git",
                ["-C", dirPath, "rev-parse", "--is-inside-work-tree"],
                { timeout: 4000 },
                (err, stdout) => {
                    if (err != null) {
                        // Fail OPEN when git itself is absent (ENOENT): we cannot know, so
                        // never warn; a real non-repo returns a non-zero exit (err.code != ENOENT).
                        resolve((err as NodeJS.ErrnoException).code == "ENOENT" ? true : false);
                        return;
                    }
                    resolve(stdout.trim() == "true");
                }
            );
        });
    });

    electron.ipcMain.handle("recoder:git-init", async (_event, dirPath: string) => {
        if (dirPath == null || dirPath == "") {
            return false;
        }
        return await new Promise<boolean>((resolve) => {
            child_process.execFile("git", ["-C", dirPath, "init"], { timeout: 8000 }, (err) => {
                // Truthful: report only whether `git init` itself exited cleanly. The
                // renderer re-runs isGitRepo() afterwards and gates launch on THAT, so a
                // false success here can never enable a launch into a non-repo.
                resolve(err == null);
            });
        });
    });

    // Best-effort, POSITIVE-ONLY per-agent auth probe. Returns "authenticated" ONLY
    // when the CLI's own on-disk login credential is present; otherwise "unknown".
    // Never returns a fabricated "not signed in": a CLI that keeps its login in the
    // OS keychain (e.g. Claude Code on macOS) legitimately reports "unknown" here,
    // and the UI degrades to "detected" — never a false "ready", never a hard block.
    electron.ipcMain.handle("recoder:probe-agent-auth", async (_event, runtimeId: string) => {
        const rels = AGENT_CREDENTIAL_FILES[runtimeId];
        if (rels == null) {
            return "unknown";
        }
        let home = "";
        try {
            home = electron.app.getPath("home");
        } catch {
            return "unknown";
        }
        for (const rel of rels) {
            try {
                const st = fs.statSync(path.join(home, rel));
                if (st.isFile() && st.size > 0) {
                    return "authenticated";
                }
            } catch {
                // absent / unreadable — inconclusive, keep probing the next candidate
            }
        }
        return "unknown";
    });

    electron.ipcMain.on("recoder:attention-notify", (event, workspaceId: string, title: string, body: string) => {
        if (typeof workspaceId != "string" || workspaceId == "" || typeof title != "string" || title == "") {
            return;
        }
        showAttentionNotification(event.sender, workspaceId, title, typeof body == "string" ? body : "");
    });

    electron.app.on("browser-window-focus", clearAttentionBadge);

    electron.ipcMain.handle("save-text-file", async (event, fileName: string, content: string) => {
        const ww = electron.BrowserWindow.fromWebContents(event.sender);
        if (ww == null) {
            return false;
        }
        const result = await electron.dialog.showSaveDialog(ww, {
            title: "Save Scrollback",
            defaultPath: fileName || "session.log",
            filters: [{ name: "Text Files", extensions: ["txt", "log"] }],
        });
        if (result.canceled || !result.filePath) {
            return false;
        }
        try {
            await fs.promises.writeFile(result.filePath, content, "utf-8");
            console.log("saved scrollback to", result.filePath);
            return true;
        } catch (err) {
            console.error("error saving scrollback file", err);
            return false;
        }
    });
}
