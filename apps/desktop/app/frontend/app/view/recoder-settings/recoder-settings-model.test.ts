// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/store/global", async () => {
    const { createStore } = await import("jotai");
    return { globalStore: createStore() };
});

vi.mock("./recoder-settings", () => ({
    RecoderSettingsView: () => null,
}));

vi.mock("@/app/store/wshrpcutil", () => ({
    TabRpcClient: {},
}));

vi.mock("@/app/store/wshclientapi", () => ({
    RpcApi: {
        GetSecretsNamesCommand: vi.fn(),
        SetSecretsCommand: vi.fn(),
    },
}));

import { globalStore } from "@/app/store/global";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { ProviderKeyNames, RecoderSettingsViewModel } from "./recoder-settings-model";

const getNamesMock = RpcApi.GetSecretsNamesCommand as ReturnType<typeof vi.fn>;
const setSecretsMock = RpcApi.SetSecretsCommand as ReturnType<typeof vi.fn>;

function makeModel(): RecoderSettingsViewModel {
    return new RecoderSettingsViewModel({ blockId: "b1" } as ViewModelInitType);
}

beforeEach(() => {
    getNamesMock.mockReset().mockResolvedValue([]);
    setSecretsMock.mockReset().mockResolvedValue(undefined);
});

describe("provider key rows", () => {
    it("exposes exactly the four gateway provider rows", () => {
        expect(ProviderKeyNames).toEqual([
            "ANTHROPIC_API_KEY",
            "OPENAI_API_KEY",
            "OPENROUTER_API_KEY",
            "GOOGLE_API_KEY",
        ]);
    });
});

describe("refreshProviderKeys", () => {
    it("marks only the row names present in the secret store (unrelated names ignored)", async () => {
        getNamesMock.mockResolvedValue(["ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "MY_BANK_PASSWORD"]);
        const model = makeModel();
        await model.refreshProviderKeys();
        expect(getNamesMock).toHaveBeenCalledWith(TabRpcClient);
        expect(globalStore.get(model.providerKeysSetAtom)).toEqual({
            ANTHROPIC_API_KEY: true,
            OPENAI_API_KEY: false,
            OPENROUTER_API_KEY: false,
            GOOGLE_API_KEY: true,
        });
        expect(globalStore.get(model.providerKeyErrorAtom)).toBe("");
    });

    it("surfaces a truthful error when the secret store is unreadable", async () => {
        getNamesMock.mockRejectedValue(new Error("no route"));
        const model = makeModel();
        await model.refreshProviderKeys();
        expect(globalStore.get(model.providerKeyErrorAtom)).toContain("no route");
    });
});

describe("saveProviderKey", () => {
    it("writes the trimmed draft via SetSecretsCommand, clears the draft, and refreshes", async () => {
        const model = makeModel();
        model.setProviderKeyDraft("ANTHROPIC_API_KEY", "  sk-ant-real  ");
        getNamesMock.mockResolvedValue(["ANTHROPIC_API_KEY"]);

        await model.saveProviderKey("ANTHROPIC_API_KEY");

        expect(setSecretsMock).toHaveBeenCalledWith(TabRpcClient, { ANTHROPIC_API_KEY: "sk-ant-real" });
        expect(globalStore.get(model.providerKeyDraftsAtom).ANTHROPIC_API_KEY).toBe("");
        expect(globalStore.get(model.providerKeysSetAtom).ANTHROPIC_API_KEY).toBe(true);
    });

    it("does not call the store for an empty draft", async () => {
        const model = makeModel();
        model.setProviderKeyDraft("OPENAI_API_KEY", "   ");
        await model.saveProviderKey("OPENAI_API_KEY");
        expect(setSecretsMock).not.toHaveBeenCalled();
        expect(getNamesMock).not.toHaveBeenCalled();
    });

    it("keeps the draft and reports the error when the write fails", async () => {
        setSecretsMock.mockRejectedValue(new Error("store locked"));
        const model = makeModel();
        model.setProviderKeyDraft("OPENROUTER_API_KEY", "sk-or-x");

        await model.saveProviderKey("OPENROUTER_API_KEY");

        expect(globalStore.get(model.providerKeyErrorAtom)).toContain("OPENROUTER_API_KEY");
        expect(globalStore.get(model.providerKeyErrorAtom)).toContain("store locked");
        expect(globalStore.get(model.providerKeyDraftsAtom).OPENROUTER_API_KEY).toBe("sk-or-x");
    });
});

describe("clearProviderKey", () => {
    it("deletes via a null value (the SetSecretsCommand delete contract) and refreshes", async () => {
        const model = makeModel();
        await model.clearProviderKey("GOOGLE_API_KEY");
        expect(setSecretsMock).toHaveBeenCalledWith(TabRpcClient, { GOOGLE_API_KEY: null });
        expect(getNamesMock).toHaveBeenCalledWith(TabRpcClient);
        expect(globalStore.get(model.providerKeysSetAtom).GOOGLE_API_KEY).toBe(false);
    });

    it("reports the error when the delete fails", async () => {
        setSecretsMock.mockRejectedValue(new Error("store locked"));
        const model = makeModel();
        await model.clearProviderKey("GOOGLE_API_KEY");
        expect(globalStore.get(model.providerKeyErrorAtom)).toContain("GOOGLE_API_KEY");
    });
});
