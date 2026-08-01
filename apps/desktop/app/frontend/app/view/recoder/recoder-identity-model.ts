// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { getApi, globalStore } from "@/app/store/global";
import { atom, type PrimitiveAtom } from "jotai";
import { applyInjectedBackendUrl } from "./recoder-endpoints";

// Optional, offline-safe sign-in state for the Wave Workspaces hub. Drives the
// existing main-process device-flow manager (recoder.xyz Google/GitHub) through
// the preload bridge — this holds NO tokens, only the display identity the main
// process hands back. Signed-out is a valid resting state; local agents run
// without an account.
class RecoderIdentityModel {
    private static instance: RecoderIdentityModel = null;

    identityAtom = atom<RecoderIdentity>(null) as PrimitiveAtom<RecoderIdentity>;
    signingInAtom = atom(false);
    signInErrorAtom = atom("");
    promptAtom = atom<RecoderSignInPrompt>(null) as PrimitiveAtom<RecoderSignInPrompt>;

    private constructor() {
        try {
            getApi().onRecoderSignInPrompt((prompt) => {
                globalStore.set(this.promptAtom, prompt);
            });
        } catch {
            // No bridge (preview/test) — sign-in simply stays unavailable.
        }
        // DT-7.1: adopt the embedded backend's REAL loopback URL from the main
        // process — read it now (backend may already be READY) and subscribe for
        // the case where it readies after this window loaded. Degrade-safe: no
        // bridge (preview/test) or a not-ready backend leaves the default in place.
        try {
            applyInjectedBackendUrl(getApi().getRecoderBackendUrl?.());
            getApi().onRecoderBackendUrl?.((url) => {
                applyInjectedBackendUrl(url);
            });
        } catch {
            // No bridge (preview/test) — keep the default/localStorage resolution.
        }
    }

    static getInstance(): RecoderIdentityModel {
        if (!RecoderIdentityModel.instance) {
            RecoderIdentityModel.instance = new RecoderIdentityModel();
        }
        return RecoderIdentityModel.instance;
    }

    async refresh() {
        try {
            const identity = await getApi().getRecoderIdentity();
            globalStore.set(this.identityAtom, identity ?? null);
        } catch {
            // Degrade-safe: an identity-probe failure reads as signed out.
        }
    }

    async signIn() {
        if (globalStore.get(this.signingInAtom)) {
            return;
        }
        globalStore.set(this.signingInAtom, true);
        globalStore.set(this.signInErrorAtom, "");
        try {
            const result = await getApi().recoderSignIn();
            if (result?.ok) {
                globalStore.set(this.identityAtom, result.identity ?? null);
            } else if (result?.reason) {
                globalStore.set(this.signInErrorAtom, result.reason);
            }
        } catch (e) {
            globalStore.set(this.signInErrorAtom, e instanceof Error ? e.message : String(e));
        } finally {
            globalStore.set(this.signingInAtom, false);
            globalStore.set(this.promptAtom, null);
        }
    }

    async signOut() {
        try {
            await getApi().recoderSignOut();
        } catch {
            // Best-effort: always leave the hub signed out locally.
        }
        globalStore.set(this.identityAtom, null);
    }
}

export { RecoderIdentityModel };
