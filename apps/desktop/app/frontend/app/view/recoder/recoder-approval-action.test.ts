// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./recoder-endpoints", () => ({
    getRecoderBackendUrl: () => "http://127.0.0.1:3100",
}));
vi.mock("./recoder-errors", () => ({
    readFetchError: async (res: Response) => `err:${res.status}`,
}));

import { approvalDecideUrl, approvalDecisionPayload, decideApproval } from "./recoder-approval-action";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("approval decision contract (pure)", () => {
    it("builds the decide URL, encoding the approval id", () => {
        expect(approvalDecideUrl("http://h", "appr-1")).toBe("http://h/api/agent-os/approvals/appr-1/decide");
        expect(approvalDecideUrl("http://h", "a/b")).toBe("http://h/api/agent-os/approvals/a%2Fb/decide");
    });

    it("maps approve→approved and reject→denied", () => {
        expect(approvalDecisionPayload("approve")).toEqual({ decision: "approved" });
        expect(approvalDecisionPayload("reject")).toEqual({ decision: "denied" });
    });
});

describe("decideApproval (transport)", () => {
    it("POSTs the decide endpoint with the right method + body and reports ok", async () => {
        const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);

        const result = await decideApproval("appr-1", "approve");
        expect(result).toEqual({ ok: true });
        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("http://127.0.0.1:3100/api/agent-os/approvals/appr-1/decide");
        expect(init.method).toBe("POST");
        expect(JSON.parse(init.body as string)).toEqual({ decision: "approved" });
    });

    it("returns a truthful error on a non-ok response (never fakes success)", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
        const result = await decideApproval("appr-1", "reject");
        expect(result).toEqual({ ok: false, error: "err:403" });
    });

    it("returns a truthful error when fetch throws", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => {
            throw new Error("network down");
        }));
        const result = await decideApproval("appr-1", "approve");
        expect(result).toEqual({ ok: false, error: "network down" });
    });

    it("refuses an empty approval id without calling the network", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const result = await decideApproval("", "approve");
        expect(result).toEqual({ ok: false, error: "missing approval id" });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
