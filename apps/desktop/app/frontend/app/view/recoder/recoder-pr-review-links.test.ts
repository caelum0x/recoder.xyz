import { describe, expect, it } from "vitest";
import { githubFindingSourceUrl } from "./recoder-pr-review-links";

describe("githubFindingSourceUrl", () => {
    it("binds a finding to the reviewed head and exact line", () => {
        expect(githubFindingSourceUrl({
            prUrl: "https://github.com/acme/repo/pull/17/files?ignored=1",
            headSha: "abcdef1234567890",
            file: "src/billing/payment flow.ts",
            line: 180,
        })).toBe("https://github.com/acme/repo/blob/abcdef1234567890/src/billing/payment%20flow.ts#L180");
    });

    it("preserves a GitHub Enterprise base path", () => {
        expect(githubFindingSourceUrl({
            prUrl: "https://git.example.test/github/acme/repo/pull/17",
            headSha: "abcdef1234567890",
            file: "src/pay.ts",
            line: 42,
        })).toBe("https://git.example.test/github/acme/repo/blob/abcdef1234567890/src/pay.ts#L42");
    });

    it("refuses non-PR, traversal, and non-revision targets", () => {
        expect(githubFindingSourceUrl({ prUrl: "https://example.test/acme/repo", headSha: "abcdef1", file: "a.ts", line: 1 })).toBeNull();
        expect(githubFindingSourceUrl({ prUrl: "https://github.com/acme/repo/pull/1", headSha: "abcdef1", file: "../a.ts", line: 1 })).toBeNull();
        expect(githubFindingSourceUrl({ prUrl: "https://github.com/acme/repo/pull/1", headSha: "branch-name", file: "a.ts", line: 1 })).toBeNull();
    });
});
