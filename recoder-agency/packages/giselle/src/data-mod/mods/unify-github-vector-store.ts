import type { $ZodIssue } from "@zod/core";
import { getValueAtPath, isObject, setValueAtPath } from "../utils";

export function unifyGitHubVectorStore(data: unknown, issue: $ZodIssue) {
	if (!isObject(data)) {
		return data;
	}

	// Handle invalid enum value for contentType
	if (
		issue.code === "invalid_value" &&
		issue.path[issue.path.length - 1] === "contentType"
	) {
		const currentValue = getValueAtPath(data, issue.path);

		// If it's already a valid value
		if (currentValue === "blob" || currentValue === "pull_request") {
			return data;
		}

		// biome-ignore lint/suspicious/noExplicitAny: Using any for generic deep copying
		const newData = structuredClone(data as Record<string, any>);
		const contentTypePath = issue.path;

		// For any invalid value (including undefined), default to blob
		setValueAtPath(newData, contentTypePath, "blob");
		return newData;
	}

	// Handle githubPullRequest -> github conversion
	if (
		issue.code === "invalid_value" &&
		issue.path[issue.path.length - 1] === "provider"
	) {
		// biome-ignore lint/suspicious/noExplicitAny: Using any for generic deep copying
		const newData = structuredClone(data as Record<string, any>);

		const providerPath = issue.path;
		const provider = getValueAtPath(data, providerPath);
		if (provider !== "githubPullRequest") {
			return data;
		}

		// Get the parent path (should be the source object)
		const sourcePath = providerPath.slice(0, -1);
		const source = getValueAtPath(data, sourcePath);

		if (source && typeof source === "object" && "state" in source) {
			setValueAtPath(newData, providerPath, "github");

			// If configured, add contentType: "pull_request"
			if (
				source.state &&
				typeof source.state === "object" &&
				"status" in source.state &&
				source.state.status === "configured"
			) {
				setValueAtPath(
					newData,
					[...sourcePath, "state", "contentType"],
					"pull_request",
				);
			}
		}

		return newData;
	}

	return data;
}
