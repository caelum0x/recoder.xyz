import type { $ZodIssue } from "@zod/core";
import { describe, expect, it } from "vitest";
import { unifyGitHubVectorStore } from "./unify-github-vector-store";

describe("unifyGitHubVectorStore", () => {
	it("should convert githubPullRequest provider to github with contentType pull_request", () => {
		const data = {
			content: {
				type: "vectorStore",
				source: {
					provider: "githubPullRequest",
					state: {
						status: "configured",
						owner: "example",
						repo: "repo",
					},
				},
			},
		};

		const issue = {
			code: "invalid_value",
			path: ["content", "source", "provider"],
		} as $ZodIssue;

		const result = unifyGitHubVectorStore(data, issue);

		expect(result).toEqual({
			content: {
				type: "vectorStore",
				source: {
					provider: "github",
					state: {
						status: "configured",
						owner: "example",
						repo: "repo",
						contentType: "pull_request",
					},
				},
			},
		});
	});

	it("should not modify unconfigured nodes", () => {
		const data = {
			content: {
				type: "vectorStore",
				source: {
					provider: "githubPullRequest",
					state: {
						status: "unconfigured",
					},
				},
			},
		};

		const issue = {
			code: "invalid_value",
			path: ["content", "source", "provider"],
		} as $ZodIssue;

		const result = unifyGitHubVectorStore(data, issue);

		expect(result).toEqual({
			content: {
				type: "vectorStore",
				source: {
					provider: "github",
					state: {
						status: "unconfigured",
					},
				},
			},
		});
	});

	it("should return data unchanged for non-matching issues", () => {
		const data = { someOtherData: "value" };
		const issue = {
			code: "invalid_type",
			expected: "string",
			path: ["someOtherData"],
			message: "Invalid type",
		} as $ZodIssue;

		const result = unifyGitHubVectorStore(data, issue);

		expect(result).toBe(data);
	});

	it("should handle invalid enum value for contentType", () => {
		const data = {
			content: {
				type: "vectorStore",
				source: {
					provider: "github",
					state: {
						status: "configured",
						owner: "example",
						repo: "repo",
						contentType: "invalid-value", // Invalid enum value
					},
				},
			},
		};

		const issue = {
			code: "invalid_value",
			path: ["content", "source", "state", "contentType"],
		} as $ZodIssue;

		const result = unifyGitHubVectorStore(data, issue);

		expect(result).toEqual({
			content: {
				type: "vectorStore",
				source: {
					provider: "github",
					state: {
						status: "configured",
						owner: "example",
						repo: "repo",
						contentType: "blob",
					},
				},
			},
		});
	});

	it("should skip valid contentType values", () => {
		const data = {
			content: {
				type: "vectorStore",
				source: {
					provider: "github",
					state: {
						status: "configured",
						owner: "example",
						repo: "repo",
						contentType: "pull_request", // Valid value
					},
				},
			},
		};

		const issue = {
			code: "invalid_value",
			path: ["content", "source", "state", "contentType"],
		} as $ZodIssue;

		const result = unifyGitHubVectorStore(data, issue);

		// Should remain unchanged
		expect(result).toBe(data);
	});
});
