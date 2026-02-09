import { graphql } from "./client";
import { graphql as gql } from "./graphql";
import type { GitHubAuthConfig } from "./types";

const DiscussionQuery = gql(/* GraphQL */ `
    query DiscussionQuery($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) {
            discussion(number: $number) {
                id
                number
                title
                comments(first: 100) {
                    totalCount
                    nodes {
                        body
                        author {
                            avatarUrl
                            login
                        }
                        replies(first: 100) {
                            nodes {
                                body
                                author {
                                    avatarUrl
                                    login
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`);

export async function getDiscussion({
	owner,
	name,
	number,
	authConfig,
}: {
	owner: string;
	name: string;
	number: number;
	authConfig: GitHubAuthConfig;
}) {
	const client = await graphql(authConfig);

	return await client.query(DiscussionQuery, { owner, name, number });
}

const GetDiscussionForCommentCreation = gql(/* GraphQL */ `
    query GetDiscussionForCommentCreation($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) {
            discussion(number: $number) {
                id
                comments(first: 100) {
                    nodes {
                        id
                        databaseId
                        replies(first: 100) {
                            nodes {
                                id
                                databaseId
                            }
                        }
                    }
                }
            }
        }
    }
`);

export async function getDiscussionForCommentCreation({
	owner,
	name,
	number,
	authConfig,
}: {
	owner: string;
	name: string;
	number: number;
	authConfig: GitHubAuthConfig;
}) {
	const client = await graphql(authConfig);
	return await client.query(GetDiscussionForCommentCreation, {
		owner,
		name,
		number,
	});
}

type DiscussionCommentNodes = NonNullable<
	NonNullable<
		NonNullable<
			NonNullable<
				NonNullable<
					Awaited<ReturnType<typeof getDiscussionForCommentCreation>>["data"]
				>["repository"]
			>["discussion"]
		>["comments"]
	>["nodes"]
>;

export function findDiscussionReplyTargetId({
	comments,
	targetDatabaseId,
}: {
	comments: DiscussionCommentNodes;
	targetDatabaseId: number;
}): string | undefined {
	for (const comment of comments) {
		if (!comment) continue;
		if (comment.databaseId === targetDatabaseId && comment.id) {
			return comment.id;
		}
	}

	for (const comment of comments) {
		if (!comment || !comment.id) continue;
		const replyNodes = comment.replies?.nodes ?? [];
		if (replyNodes.length === 0) continue;
		for (const reply of replyNodes) {
			if (reply?.databaseId === targetDatabaseId) {
				return comment.id;
			}
		}
	}

	return undefined;
}

const AddDiscussionCommentMutation = gql(/* GraphQL */ `
    mutation AddDiscussionComment($discussionId: ID!, $body: String!, $replyToId: ID) {
        addDiscussionComment(input: {
            discussionId: $discussionId
            body: $body
            replyToId: $replyToId
        }) {
            comment {
                id
                databaseId
                url
                body
                author {
                    login
                    avatarUrl
                }
                createdAt
            }
        }
    }
`);

export async function createDiscussionComment({
	discussionId,
	body,
	replyToId,
	authConfig,
}: {
	discussionId: string;
	body: string;
	replyToId?: string;
	authConfig: GitHubAuthConfig;
}) {
	const client = await graphql(authConfig);

	const result = await client.mutation(AddDiscussionCommentMutation, {
		discussionId,
		body,
		replyToId,
	});

	return result.data?.addDiscussionComment?.comment;
}

const UpdateDiscussionCommentMutation = gql(/* GraphQL */ `
    mutation UpdateDiscussionComment($commentId: ID!, $body: String!) {
        updateDiscussionComment(input: {
            commentId: $commentId
            body: $body
        }) {
            comment {
                id
                databaseId
                body
            }
        }
    }
`);

export async function updateDiscussionComment({
	commentId,
	body,
	authConfig,
}: {
	commentId: string;
	body: string;
	authConfig: GitHubAuthConfig;
}) {
	const client = await graphql(authConfig);
	const result = await client.mutation(UpdateDiscussionCommentMutation, {
		commentId,
		body,
	});
	return result.data?.updateDiscussionComment?.comment;
}

const GetDiscussionCommentQuery = gql(/* GraphQL */ `
    query GetDiscussionComment($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) {
            discussion(number: $number) {
                comments(first: 100) {
                    nodes {
                        body
                        databaseId
                    }
                }
            }
        }
    }
`);

export async function getDiscussionComment({
	owner,
	name,
	discussionNumber,
	databaseId,
	authConfig,
}: {
	owner: string;
	name: string;
	discussionNumber: number;
	databaseId: number;
	authConfig: GitHubAuthConfig;
}) {
	const client = await graphql(authConfig);
	const result = await client.query(GetDiscussionCommentQuery, {
		owner,
		name,
		number: discussionNumber,
	});

	const comments = result.data?.repository?.discussion?.comments?.nodes ?? [];
	return comments.find((c) => c && c.databaseId === databaseId);
}
