// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { globalStore } from "@/app/store/global";
import { atom, type Atom, type PrimitiveAtom } from "jotai";
import { getRecoderBackendUrl, setRecoderBackendUrl } from "../recoder/recoder-endpoints";
import { RecoderSettingsView } from "./recoder-settings";

// Connection-test state: idle / in-flight / reachable / unreachable.
type TestStatus = "" | "testing" | "ok" | "fail";

class RecoderSettingsViewModel implements ViewModel {
    viewType: string;
    viewIcon: Atom<string>;
    viewName: Atom<string>;
    blockId: string;
    urlAtom: PrimitiveAtom<string>;
    savedUrlAtom: PrimitiveAtom<string>;
    testStatusAtom: PrimitiveAtom<TestStatus>;
    testMessageAtom: PrimitiveAtom<string>;

    constructor(initOpts: ViewModelInitType) {
        this.blockId = initOpts.blockId;
        this.viewType = "recoder-settings";
        this.viewIcon = atom("gear");
        this.viewName = atom("Settings");
        this.urlAtom = atom(getRecoderBackendUrl()) as PrimitiveAtom<string>;
        this.savedUrlAtom = atom(getRecoderBackendUrl()) as PrimitiveAtom<string>;
        this.testStatusAtom = atom("") as PrimitiveAtom<TestStatus>;
        this.testMessageAtom = atom("") as PrimitiveAtom<string>;
    }

    get viewComponent(): ViewComponent {
        return RecoderSettingsView;
    }

    // Persist the override (empty reverts to default) and reflect the now-effective url.
    save(url: string) {
        setRecoderBackendUrl(url);
        const effective = getRecoderBackendUrl();
        globalStore.set(this.savedUrlAtom, effective);
        globalStore.set(this.urlAtom, effective);
        globalStore.set(this.testStatusAtom, "");
        globalStore.set(this.testMessageAtom, "");
    }

    resetDefault() {
        this.save("");
    }

    // Probe the backend's /api/conductor/health so a user can verify a URL before
    // relying on it. Degrade-safe: any failure lands on the truthful "fail" state.
    async test(url: string) {
        const target = (url.trim() || getRecoderBackendUrl()).replace(/\/+$/, "");
        globalStore.set(this.testStatusAtom, "testing");
        globalStore.set(this.testMessageAtom, "");
        try {
            const res = await fetch(`${target}/api/conductor/health`);
            if (res.ok) {
                globalStore.set(this.testStatusAtom, "ok");
                globalStore.set(this.testMessageAtom, `Reachable (HTTP ${res.status})`);
                return;
            }
            globalStore.set(this.testStatusAtom, "fail");
            globalStore.set(this.testMessageAtom, `Backend returned HTTP ${res.status}`);
        } catch {
            globalStore.set(this.testStatusAtom, "fail");
            globalStore.set(this.testMessageAtom, "Not reachable");
        }
    }
}

export { RecoderSettingsViewModel };
