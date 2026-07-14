// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * emain-backend.ts — electron glue around the embedded Node backend supervisor
 * (emain-backend-core.ts). Boot contract:
 *
 *   1. appMain() calls planBackendPort() FIRST (fast — no health wait) so the
 *      Go server can be spawned with WAVETERM_WAVEAI_ENDPOINT + tmux env.
 *   2. After the Go server is up, startBackendSupervisor() runs NON-BLOCKING:
 *      the wave UI never waits on the Node backend.
 *   3. Once the backend is truthfully READY, the onReady hook writes the
 *      config-dir override files (waveai.json + settings.json merge) so the
 *      AI panel targets the embedded gateway; the wconfig filewatcher picks
 *      them up live even though the Go server is already running.
 *   4. Node-backend death DEGRADES (supervisor restarts with backoff, then
 *      reports FAILED) — it never quits the app. The quit-on-death policy
 *      belongs to the Go server only (emain-wavesrv.ts).
 */

import { app } from "electron";
import * as path from "node:path";
import {
    BackendAuth,
    BackendSupervisor,
    gatewayEndpointForPort,
    pickFreePortWithRetry,
    portIsFree,
    resolveTmuxBin,
    SupervisorStatus,
    writeCockpitWidgetConfig,
    writeWaveAIGatewayConfig,
} from "./emain-backend-core";
import { getElectronAppBasePath, getWaveConfigDir } from "./emain-platform";

let supervisor: BackendSupervisor = null;
let plannedPort: number = null;

function getRepoRoot(): string {
    // dev: getElectronAppBasePath() -> <repo>/apps/desktop/app/dist
    return path.resolve(getElectronAppBasePath(), "..", "..", "..", "..");
}

export function resolveTmuxBinForApp(): string {
    return resolveTmuxBin({
        isPackaged: app.isPackaged,
        repoRoot: getRepoRoot(),
        resourcesPath: process.resourcesPath,
    });
}

/**
 * Pick (and memoize) the backend port before anything is spawned. Fast — a
 * loopback bind probe only. Prefers 3100 (or RECODER_BACKEND_PORT) so default
 * backend URLs work with zero re-injection.
 */
export async function planBackendPort(): Promise<number> {
    if (plannedPort != null) {
        return plannedPort;
    }
    const preferred = Number.parseInt(String(process.env.RECODER_BACKEND_PORT || "3100"), 10);
    if (Number.isInteger(preferred) && preferred > 0 && (await portIsFree(preferred))) {
        plannedPort = preferred;
    } else {
        plannedPort = await pickFreePortWithRetry();
    }
    return plannedPort;
}

export function getPlannedBackendPort(): number {
    return plannedPort;
}

/** The embedded gateway chat-completions endpoint for the planned port, or null before planning. */
export function getPlannedGatewayEndpoint(): string {
    if (plannedPort == null) {
        return null;
    }
    return gatewayEndpointForPort(plannedPort);
}

/**
 * Boot the embedded Node backend under supervision. Safe to fire-and-forget;
 * failures degrade truthfully into getBackendStatus() instead of throwing.
 */
export async function startBackendSupervisor(): Promise<void> {
    if (supervisor == null) {
        supervisor = new BackendSupervisor({
            userDataDir: app.getPath("userData"),
            repoRoot: getRepoRoot(),
            isPackaged: app.isPackaged,
            resourcesPath: process.resourcesPath,
            preferredPort: plannedPort ?? undefined,
            log: (level, message, extra) => {
                console.log(`[backend-supervisor:${level}] ${message}`, extra ?? "");
            },
            onReady: ({ port, apiKey }) => {
                plannedPort = port;
                try {
                    const result = writeWaveAIGatewayConfig({ configDir: getWaveConfigDir(), port, apiKey });
                    console.log(
                        `[backend-supervisor] wrote AI gateway config ${result.waveaiPath}` +
                            (result.defaultModeSet ? " (default mode -> waveai@recoder)" : "")
                    );
                } catch (e) {
                    console.log("[backend-supervisor] failed to write AI gateway config", e);
                }
                try {
                    const { widgetsPath } = writeCockpitWidgetConfig({ configDir: getWaveConfigDir(), port });
                    console.log(`[backend-supervisor] wrote cockpit widget config ${widgetsPath} (port ${port})`);
                } catch (e) {
                    console.log("[backend-supervisor] failed to write cockpit widget config", e);
                }
            },
        });
    }
    const result = await supervisor.start();
    if (!result.ok) {
        console.log("[backend-supervisor] embedded backend failed to start:", result.reason);
    }
}

/** { backendUrl, apiKey } once the backend is truthfully READY; null before that. */
export function getBackendAuth(): BackendAuth {
    return supervisor?.getAuth() ?? null;
}

/** Never-lies status snapshot (null until startBackendSupervisor() was called). */
export function getBackendStatus(): SupervisorStatus {
    return supervisor?.getStatus() ?? null;
}

/** Stop the backend child (SIGTERM, then SIGKILL after grace) and prevent restarts. */
export async function stopBackend(): Promise<void> {
    await supervisor?.stop();
}
