// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

const DefaultRecoderBackend = "http://127.0.0.1:3100";

function getRecoderBackendUrl(): string {
    const w = globalThis as any;
    const fromWindow = w?.__RECODER_BACKEND_URL__;
    if (fromWindow) {
        return String(fromWindow).replace(/\/+$/, "");
    }
    return DefaultRecoderBackend;
}

export { getRecoderBackendUrl };
