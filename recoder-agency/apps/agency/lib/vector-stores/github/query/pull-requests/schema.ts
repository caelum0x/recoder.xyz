import { z } from "zod/v4";

/**
 * Metadata schema for GitHub Pull Request embeddings
 */
export const gitHubPullRequestMetadataSchema = z.object({
	prNumber: z.number(),
	mergedAt: z.date(),
	contentType: z.string(),
	contentId: z.string(),
});

export type GitHubPullRequestMetadata = z.infer<
	typeof gitHubPullRequestMetadataSchema
>;
