import type {
	GitHubIssueDocumentKey,
	GitHubIssueState,
	GitHubIssueStateReason,
	GitHubRepositoryIssueContentType,
} from "@recoder/github-tool";
import type {
	AppId,
	DataStoreId,
	EmbeddingDimensions,
	EmbeddingProfileId,
	NodeId,
	TaskId,
	TriggerId,
	WorkspaceId,
} from "@recoder/protocol";
import type {
	DocumentVectorStoreId,
	DocumentVectorStoreSourceId,
	GitHubRepositoryIndexId,
} from "@recoder/types";
import { createIdGenerator } from "@recoder/utils";
import { relations, sql } from "drizzle-orm";
import {
	boolean,
	foreignKey,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import type * as z from "zod/v4";
import type { ContentStatusMetadata } from "@/lib/vector-stores/github/types";
import type { AgentId } from "@/services/agents/types";
import type { TeamId } from "@/services/teams/types";
import { vectorWithoutDimensions } from "./custom-types";

/**
 * Polar subscription history table
 *
 * Stores snapshots of subscription data from Polar.sh webhooks.
 * Each webhook event creates a new history record.
 */
export const polarSubscriptionHistories = pgTable(
	"polar_subscription_histories",
	{
		dbId: serial("db_id").primaryKey(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),

		subscriptionId: text("subscription_id").notNull(),
		customerId: text("customer_id").notNull(),
		productId: text("product_id").notNull(),
		status: text("status").notNull(),
		currentPeriodEnd: timestamp("current_period_end"),
		metadata: jsonb("metadata"),
	},
	(table) => [
		index("polar_sub_hist_subscription_id_idx").on(table.subscriptionId),
		index("polar_sub_hist_team_db_id_idx").on(table.teamDbId),
		index("polar_sub_hist_customer_id_idx").on(table.customerId),
	],
);

export const polarSubscriptionHistoryRelations = relations(
	polarSubscriptionHistories,
	({ one }) => ({
		team: one(teams, {
			fields: [polarSubscriptionHistories.teamDbId],
			references: [teams.dbId],
		}),
	}),
);

export type TeamPlan = "free" | "pro" | "team" | "enterprise" | "internal";
export const teams = pgTable("teams", {
	id: text("id").$type<TeamId>().notNull().unique(),
	dbId: serial("db_id").primaryKey(),
	name: text("name").notNull(),
	avatarUrl: text("avatar_url"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.notNull()
		.$onUpdate(() => new Date()),
	plan: text("plan").$type<TeamPlan>().notNull().default("free"),
	activeSubscriptionId: text("active_subscription_id").unique(),
	activeCustomerId: text("active_customer_id"),
});

export const teamRelations = relations(teams, ({ many }) => ({
	apps: many(apps),
	tasks: many(tasks),
	dataStores: many(dataStores),
}));

export type UserId = `usr_${string}`;
export const users = pgTable("users", {
	id: text("id").$type<UserId>().notNull().unique(),
	email: text("email").unique(),
	displayName: text("display_name"),
	avatarUrl: text("avatar_url"),
	dbId: serial("db_id").primaryKey(),
	emailVerified: boolean("email_verified").notNull().default(false),
});

export const userRelations = relations(users, ({ many }) => ({
	authSessions: many(authSessions),
	authAccounts: many(authAccounts),
}));

// --- Better Auth tables ---

export const authSessions = pgTable(
	"auth_sessions",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		token: text("token").notNull().unique(),
		expiresAt: timestamp("expires_at").notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("auth_sessions_user_id_idx").on(table.userId),
		index("auth_sessions_token_idx").on(table.token),
	],
);

export const authSessionRelations = relations(authSessions, ({ one }) => ({
	user: one(users, {
		fields: [authSessions.userId],
		references: [users.id],
	}),
}));

export const authAccounts = pgTable(
	"auth_accounts",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		expiresAt: timestamp("expires_at"),
		scope: text("scope"),
		idToken: text("id_token"),
		password: text("password"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		unique("auth_accounts_provider_account_unique").on(
			table.providerId,
			table.accountId,
		),
		index("auth_accounts_user_id_idx").on(table.userId),
	],
);

export const authAccountRelations = relations(authAccounts, ({ one }) => ({
	user: one(users, {
		fields: [authAccounts.userId],
		references: [users.id],
	}),
}));

export const authVerifications = pgTable(
	"auth_verifications",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [index("auth_verifications_identifier_idx").on(table.identifier)],
);

// --- Legacy tables (kept for migration, will be dropped after data migration) ---

/** @deprecated Use authSessions + authAccounts instead. Will be dropped after data migration. */
export const supabaseUserMappings = pgTable("supabase_user_mappings", {
	userDbId: integer("user_db_id")
		.unique()
		.notNull()
		.references(() => users.dbId),
	supabaseUserId: text("supabase_user_id").notNull().unique(),
});

export const supabaseUserRelations = relations(
	supabaseUserMappings,
	({ one }) => ({
		user: one(users, {
			fields: [supabaseUserMappings.userDbId],
			references: [users.dbId],
		}),
	}),
);

export type TeamRole = "admin" | "member" | "ops" | "pm" | "client";
export const teamMemberships = pgTable(
	"team_memberships",
	{
		id: serial("id").primaryKey(),
		userDbId: integer("user_db_id")
			.notNull()
			.references(() => users.dbId),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		role: text("role").notNull().$type<TeamRole>(),
	},
	(teamMembership) => [
		unique().on(teamMembership.userDbId, teamMembership.teamDbId),
	],
);
export const teamMembershipRelations = relations(
	teamMemberships,
	({ one }) => ({
		team: one(teams, {
			fields: [teamMemberships.teamDbId],
			references: [teams.dbId],
		}),
	}),
);

/** @deprecated Use WorkspaceMetadata instead */
export type AgentMetadata = {
	sample: boolean;
};

/** @deprecated The agents table does not align with the application domain, so we are migrating to the workspaces table. We are keeping it for gradual migration due to the large scope of impact. */
export const agents = pgTable(
	"agents",
	{
		id: text("id").$type<AgentId>().notNull().unique(),
		dbId: serial("db_id").primaryKey(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		name: text("name"),
		// DEPRECATED: Legacy field from old architecture. Kept for backward compat until data cleanup.
		graphUrl: text("graph_url"),
		// NOTE: Should be notNull but existing records may have null. Apply via migration after backfill.
		workspaceId: text("workspace_id").$type<WorkspaceId>(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
		creatorDbId: integer("creator_db_id")
			.notNull()
			.references(() => users.dbId),
		metadata: jsonb("metadata")
			.$type<AgentMetadata>()
			.default({ sample: false })
			.notNull(),
	},
	(table) => [index().on(table.teamDbId)],
);
export const agentsRelations = relations(agents, ({ one }) => ({
	team: one(teams, {
		fields: [agents.teamDbId],
		references: [teams.dbId],
	}),
}));

export type WorkspaceMetadata = {
	sample: boolean;
};

export const workspaces = pgTable("workspaces", {
	id: text("id").$type<WorkspaceId>().notNull().unique(),
	dbId: serial("db_id").primaryKey(),
	name: text("name"),
	teamDbId: integer("team_db_id")
		.notNull()
		.references(() => teams.dbId, { onDelete: "cascade" }),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.notNull()
		.$onUpdate(() => new Date()),
	creatorDbId: integer("creator_db_id")
		.notNull()
		.references(() => users.dbId),
	metadata: jsonb("metadata")
		.$type<WorkspaceMetadata>()
		.default({ sample: false })
		.notNull(),
});

export const workspaceRelations = relations(workspaces, ({ one }) => ({
	creator: one(users, {
		fields: [workspaces.creatorDbId],
		references: [users.dbId],
	}),
	team: one(teams, {
		fields: [workspaces.teamDbId],
		references: [teams.dbId],
	}),
	app: one(apps, {
		fields: [workspaces.dbId],
		references: [apps.workspaceDbId],
	}),
}));

export const oauthCredentials = pgTable(
	"oauth_credentials",
	{
		id: serial("id").primaryKey(),
		userId: integer("user_id")
			.notNull()
			.references(() => users.dbId),
		provider: text("provider").notNull(),
		providerAccountId: text("provider_account_id").notNull(),
		accessToken: text("access_token").notNull(),
		refreshToken: text("refresh_token"),
		expiresAt: timestamp("expires_at"),
		tokenType: text("token_type"),
		scope: text("scope"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(table) => [
		unique().on(table.userId, table.provider, table.providerAccountId),
	],
);

/** @deprecated */
export const githubIntegrationSettings = pgTable(
	"github_integration_settings",
	{
		id: text("id").notNull().unique(),
		agentDbId: integer("agent_db_id")
			.notNull()
			.references(() => agents.dbId),
		dbId: serial("db_id").primaryKey(),
		repositoryFullName: text("repository_full_name").notNull(),
		callSign: text("call_sign").notNull(),
		event: text("event").notNull(),
		flowId: text("flow_id").notNull(),
		eventNodeMappings: jsonb("event_node_mappings").notNull(),
		nextAction: text("next_action").notNull(),
	},
);

export const agentActivities = pgTable(
	"agent_activities",
	{
		dbId: serial("db_id").primaryKey(),
		agentDbId: integer("agent_db_id")
			.notNull()
			.references(() => agents.dbId, { onDelete: "cascade" }),
		startedAt: timestamp("started_at").notNull(),
		endedAt: timestamp("ended_at").notNull(),
		totalDurationMs: numeric("total_duration_ms").notNull(),
		usageReportDbId: integer("usage_report_db_id").references(
			() => agentTimeUsageReports.dbId,
		),
	},
	(table) => [index().on(table.agentDbId), index().on(table.endedAt)],
);

export const agentTimeUsageReports = pgTable(
	"agent_time_usage_reports",
	{
		dbId: serial("db_id").primaryKey(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		accumulatedDurationMs: numeric("accumulated_duration_ms").notNull(),
		minutesIncrement: integer("minutes_increment").notNull(),
		meterEventId: text("meter_event_id").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index().on(table.teamDbId),
		index().on(table.createdAt),
		index().on(table.meterEventId),
	],
);

export const userSeatUsageReports = pgTable(
	"user_seat_usage_reports",
	{
		dbId: serial("db_id").primaryKey(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		// Keep snapshot for audit purposes
		userDbIdList: integer("user_db_id_list").array().notNull(),
		meterEventId: text("meter_event_id").notNull(),
		value: integer("value").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index().on(table.teamDbId),
		index().on(table.createdAt),
		index().on(table.meterEventId),
	],
);

export const agentTimeRestrictions = pgTable(
	"agent_time_restrictions",
	{
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" })
			.primaryKey(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [index().on(table.teamDbId)],
);

export const invitations = pgTable(
	"invitations",
	{
		token: text("token").notNull().unique(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		email: text("email").notNull(),
		role: text("role").notNull().$type<TeamRole>(),
		inviterUserDbId: integer("inviter_user_db_id")
			.notNull()
			.references(() => users.dbId, { onDelete: "cascade" }),
		expiredAt: timestamp("expired_at").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		revokedAt: timestamp("revoked_at"),
	},
	(table) => [index().on(table.teamDbId, table.revokedAt)],
);

export type GitHubRepositoryIndexStatus =
	| "idle"
	| "running"
	| "completed"
	| "failed";
export const githubRepositoryIndex = pgTable(
	"github_repository_index",
	{
		id: text("id").$type<GitHubRepositoryIndexId>().notNull().unique(),
		dbId: serial("db_id").primaryKey(),
		owner: text("owner").notNull(),
		repo: text("repo").notNull(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		installationId: integer("installation_id").notNull(),
		/** @deprecated Use githubRepositoryContentStatus table instead */
		lastIngestedCommitSha: text("last_ingested_commit_sha"),
		/** @deprecated Use githubRepositoryContentStatus table instead */
		status: text("status")
			.notNull()
			.$type<GitHubRepositoryIndexStatus>()
			.default("idle"),
		/** @deprecated Use githubRepositoryContentStatus table instead */
		errorCode: text("error_code"),
		/** @deprecated Use githubRepositoryContentStatus table instead */
		retryAfter: timestamp("retry_after"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		unique().on(table.owner, table.repo, table.teamDbId),
		index().on(table.teamDbId),
		index().on(table.status),
	],
);

export const githubRepositoryEmbeddingProfiles = pgTable(
	"github_repository_embedding_profiles",
	{
		repositoryIndexDbId: integer("repository_index_db_id").notNull(),
		embeddingProfileId: integer("embedding_profile_id")
			.$type<EmbeddingProfileId>()
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.repositoryIndexDbId, table.embeddingProfileId],
			name: "gh_repo_emb_profiles_pk",
		}),
		foreignKey({
			columns: [table.repositoryIndexDbId],
			foreignColumns: [githubRepositoryIndex.dbId],
			name: "gh_repo_emb_profiles_repo_idx_fk",
		}).onDelete("cascade"),
	],
);

export const documentVectorStores = pgTable(
	"document_vector_stores",
	{
		id: text("id").$type<DocumentVectorStoreId>().notNull(),
		dbId: serial("db_id").primaryKey(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		name: text("name").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("doc_vs_team_db_id_idx").on(table.teamDbId),
		unique("doc_vs_id_unique").on(table.id),
	],
);

export type DocumentVectorStoreSourceUploadStatus =
	| "uploading"
	| "uploaded"
	| "failed";

export type DocumentVectorStoreSourceIngestStatus =
	| "idle"
	| "running"
	| "completed"
	| "failed";

export const documentVectorStoreSources = pgTable(
	"document_vector_store_sources",
	{
		id: text("id").$type<DocumentVectorStoreSourceId>().notNull(),
		dbId: serial("db_id").primaryKey(),
		documentVectorStoreDbId: integer("document_vector_store_db_id")
			.notNull()
			.references(() => documentVectorStores.dbId, { onDelete: "cascade" }),
		storageBucket: text("storage_bucket").notNull(),
		storageKey: text("storage_key").notNull(),
		fileName: text("file_name").notNull(),
		fileSizeBytes: integer("file_size_bytes").notNull(),
		fileChecksum: text("file_checksum"),
		uploadStatus: text("upload_status")
			.notNull()
			.$type<DocumentVectorStoreSourceUploadStatus>()
			.default("uploading"),
		uploadErrorCode: text("upload_error_code"),
		ingestStatus: text("ingest_status")
			.notNull()
			.$type<DocumentVectorStoreSourceIngestStatus>()
			.default("idle"),
		ingestErrorCode: text("ingest_error_code"),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
		ingestedAt: timestamp("ingested_at"),
	},
	(table) => [
		unique("doc_vs_src_id_unique").on(table.id),
		unique("doc_vs_src_storage_unique").on(
			table.documentVectorStoreDbId,
			table.storageKey,
		),
		index("doc_vs_src_upload_status_idx").on(table.uploadStatus),
		index("doc_vs_src_ingest_status_idx").on(table.ingestStatus),
	],
);

export const documentVectorStoreSourcesRelations = relations(
	documentVectorStoreSources,
	({ one }) => ({
		documentVectorStore: one(documentVectorStores, {
			fields: [documentVectorStoreSources.documentVectorStoreDbId],
			references: [documentVectorStores.dbId],
		}),
	}),
);

export const documentEmbeddingProfiles = pgTable(
	"document_embedding_profiles",
	{
		documentVectorStoreDbId: integer("document_vector_store_db_id").notNull(),
		embeddingProfileId: integer("embedding_profile_id")
			.$type<EmbeddingProfileId>()
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.documentVectorStoreDbId, table.embeddingProfileId],
			name: "doc_vs_emb_profiles_pk",
		}),
		foreignKey({
			columns: [table.documentVectorStoreDbId],
			foreignColumns: [documentVectorStores.dbId],
			name: "doc_vs_emb_profiles_store_fk",
		}).onDelete("cascade"),
	],
);

export const documentEmbeddings = pgTable(
	"document_embeddings",
	{
		dbId: serial("db_id").primaryKey(),
		documentVectorStoreDbId: integer("document_vector_store_db_id")
			.notNull()
			.references(() => documentVectorStores.dbId, {
				onDelete: "cascade",
			}),
		documentVectorStoreSourceDbId: integer("document_vector_store_source_db_id")
			.notNull()
			.references(() => documentVectorStoreSources.dbId, {
				onDelete: "cascade",
			}),
		embeddingProfileId: integer("embedding_profile_id")
			.$type<EmbeddingProfileId>()
			.notNull(),
		embeddingDimensions: integer("embedding_dimensions")
			.$type<EmbeddingDimensions>()
			.notNull(),
		documentKey: text("document_key").notNull(),
		chunkIndex: integer("chunk_index").notNull(),
		chunkContent: text("chunk_content").notNull(),
		embedding: vectorWithoutDimensions("embedding").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		unique("doc_embs_src_prof_doc_chunk_unique").on(
			table.documentVectorStoreSourceDbId,
			table.embeddingProfileId,
			table.documentKey,
			table.chunkIndex,
		),
		index("doc_embs_embedding_1536_idx")
			.using("hnsw", sql`(${table.embedding}::vector(1536)) vector_cosine_ops`)
			.where(sql`${table.embeddingDimensions} = 1536`),
		index("doc_embs_embedding_3072_idx")
			.using(
				"hnsw",
				sql`(${table.embedding}::halfvec(3072)) halfvec_cosine_ops`,
			)
			.where(sql`${table.embeddingDimensions} = 3072`),
		index("doc_embs_store_idx").on(table.documentVectorStoreDbId),
	],
);

export const documentEmbeddingsRelations = relations(
	documentEmbeddings,
	({ one }) => ({
		documentVectorStoreSource: one(documentVectorStoreSources, {
			fields: [documentEmbeddings.documentVectorStoreSourceDbId],
			references: [documentVectorStoreSources.dbId],
		}),
		documentVectorStore: one(documentVectorStores, {
			fields: [documentEmbeddings.documentVectorStoreDbId],
			references: [documentVectorStores.dbId],
		}),
	}),
);

export type GitHubRepositoryContentType = "blob" | "pull_request" | "issue";
export const githubRepositoryContentStatus = pgTable(
	"github_repository_content_status",
	{
		dbId: serial("db_id").primaryKey(),
		repositoryIndexDbId: integer("repository_index_db_id").notNull(),
		embeddingProfileId: integer("embedding_profile_id")
			.$type<EmbeddingProfileId>()
			.notNull(),
		contentType: text("content_type")
			.$type<GitHubRepositoryContentType>()
			.notNull(),
		enabled: boolean("enabled").notNull().default(true),
		status: text("status")
			.notNull()
			.$type<GitHubRepositoryIndexStatus>()
			.default("idle"),
		lastSyncedAt: timestamp("last_synced_at"),
		metadata: jsonb("metadata").$type<ContentStatusMetadata>(),
		errorCode: text("error_code"),
		retryAfter: timestamp("retry_after"),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		unique("gh_content_status_unique").on(
			table.repositoryIndexDbId,
			table.embeddingProfileId,
			table.contentType,
		),
		foreignKey({
			columns: [table.repositoryIndexDbId],
			foreignColumns: [githubRepositoryIndex.dbId],
			name: "gh_content_status_repo_idx_fk",
		}).onDelete("cascade"),
		index("gh_content_status_query_idx").on(
			table.enabled,
			table.status,
			table.updatedAt,
			table.retryAfter,
		),
	],
);

export const githubRepositoryEmbeddings = pgTable(
	"github_repository_embeddings",
	{
		dbId: serial("db_id").primaryKey(),
		repositoryIndexDbId: integer("repository_index_db_id")
			.notNull()
			.references(() => githubRepositoryIndex.dbId, { onDelete: "cascade" }),
		embeddingProfileId: integer("embedding_profile_id")
			.$type<EmbeddingProfileId>()
			.notNull(),
		embeddingDimensions: integer("embedding_dimensions")
			.$type<EmbeddingDimensions>()
			.notNull(),
		fileSha: text("file_sha").notNull(),
		path: text("path").notNull(),
		embedding: vectorWithoutDimensions("embedding").notNull(),
		chunkContent: text("chunk_content").notNull(),
		chunkIndex: integer("chunk_index").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		unique("gh_repo_emb_unique").on(
			table.repositoryIndexDbId,
			table.embeddingProfileId,
			table.path,
			table.chunkIndex,
		),
		// Partial HNSW indexes for different dimensions with casting
		index("github_repository_embeddings_embedding_1536_idx")
			.using("hnsw", sql`${table.embedding}::vector(1536) vector_cosine_ops`)
			.where(sql`${table.embeddingDimensions} = 1536`),
		index("github_repository_embeddings_embedding_3072_idx")
			.using("hnsw", sql`${table.embedding}::halfvec(3072) halfvec_cosine_ops`)
			.where(sql`${table.embeddingDimensions} = 3072`),
	],
);

export const GitHubRepositoryPullRequestContentTypeValues = [
	"title_body",
	"comment",
	"diff",
] as const;
export type GitHubRepositoryPullRequestContentType =
	(typeof GitHubRepositoryPullRequestContentTypeValues)[number];
// Document key format for GitHub Pull Request embeddings (e.g., "123:title_body:", "123:comment:456", "123:diff:path/to/file.ts")
export type GitHubPullRequestDocumentKey =
	`${number}:${GitHubRepositoryPullRequestContentType}:${string}`;

export const githubRepositoryPullRequestEmbeddings = pgTable(
	"github_repository_pull_request_embeddings",
	{
		dbId: serial("db_id").primaryKey(),
		repositoryIndexDbId: integer("repository_index_db_id").notNull(),
		embeddingProfileId: integer("embedding_profile_id")
			.$type<EmbeddingProfileId>()
			.notNull(),
		embeddingDimensions: integer("embedding_dimensions")
			.$type<EmbeddingDimensions>()
			.notNull(),
		prNumber: integer("pr_number").notNull(),
		mergedAt: timestamp("merged_at").notNull(),
		contentType: text("content_type")
			.$type<GitHubRepositoryPullRequestContentType>()
			.notNull(),
		contentId: text("content_id").notNull(),
		documentKey: text("document_key")
			.$type<GitHubPullRequestDocumentKey>()
			.notNull(),
		embedding: vectorWithoutDimensions("embedding").notNull(),
		chunkContent: text("chunk_content").notNull(),
		chunkIndex: integer("chunk_index").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		unique("gh_pr_emb_unique").on(
			table.repositoryIndexDbId,
			table.embeddingProfileId,
			table.prNumber,
			table.contentType,
			table.contentId,
			table.chunkIndex,
		),
		// Partial HNSW indexes for different dimensions with casting
		index("gh_pr_embeddings_embedding_1536_idx")
			.using("hnsw", sql`${table.embedding}::vector(1536) vector_cosine_ops`)
			.where(sql`${table.embeddingDimensions} = 1536`),
		index("gh_pr_embeddings_embedding_3072_idx")
			.using("hnsw", sql`${table.embedding}::halfvec(3072) halfvec_cosine_ops`)
			.where(sql`${table.embeddingDimensions} = 3072`),
		foreignKey({
			columns: [table.repositoryIndexDbId],
			foreignColumns: [githubRepositoryIndex.dbId],
			name: "gh_pr_embeddings_repo_idx_fk",
		}).onDelete("cascade"),
		index("gh_pr_emb_repo_doc_idx").on(
			table.repositoryIndexDbId,
			table.documentKey,
		),
	],
);

export const githubRepositoryIssueEmbeddings = pgTable(
	"github_repository_issue_embeddings",
	{
		dbId: serial("db_id").primaryKey(),
		repositoryIndexDbId: integer("repository_index_db_id").notNull(),
		embeddingProfileId: integer("embedding_profile_id")
			.$type<EmbeddingProfileId>()
			.notNull(),
		embeddingDimensions: integer("embedding_dimensions")
			.$type<EmbeddingDimensions>()
			.notNull(),
		issueNumber: integer("issue_number").notNull(),
		issueState: text("issue_state").$type<GitHubIssueState>().notNull(),
		issueStateReason: text(
			"issue_state_reason",
		).$type<GitHubIssueStateReason | null>(),
		issueUpdatedAt: timestamp("issue_updated_at").notNull(),
		issueClosedAt: timestamp("issue_closed_at"),
		contentType: text("content_type")
			.$type<GitHubRepositoryIssueContentType>()
			.notNull(),
		contentId: text("content_id").notNull(),
		documentKey: text("document_key").$type<GitHubIssueDocumentKey>().notNull(),
		contentCreatedAt: timestamp("content_created_at").notNull(),
		contentEditedAt: timestamp("content_edited_at").notNull(),
		metadataVersion: text("metadata_version"),
		embedding: vectorWithoutDimensions("embedding").notNull(),
		chunkContent: text("chunk_content").notNull(),
		chunkIndex: integer("chunk_index").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		unique("gh_issue_emb_unique").on(
			table.repositoryIndexDbId,
			table.embeddingProfileId,
			table.issueNumber,
			table.contentType,
			table.contentId,
			table.chunkIndex,
		),
		index("gh_issue_embeddings_embedding_1536_idx")
			.using("hnsw", sql`(${table.embedding}::vector(1536)) vector_cosine_ops`)
			.where(sql`${table.embeddingDimensions} = 1536`),
		index("gh_issue_embeddings_embedding_3072_idx")
			.using(
				"hnsw",
				sql`(${table.embedding}::halfvec(3072)) halfvec_cosine_ops`,
			)
			.where(sql`${table.embeddingDimensions} = 3072`),
		foreignKey({
			columns: [table.repositoryIndexDbId],
			foreignColumns: [githubRepositoryIndex.dbId],
			name: "gh_issue_embeddings_repo_idx_fk",
		}).onDelete("cascade"),
		index("gh_issue_emb_repo_doc_idx").on(
			table.repositoryIndexDbId,
			table.documentKey,
		),
	],
);

export const dataStores = pgTable(
	"data_stores",
	{
		id: text("id").$type<DataStoreId>().notNull().unique(),
		dbId: serial("db_id").primaryKey(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		name: text("name").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [index("data_stores_team_db_id_idx").on(table.teamDbId)],
);

export const dataStoreRelations = relations(dataStores, ({ one }) => ({
	team: one(teams, {
		fields: [dataStores.teamDbId],
		references: [teams.dbId],
	}),
}));

export const flowTriggers = pgTable(
	"flow_triggers",
	{
		dbId: serial("db_id").primaryKey(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		staged: boolean("staged").notNull().default(false),
		sdkWorkspaceId: text("workspace_id").$type<WorkspaceId>().notNull(),
		sdkFlowTriggerId: text("flow_trigger_id").$type<TriggerId>().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		uniqueIndex().on(table.sdkFlowTriggerId),
		index().on(table.teamDbId),
		index().on(table.staged),
	],
);

export const acts = pgTable(
	"acts",
	{
		dbId: serial("db_id").primaryKey(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		directorDbId: integer("director_db_id")
			.notNull()
			.references(() => users.dbId, { onDelete: "cascade" }),
		sdkWorkspaceId: text("sdk_workspace_id").$type<WorkspaceId>().notNull(),
		sdkFlowTriggerId: text("sdk_flow_trigger_id").$type<TriggerId>().notNull(),
		sdkActId: text("sdk_act_id").$type<TaskId>().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index().on(table.teamDbId),
		index().on(table.sdkWorkspaceId),
		index().on(table.sdkFlowTriggerId),
		index().on(table.sdkActId),
	],
);

export const apps = pgTable(
	"apps",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").$type<AppId>().notNull().unique(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		workspaceDbId: integer("workspace_db_id")
			.notNull()
			.references(() => workspaces.dbId, { onDelete: "cascade" }),
		appEntryNodeId: text("app_entry_node_id")
			.$type<NodeId>()
			.notNull()
			.unique(),
		endNodeId: text("end_node_id").$type<NodeId>(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index().on(table.teamDbId),
		uniqueIndex().on(table.workspaceDbId, table.appEntryNodeId),
	],
);

export const appRelations = relations(apps, ({ one, many }) => ({
	team: one(teams, {
		fields: [apps.teamDbId],
		references: [teams.dbId],
	}),
	workspace: one(workspaces, {
		fields: [apps.workspaceDbId],
		references: [workspaces.dbId],
	}),
	tasks: many(tasks),
}));

export const ApiKeyId = createIdGenerator("gsk");
export type ApiKeyId = z.infer<typeof ApiKeyId.schema>;

export type ApiSecretKdf = {
	type: "scrypt";
	salt: string;
	params: {
		n: number;
		r: number;
		p: number;
		keyLen: number;
	};
};

export const apiKeys = pgTable(
	"api_keys",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").$type<ApiKeyId>().notNull(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		label: text("label"),
		createdByUserDbId: integer("created_by_user_db_id").references(
			() => users.dbId,
		),
		redactedValue: text("redacted_value").notNull(),
		kdfType: text("kdf_type").$type<ApiSecretKdf["type"]>().notNull(),
		kdfSalt: text("kdf_salt").notNull(),
		kdfN: integer("kdf_n").notNull(),
		kdfR: integer("kdf_r").notNull(),
		kdfP: integer("kdf_p").notNull(),
		kdfKeyLen: integer("kdf_key_len").notNull(),
		secretHash: text("secret_hash").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		lastUsedAt: timestamp("last_used_at"),
		revokedAt: timestamp("revoked_at"),
	},
	(table) => [
		uniqueIndex("api_keys_id_unique").on(table.id),
		index("api_keys_team_db_id_idx").on(table.teamDbId),
		index("api_keys_revoked_at_idx").on(table.revokedAt),
	],
);

export const apiSecretRecordRelations = relations(apiKeys, ({ one }) => ({
	team: one(teams, {
		fields: [apiKeys.teamDbId],
		references: [teams.dbId],
	}),
	creator: one(users, {
		fields: [apiKeys.createdByUserDbId],
		references: [users.dbId],
	}),
}));

export type ApiSecretRecord = typeof apiKeys.$inferSelect;

export const apiRateLimitCounters = pgTable(
	"api_rate_limit_counters",
	{
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		routeKey: text("route_key").notNull(),
		windowStart: timestamp("window_start").notNull(),
		count: integer("count").notNull().default(0),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		primaryKey({
			columns: [table.teamDbId, table.routeKey, table.windowStart],
			name: "api_rate_limit_counters_pk",
		}),
		index("api_rate_limit_counters_team_window_idx").on(
			table.teamDbId,
			table.windowStart,
		),
	],
);

export const tasks = pgTable(
	"tasks",
	{
		id: text("id").$type<TaskId>().notNull().unique(),
		dbId: serial("db_id").primaryKey(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		appDbId: integer("app_db_id").references(() => apps.dbId, {
			onDelete: "cascade",
		}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [index().on(table.teamDbId)],
);

export const taskRelations = relations(tasks, ({ one }) => ({
	team: one(teams, {
		fields: [tasks.teamDbId],
		references: [teams.dbId],
	}),
	app: one(apps, {
		fields: [tasks.appDbId],
		references: [apps.dbId],
	}),
}));

// --- Agency-specific tables ---

export type ClientStatus = "active" | "inactive" | "lead";

export type ChannelProvider = "slack" | "whatsapp" | "telegram" | "discord";

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export type QuoteStatus =
	| "draft"
	| "sent"
	| "accepted"
	| "rejected"
	| "expired";
export type SowStatus = "draft" | "finalized";

export type ServiceCatalogStatus = "active" | "archived";

export type ChangeOrderStatus = "pending" | "approved" | "rejected";

export type CostCategory =
	| "labor"
	| "ai_usage"
	| "infrastructure"
	| "tooling"
	| "subcontractor"
	| "other";

export const clients = pgTable(
	"clients",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		name: text("name").notNull(),
		email: text("email"),
		company: text("company"),
		phone: text("phone"),
		notes: text("notes"),
		status: text("status").$type<ClientStatus>().notNull().default("lead"),
		supabaseUserId: text("supabase_user_id"),
		polarCustomerId: text("polar_customer_id"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("clients_team_db_id_idx").on(table.teamDbId),
		index("clients_supabase_user_id_idx").on(table.supabaseUserId),
	],
);

export const clientRelations = relations(clients, ({ one, many }) => ({
	team: one(teams, {
		fields: [clients.teamDbId],
		references: [teams.dbId],
	}),
	projects: many(projects),
}));

export const channelIdentities = pgTable(
	"channel_identities",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		clientDbId: integer("client_db_id")
			.notNull()
			.references(() => clients.dbId, { onDelete: "cascade" }),
		provider: text("provider").$type<ChannelProvider>().notNull(),
		providerUserId: text("provider_user_id").notNull(),
		providerChannelId: text("provider_channel_id"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("channel_identities_team_db_id_idx").on(table.teamDbId),
		index("channel_identities_client_db_id_idx").on(table.clientDbId),
		index("channel_identities_provider_user_idx").on(
			table.provider,
			table.providerUserId,
		),
	],
);

export const channelGatewayEvents = pgTable(
	"channel_gateway_events",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		teamDbId: integer("team_db_id").references(() => teams.dbId, {
			onDelete: "set null",
		}),
		clientDbId: integer("client_db_id").references(() => clients.dbId, {
			onDelete: "set null",
		}),
		provider: text("provider").$type<ChannelProvider>().notNull(),
		eventType: text("event_type").notNull(),
		action: text("action"),
		projectId: text("project_id"),
		payload: jsonb("payload"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("channel_gateway_events_provider_idx").on(table.provider),
		index("channel_gateway_events_client_idx").on(table.clientDbId),
		index("channel_gateway_events_team_idx").on(table.teamDbId),
	],
);

export type DeliveryProjectStatus =
	| "queued"
	| "in_progress"
	| "qa"
	| "client_review"
	| "done"
	| "blocked";

// Legacy statuses are kept temporarily so we can migrate existing rows safely.
export type LegacyProjectStatus = "draft" | "review" | "completed";

export type ProjectStatus = DeliveryProjectStatus | LegacyProjectStatus;

export const serviceSkus = pgTable(
	"service_skus",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		code: text("code").notNull(),
		name: text("name").notNull(),
		description: text("description"),
		scope: text("scope").notNull(),
		priceCents: integer("price_cents").notNull(),
		currency: text("currency").notNull().default("usd"),
		slaDays: integer("sla_days").notNull().default(7),
		revisionLimit: integer("revision_limit").notNull().default(2),
		isActive: boolean("is_active").notNull().default(true),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("service_skus_team_db_id_idx").on(table.teamDbId),
		index("service_skus_is_active_idx").on(table.isActive),
		unique("service_skus_team_code_unique").on(table.teamDbId, table.code),
	],
);

// ── Delivery Playbooks ───────────────────────────────────────
export type PlaybookPhase = {
	order: number;
	name: string;
	deliverableType: "document" | "code" | "design" | "other";
	description?: string;
	isBillableMilestone: boolean;
	milestoneLabel?: string;
};

export const deliveryPlaybooks = pgTable(
	"delivery_playbooks",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		serviceSkuDbId: integer("service_sku_db_id").references(
			() => serviceSkus.dbId,
			{ onDelete: "set null" },
		),
		defaultBudgetCents: integer("default_budget_cents"),
		defaultSlaDays: integer("default_sla_days").notNull().default(7),
		namePrefix: text("name_prefix"),
		phases: jsonb("phases").$type<PlaybookPhase[]>().notNull().default([]),
		checklist: jsonb("checklist").$type<string[]>().notNull().default([]),
		isActive: boolean("is_active").notNull().default(true),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("delivery_playbooks_team_db_id_idx").on(table.teamDbId),
		index("delivery_playbooks_is_active_idx").on(table.isActive),
		unique("delivery_playbooks_team_name_uidx").on(table.teamDbId, table.name),
	],
);

export const deliveryPlaybookRelations = relations(
	deliveryPlaybooks,
	({ one }) => ({
		team: one(teams, {
			fields: [deliveryPlaybooks.teamDbId],
			references: [teams.dbId],
		}),
		serviceSku: one(serviceSkus, {
			fields: [deliveryPlaybooks.serviceSkuDbId],
			references: [serviceSkus.dbId],
		}),
	}),
);

export const projects = pgTable(
	"projects",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		clientDbId: integer("client_db_id")
			.notNull()
			.references(() => clients.dbId, { onDelete: "cascade" }),
		workspaceDbId: integer("workspace_db_id").references(
			() => workspaces.dbId,
			{ onDelete: "set null" },
		),
		serviceSkuDbId: integer("service_sku_db_id").references(
			() => serviceSkus.dbId,
			{ onDelete: "set null" },
		),
		playbookDbId: integer("playbook_db_id").references(
			() => deliveryPlaybooks.dbId,
			{ onDelete: "set null" },
		),
		scopeOverrideReason: text("scope_override_reason"),
		name: text("name").notNull(),
		brief: text("brief"),
		status: text("status").$type<ProjectStatus>().notNull().default("queued"),
		budgetCents: integer("budget_cents"),
		quoteDbId: integer("quote_db_id"),
		costWarningThresholdPct: integer("cost_warning_threshold_pct")
			.notNull()
			.default(80),
		costHardStopThresholdPct: integer("cost_hard_stop_threshold_pct")
			.notNull()
			.default(100),
		costHardStopEnabled: boolean("cost_hard_stop_enabled")
			.notNull()
			.default(false),
		assignedUserDbId: integer("assigned_user_db_id").references(
			() => users.dbId,
			{ onDelete: "set null" },
		),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("projects_team_db_id_idx").on(table.teamDbId),
		index("projects_client_db_id_idx").on(table.clientDbId),
		index("projects_workspace_db_id_idx").on(table.workspaceDbId),
		index("projects_service_sku_db_id_idx").on(table.serviceSkuDbId),
		index("projects_playbook_db_id_idx").on(table.playbookDbId),
		index("projects_assigned_user_db_id_idx").on(table.assignedUserDbId),
	],
);

export const serviceSkuRelations = relations(serviceSkus, ({ one, many }) => ({
	team: one(teams, {
		fields: [serviceSkus.teamDbId],
		references: [teams.dbId],
	}),
	projects: many(projects),
}));

export const projectStatusTransitions = pgTable(
	"project_status_transitions",
	{
		dbId: serial("db_id").primaryKey(),
		projectDbId: integer("project_db_id")
			.notNull()
			.references(() => projects.dbId, { onDelete: "cascade" }),
		fromStatus: text("from_status").$type<ProjectStatus>().notNull(),
		toStatus: text("to_status").$type<ProjectStatus>().notNull(),
		actorUserDbId: integer("actor_user_db_id").references(() => users.dbId, {
			onDelete: "set null",
		}),
		reason: text("reason"),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("project_status_transitions_project_db_id_idx").on(table.projectDbId),
		index("project_status_transitions_actor_user_db_id_idx").on(
			table.actorUserDbId,
		),
		index("project_status_transitions_created_at_idx").on(table.createdAt),
	],
);

export const projectRelations = relations(projects, ({ one, many }) => ({
	team: one(teams, {
		fields: [projects.teamDbId],
		references: [teams.dbId],
	}),
	client: one(clients, {
		fields: [projects.clientDbId],
		references: [clients.dbId],
	}),
	workspace: one(workspaces, {
		fields: [projects.workspaceDbId],
		references: [workspaces.dbId],
	}),
	serviceSku: one(serviceSkus, {
		fields: [projects.serviceSkuDbId],
		references: [serviceSkus.dbId],
	}),
	playbook: one(deliveryPlaybooks, {
		fields: [projects.playbookDbId],
		references: [deliveryPlaybooks.dbId],
	}),
	assignedUser: one(users, {
		fields: [projects.assignedUserDbId],
		references: [users.dbId],
	}),
	deliverables: many(deliverables),
	statusTransitions: many(projectStatusTransitions),
	changeOrders: many(changeOrders),
	milestoneApprovals: many(milestoneApprovals),
}));

export const quotes = pgTable(
	"quotes",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		clientDbId: integer("client_db_id")
			.notNull()
			.references(() => clients.dbId, { onDelete: "cascade" }),
		serviceSkuDbId: integer("service_sku_db_id").references(
			() => serviceSkus.dbId,
			{ onDelete: "set null" },
		),
		projectDbId: integer("project_db_id")
			.unique()
			.references(() => projects.dbId, { onDelete: "set null" }),
		title: text("title").notNull(),
		scopeSnapshot: text("scope_snapshot").notNull(),
		scopeOverrideReason: text("scope_override_reason"),
		priceCents: integer("price_cents").notNull(),
		currency: text("currency").notNull().default("usd"),
		slaDays: integer("sla_days").notNull().default(7),
		revisionLimit: integer("revision_limit").notNull().default(2),
		notes: text("notes"),
		status: text("status").$type<QuoteStatus>().notNull().default("draft"),
		acceptedAt: timestamp("accepted_at"),
		rejectedAt: timestamp("rejected_at"),
		createdByUserDbId: integer("created_by_user_db_id").references(
			() => users.dbId,
			{ onDelete: "set null" },
		),
		decidedByUserDbId: integer("decided_by_user_db_id").references(
			() => users.dbId,
			{ onDelete: "set null" },
		),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("quotes_team_db_id_idx").on(table.teamDbId),
		index("quotes_client_db_id_idx").on(table.clientDbId),
		index("quotes_status_idx").on(table.status),
		index("quotes_created_at_idx").on(table.createdAt),
	],
);

export const sows = pgTable(
	"sows",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		clientDbId: integer("client_db_id")
			.notNull()
			.references(() => clients.dbId, { onDelete: "cascade" }),
		quoteDbId: integer("quote_db_id")
			.notNull()
			.unique()
			.references(() => quotes.dbId, { onDelete: "cascade" }),
		title: text("title").notNull(),
		scope: text("scope").notNull(),
		terms: text("terms"),
		status: text("status").$type<SowStatus>().notNull().default("draft"),
		version: integer("version").notNull().default(1),
		createdByUserDbId: integer("created_by_user_db_id").references(
			() => users.dbId,
			{ onDelete: "set null" },
		),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("sows_team_db_id_idx").on(table.teamDbId),
		index("sows_client_db_id_idx").on(table.clientDbId),
		index("sows_status_idx").on(table.status),
	],
);

export const quoteRelations = relations(quotes, ({ one, many }) => ({
	team: one(teams, {
		fields: [quotes.teamDbId],
		references: [teams.dbId],
	}),
	client: one(clients, {
		fields: [quotes.clientDbId],
		references: [clients.dbId],
	}),
	serviceSku: one(serviceSkus, {
		fields: [quotes.serviceSkuDbId],
		references: [serviceSkus.dbId],
	}),
	project: one(projects, {
		fields: [quotes.projectDbId],
		references: [projects.dbId],
	}),
	sow: one(sows, {
		fields: [quotes.dbId],
		references: [sows.quoteDbId],
	}),
	createdBy: one(users, {
		fields: [quotes.createdByUserDbId],
		references: [users.dbId],
	}),
	decidedBy: one(users, {
		fields: [quotes.decidedByUserDbId],
		references: [users.dbId],
	}),
	lineItems: many(quoteLineItems),
	changeOrders: many(changeOrders),
}));

export const sowRelations = relations(sows, ({ one }) => ({
	team: one(teams, {
		fields: [sows.teamDbId],
		references: [teams.dbId],
	}),
	client: one(clients, {
		fields: [sows.clientDbId],
		references: [clients.dbId],
	}),
	quote: one(quotes, {
		fields: [sows.quoteDbId],
		references: [quotes.dbId],
	}),
	createdBy: one(users, {
		fields: [sows.createdByUserDbId],
		references: [users.dbId],
	}),
}));

export const projectStatusTransitionRelations = relations(
	projectStatusTransitions,
	({ one }) => ({
		project: one(projects, {
			fields: [projectStatusTransitions.projectDbId],
			references: [projects.dbId],
		}),
		actor: one(users, {
			fields: [projectStatusTransitions.actorUserDbId],
			references: [users.dbId],
		}),
	}),
);

export type DeliverableType = "document" | "code" | "design" | "other";
export type DeliverableStatus =
	| "draft"
	| "pending_review"
	| "approved"
	| "rejected";

export type MilestoneApprovalStatus =
	| "not_applicable"
	| "pending_approval"
	| "approved"
	| "rejected";

export const deliverables = pgTable(
	"deliverables",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		projectDbId: integer("project_db_id")
			.notNull()
			.references(() => projects.dbId, { onDelete: "cascade" }),
		taskId: text("task_id").$type<TaskId>(),
		name: text("name").notNull(),
		type: text("type").$type<DeliverableType>().notNull().default("document"),
		content: text("content"),
		fileKey: text("file_key"),
		status: text("status")
			.$type<DeliverableStatus>()
			.notNull()
			.default("draft"),
		isBillableMilestone: boolean("is_billable_milestone")
			.notNull()
			.default(false),
		milestoneLabel: text("milestone_label"),
		clientFeedback: text("client_feedback"),
		phaseOrder: integer("phase_order").notNull().default(0),
		milestoneApprovalStatus: text("milestone_approval_status")
			.$type<MilestoneApprovalStatus>()
			.notNull()
			.default("not_applicable"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("deliverables_project_db_id_idx").on(table.projectDbId),
		index("deliverables_billable_milestone_idx").on(table.isBillableMilestone),
	],
);

export const deliverableRelations = relations(deliverables, ({ one }) => ({
	project: one(projects, {
		fields: [deliverables.projectDbId],
		references: [projects.dbId],
	}),
}));

// Client Portal Invitations
export type ClientInvitationStatus =
	| "pending"
	| "accepted"
	| "expired"
	| "revoked";

export const clientInvitations = pgTable(
	"client_invitations",
	{
		dbId: serial("db_id").primaryKey(),
		token: text("token").notNull().unique(),
		clientDbId: integer("client_db_id")
			.notNull()
			.references(() => clients.dbId, { onDelete: "cascade" }),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		email: text("email").notNull(),
		inviterUserDbId: integer("inviter_user_db_id")
			.notNull()
			.references(() => users.dbId, { onDelete: "cascade" }),
		expiredAt: timestamp("expired_at").notNull(),
		acceptedAt: timestamp("accepted_at"),
		revokedAt: timestamp("revoked_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("client_invitations_client_db_id_idx").on(table.clientDbId),
		index("client_invitations_team_db_id_idx").on(table.teamDbId),
		index("client_invitations_token_idx").on(table.token),
	],
);

export const clientInvitationRelations = relations(
	clientInvitations,
	({ one }) => ({
		client: one(clients, {
			fields: [clientInvitations.clientDbId],
			references: [clients.dbId],
		}),
		team: one(teams, {
			fields: [clientInvitations.teamDbId],
			references: [teams.dbId],
		}),
		inviter: one(users, {
			fields: [clientInvitations.inviterUserDbId],
			references: [users.dbId],
		}),
	}),
);

// ── Invoices ─────────────────────────────────────────────────
export const invoices = pgTable(
	"invoices",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		projectDbId: integer("project_db_id").references(() => projects.dbId),
		clientDbId: integer("client_db_id").references(() => clients.dbId),
		amount: integer("amount").notNull(), // cents
		currency: text("currency").notNull().default("usd"),
		status: text("status").$type<InvoiceStatus>().notNull().default("draft"),
		polarOrderId: text("polar_order_id"),
		dueDate: timestamp("due_date"),
		paidAt: timestamp("paid_at"),
		retryCount: integer("retry_count").notNull().default(0),
		lastRetryAt: timestamp("last_retry_at"),
		lastError: text("last_error"),
		nextRetryAt: timestamp("next_retry_at"),
		autoRetryDisabled: boolean("auto_retry_disabled").notNull().default(false),
		deliverableDbId: integer("deliverable_db_id").references(
			() => deliverables.dbId,
			{ onDelete: "set null" },
		),
		quoteDbId: integer("quote_db_id"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("invoices_team_db_id_idx").on(table.teamDbId),
		index("invoices_project_db_id_idx").on(table.projectDbId),
		index("invoices_client_db_id_idx").on(table.clientDbId),
		index("invoices_retry_count_idx").on(table.retryCount),
		index("invoices_next_retry_at_idx").on(table.nextRetryAt),
	],
);

export const invoiceRelations = relations(invoices, ({ one }) => ({
	team: one(teams, {
		fields: [invoices.teamDbId],
		references: [teams.dbId],
	}),
	project: one(projects, {
		fields: [invoices.projectDbId],
		references: [projects.dbId],
	}),
	client: one(clients, {
		fields: [invoices.clientDbId],
		references: [clients.dbId],
	}),
	deliverable: one(deliverables, {
		fields: [invoices.deliverableDbId],
		references: [deliverables.dbId],
	}),
	quote: one(quotes, {
		fields: [invoices.quoteDbId],
		references: [quotes.dbId],
	}),
}));

// ── Service Catalog ──────────────────────────────────────────
export const serviceCatalog = pgTable(
	"service_catalog",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		priceCents: integer("price_cents").notNull(),
		currency: text("currency").notNull().default("usd"),
		estimatedDays: integer("estimated_days"),
		deliverableType: text("deliverable_type").$type<DeliverableType>(),
		status: text("status")
			.$type<ServiceCatalogStatus>()
			.notNull()
			.default("active"),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("service_catalog_team_db_id_idx").on(table.teamDbId),
		index("service_catalog_status_idx").on(table.status),
	],
);

export const serviceCatalogRelations = relations(serviceCatalog, ({ one }) => ({
	team: one(teams, {
		fields: [serviceCatalog.teamDbId],
		references: [teams.dbId],
	}),
}));

// ── Quote Line Items ─────────────────────────────────────────
export const quoteLineItems = pgTable(
	"quote_line_items",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		quoteDbId: integer("quote_db_id")
			.notNull()
			.references(() => quotes.dbId, { onDelete: "cascade" }),
		serviceCatalogDbId: integer("service_catalog_db_id").references(
			() => serviceCatalog.dbId,
			{ onDelete: "set null" },
		),
		name: text("name").notNull(),
		description: text("description"),
		quantity: integer("quantity").notNull().default(1),
		unitPriceCents: integer("unit_price_cents").notNull(),
		totalCents: integer("total_cents").notNull(),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [index("quote_line_items_quote_db_id_idx").on(table.quoteDbId)],
);

export const quoteLineItemRelations = relations(quoteLineItems, ({ one }) => ({
	quote: one(quotes, {
		fields: [quoteLineItems.quoteDbId],
		references: [quotes.dbId],
	}),
	serviceCatalogItem: one(serviceCatalog, {
		fields: [quoteLineItems.serviceCatalogDbId],
		references: [serviceCatalog.dbId],
	}),
}));

// ── Change Orders ────────────────────────────────────────────
export const changeOrders = pgTable(
	"change_orders",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		projectDbId: integer("project_db_id")
			.notNull()
			.references(() => projects.dbId, { onDelete: "cascade" }),
		clientDbId: integer("client_db_id")
			.notNull()
			.references(() => clients.dbId, { onDelete: "cascade" }),
		quoteDbId: integer("quote_db_id").references(() => quotes.dbId, {
			onDelete: "set null",
		}),
		title: text("title").notNull(),
		scopeDelta: text("scope_delta").notNull(),
		billingDeltaCents: integer("billing_delta_cents").notNull(),
		scopeVersion: integer("scope_version").notNull(),
		status: text("status")
			.$type<ChangeOrderStatus>()
			.notNull()
			.default("pending"),
		decisionReason: text("decision_reason"),
		requestedByUserDbId: integer("requested_by_user_db_id").references(
			() => users.dbId,
			{ onDelete: "set null" },
		),
		decidedByUserDbId: integer("decided_by_user_db_id").references(
			() => users.dbId,
			{ onDelete: "set null" },
		),
		approvedAt: timestamp("approved_at"),
		rejectedAt: timestamp("rejected_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("change_orders_team_db_id_idx").on(table.teamDbId),
		index("change_orders_project_db_id_idx").on(table.projectDbId),
		index("change_orders_client_db_id_idx").on(table.clientDbId),
		index("change_orders_quote_db_id_idx").on(table.quoteDbId),
		index("change_orders_status_idx").on(table.status),
		index("change_orders_project_scope_version_idx").on(
			table.projectDbId,
			table.scopeVersion,
		),
	],
);

export const changeOrderRelations = relations(changeOrders, ({ one }) => ({
	project: one(projects, {
		fields: [changeOrders.projectDbId],
		references: [projects.dbId],
	}),
	client: one(clients, {
		fields: [changeOrders.clientDbId],
		references: [clients.dbId],
	}),
	quote: one(quotes, {
		fields: [changeOrders.quoteDbId],
		references: [quotes.dbId],
	}),
	team: one(teams, {
		fields: [changeOrders.teamDbId],
		references: [teams.dbId],
	}),
	requestedBy: one(users, {
		fields: [changeOrders.requestedByUserDbId],
		references: [users.dbId],
	}),
	decidedBy: one(users, {
		fields: [changeOrders.decidedByUserDbId],
		references: [users.dbId],
	}),
}));

// ── Cost Ledger ──────────────────────────────────────────────
export const costLedgerEntries = pgTable(
	"cost_ledger_entries",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		projectDbId: integer("project_db_id")
			.notNull()
			.references(() => projects.dbId, { onDelete: "cascade" }),
		description: text("description").notNull(),
		amountCents: integer("amount_cents").notNull(),
		category: text("category").$type<CostCategory>().notNull().default("other"),
		occurredAt: timestamp("occurred_at").defaultNow().notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("cost_ledger_entries_team_db_id_idx").on(table.teamDbId),
		index("cost_ledger_entries_project_db_id_idx").on(table.projectDbId),
	],
);

export const costLedgerEntryRelations = relations(
	costLedgerEntries,
	({ one }) => ({
		team: one(teams, {
			fields: [costLedgerEntries.teamDbId],
			references: [teams.dbId],
		}),
		project: one(projects, {
			fields: [costLedgerEntries.projectDbId],
			references: [projects.dbId],
		}),
	}),
);

// ── Model Routing Policies ──────────────────────────────────
export const modelRoutingPolicies = pgTable(
	"model_routing_policies",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		projectDbId: integer("project_db_id").references(() => projects.dbId, {
			onDelete: "cascade",
		}),
		name: text("name").notNull(),
		preferredModelId: text("preferred_model_id").notNull(),
		fallbackModelId: text("fallback_model_id"),
		costCeilingCentsPerGeneration: integer("cost_ceiling_cents_per_generation"),
		isActive: boolean("is_active").notNull().default(true),
		priority: integer("priority").notNull().default(0),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("model_routing_policies_team_db_id_idx").on(table.teamDbId),
		index("model_routing_policies_project_db_id_idx").on(table.projectDbId),
		index("model_routing_policies_is_active_idx").on(table.isActive),
	],
);

export const modelRoutingPolicyRelations = relations(
	modelRoutingPolicies,
	({ one }) => ({
		team: one(teams, {
			fields: [modelRoutingPolicies.teamDbId],
			references: [teams.dbId],
		}),
		project: one(projects, {
			fields: [modelRoutingPolicies.projectDbId],
			references: [projects.dbId],
		}),
	}),
);

// ── Generation Cost Logs ─────────────────────────────────────
export const generationCostLogs = pgTable(
	"generation_cost_logs",
	{
		dbId: serial("db_id").primaryKey(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		projectDbId: integer("project_db_id").references(() => projects.dbId, {
			onDelete: "set null",
		}),
		workspaceId: text("workspace_id"),
		generationId: text("generation_id").notNull(),
		modelId: text("model_id").notNull(),
		provider: text("provider").notNull(),
		inputTokens: integer("input_tokens").notNull().default(0),
		outputTokens: integer("output_tokens").notNull().default(0),
		totalCostCents: integer("total_cost_cents").notNull().default(0),
		costLedgerEntryDbId: integer("cost_ledger_entry_db_id").references(
			() => costLedgerEntries.dbId,
			{ onDelete: "set null" },
		),
		routingPolicyDbId: integer("routing_policy_db_id").references(
			() => modelRoutingPolicies.dbId,
			{ onDelete: "set null" },
		),
		wasFallback: boolean("was_fallback").notNull().default(false),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("generation_cost_logs_team_db_id_idx").on(table.teamDbId),
		index("generation_cost_logs_project_db_id_idx").on(table.projectDbId),
		index("generation_cost_logs_model_id_idx").on(table.modelId),
		index("generation_cost_logs_created_at_idx").on(table.createdAt),
	],
);

export const generationCostLogRelations = relations(
	generationCostLogs,
	({ one }) => ({
		team: one(teams, {
			fields: [generationCostLogs.teamDbId],
			references: [teams.dbId],
		}),
		project: one(projects, {
			fields: [generationCostLogs.projectDbId],
			references: [projects.dbId],
		}),
		costLedgerEntry: one(costLedgerEntries, {
			fields: [generationCostLogs.costLedgerEntryDbId],
			references: [costLedgerEntries.dbId],
		}),
		routingPolicy: one(modelRoutingPolicies, {
			fields: [generationCostLogs.routingPolicyDbId],
			references: [modelRoutingPolicies.dbId],
		}),
	}),
);

// ── Milestone Approvals ──────────────────────────────────────
export type MilestoneApprovalDecision = "pending" | "approved" | "rejected";

export const milestoneApprovals = pgTable(
	"milestone_approvals",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		projectDbId: integer("project_db_id")
			.notNull()
			.references(() => projects.dbId, { onDelete: "cascade" }),
		milestoneLabel: text("milestone_label").notNull(),
		status: text("status")
			.$type<MilestoneApprovalDecision>()
			.notNull()
			.default("pending"),
		decidedByUserDbId: integer("decided_by_user_db_id").references(
			() => users.dbId,
			{ onDelete: "set null" },
		),
		decisionReason: text("decision_reason"),
		decidedAt: timestamp("decided_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("milestone_approvals_project_db_id_idx").on(table.projectDbId),
		unique("milestone_approvals_project_label_uidx").on(
			table.projectDbId,
			table.milestoneLabel,
		),
	],
);

export const milestoneApprovalRelations = relations(
	milestoneApprovals,
	({ one }) => ({
		project: one(projects, {
			fields: [milestoneApprovals.projectDbId],
			references: [projects.dbId],
		}),
		decidedBy: one(users, {
			fields: [milestoneApprovals.decidedByUserDbId],
			references: [users.dbId],
		}),
	}),
);

// ── Client Digest Schedules ──────────────────────────────────
export type DigestFrequency = "weekly";

export const clientDigestSchedules = pgTable(
	"client_digest_schedules",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		clientDbId: integer("client_db_id")
			.notNull()
			.references(() => clients.dbId, { onDelete: "cascade" }),
		frequency: text("frequency")
			.$type<DigestFrequency>()
			.notNull()
			.default("weekly"),
		lastSentAt: timestamp("last_sent_at"),
		isActive: boolean("is_active").notNull().default(true),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("client_digest_schedules_team_db_id_idx").on(table.teamDbId),
		index("client_digest_schedules_is_active_idx").on(table.isActive),
		unique("client_digest_schedules_team_client_uidx").on(
			table.teamDbId,
			table.clientDbId,
		),
	],
);

export const clientDigestScheduleRelations = relations(
	clientDigestSchedules,
	({ one }) => ({
		team: one(teams, {
			fields: [clientDigestSchedules.teamDbId],
			references: [teams.dbId],
		}),
		client: one(clients, {
			fields: [clientDigestSchedules.clientDbId],
			references: [clients.dbId],
		}),
	}),
);

// ── Team Capacity Settings ───────────────────────────────────
export const teamCapacitySettings = pgTable("team_capacity_settings", {
	dbId: serial("db_id").primaryKey(),
	teamDbId: integer("team_db_id")
		.notNull()
		.unique()
		.references(() => teams.dbId, { onDelete: "cascade" }),
	maxConcurrentProjects: integer("max_concurrent_projects")
		.notNull()
		.default(10),
	maxConcurrentPerMember: integer("max_concurrent_per_member")
		.notNull()
		.default(3),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.notNull()
		.$onUpdate(() => new Date()),
});

export const teamCapacitySettingRelations = relations(
	teamCapacitySettings,
	({ one }) => ({
		team: one(teams, {
			fields: [teamCapacitySettings.teamDbId],
			references: [teams.dbId],
		}),
	}),
);

// ── Alert Subscriptions ──────────────────────────────────────
export type AlertChannel = "email" | "slack";
export type AlertEventType = "sla_breach" | "stuck_project" | "rework_spike";

export type AlertConfigEmail = {
	recipients: Array<{ userDisplayName: string; userEmail: string }>;
};
export type AlertConfigSlack = {
	webhookUrl: string;
};
export type AlertConfig = AlertConfigEmail | AlertConfigSlack;

export const alertSubscriptions = pgTable(
	"alert_subscriptions",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		channel: text("channel").$type<AlertChannel>().notNull(),
		eventType: text("event_type").$type<AlertEventType>().notNull(),
		config: jsonb("config").$type<AlertConfig>().notNull(),
		isActive: boolean("is_active").notNull().default(true),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("alert_subscriptions_team_db_id_idx").on(table.teamDbId),
		index("alert_subscriptions_event_type_idx").on(table.eventType),
		index("alert_subscriptions_is_active_idx").on(table.isActive),
	],
);

export const alertSubscriptionRelations = relations(
	alertSubscriptions,
	({ one }) => ({
		team: one(teams, {
			fields: [alertSubscriptions.teamDbId],
			references: [teams.dbId],
		}),
	}),
);

// ── Channel Conversations ──────────────────────────────────────
export const channelConversations = pgTable(
	"channel_conversations",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		clientDbId: integer("client_db_id")
			.notNull()
			.references(() => clients.dbId, { onDelete: "cascade" }),
		provider: text("provider").$type<ChannelProvider>().notNull(),
		channelId: text("channel_id").notNull(),
		threadId: text("thread_id"),
		lastMessageAt: timestamp("last_message_at", {
			withTimezone: true,
		}).notNull(),
		metadata: jsonb("metadata"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("channel_conversations_client_provider_channel_idx").on(
			table.clientDbId,
			table.provider,
			table.channelId,
		),
	],
);

export const channelConversationRelations = relations(
	channelConversations,
	({ one, many }) => ({
		client: one(clients, {
			fields: [channelConversations.clientDbId],
			references: [clients.dbId],
		}),
		messages: many(channelMessages),
	}),
);

export const channelMessages = pgTable(
	"channel_messages",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		conversationDbId: integer("conversation_db_id")
			.notNull()
			.references(() => channelConversations.dbId, { onDelete: "cascade" }),
		role: text("role").$type<"user" | "assistant">().notNull(),
		content: text("content").notNull(),
		providerMessageId: text("provider_message_id"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("channel_messages_conversation_created_idx").on(
			table.conversationDbId,
			table.createdAt,
		),
	],
);

export const channelMessageRelations = relations(
	channelMessages,
	({ one }) => ({
		conversation: one(channelConversations, {
			fields: [channelMessages.conversationDbId],
			references: [channelConversations.dbId],
		}),
	}),
);

// ── Showcase Playlists ──────────────────────────────────────
export const showcasePlaylists = pgTable(
	"showcase_playlists",
	{
		dbId: serial("db_id").primaryKey(),
		id: text("id").notNull().unique(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		creatorUserDbId: integer("creator_user_db_id")
			.notNull()
			.references(() => users.dbId, { onDelete: "cascade" }),
		title: text("title").notNull(),
		description: text("description").notNull().default(""),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		index("showcase_playlists_team_db_id_idx").on(table.teamDbId),
		index("showcase_playlists_creator_user_db_id_idx").on(
			table.creatorUserDbId,
		),
	],
);

export const showcasePlaylistRelations = relations(
	showcasePlaylists,
	({ one, many }) => ({
		team: one(teams, {
			fields: [showcasePlaylists.teamDbId],
			references: [teams.dbId],
		}),
		creator: one(users, {
			fields: [showcasePlaylists.creatorUserDbId],
			references: [users.dbId],
		}),
		apps: many(showcasePlaylistApps),
	}),
);

export const showcasePlaylistApps = pgTable(
	"showcase_playlist_apps",
	{
		dbId: serial("db_id").primaryKey(),
		playlistDbId: integer("playlist_db_id")
			.notNull()
			.references(() => showcasePlaylists.dbId, { onDelete: "cascade" }),
		flowTriggerDbId: integer("flow_trigger_db_id")
			.notNull()
			.references(() => flowTriggers.dbId, { onDelete: "cascade" }),
		sortOrder: integer("sort_order").notNull().default(0),
		addedAt: timestamp("added_at").defaultNow().notNull(),
	},
	(table) => [
		index("showcase_playlist_apps_playlist_db_id_idx").on(table.playlistDbId),
		unique("showcase_playlist_apps_playlist_trigger_uidx").on(
			table.playlistDbId,
			table.flowTriggerDbId,
		),
	],
);

export const showcasePlaylistAppRelations = relations(
	showcasePlaylistApps,
	({ one }) => ({
		playlist: one(showcasePlaylists, {
			fields: [showcasePlaylistApps.playlistDbId],
			references: [showcasePlaylists.dbId],
		}),
		flowTrigger: one(flowTriggers, {
			fields: [showcasePlaylistApps.flowTriggerDbId],
			references: [flowTriggers.dbId],
		}),
	}),
);

// ── Showcase Favorites ──────────────────────────────────────
export const showcaseFavorites = pgTable(
	"showcase_favorites",
	{
		dbId: serial("db_id").primaryKey(),
		userDbId: integer("user_db_id")
			.notNull()
			.references(() => users.dbId, { onDelete: "cascade" }),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		/** The trigger/app ID that was favorited */
		itemId: text("item_id").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		unique("showcase_favorites_user_team_item_uidx").on(
			table.userDbId,
			table.teamDbId,
			table.itemId,
		),
		index("showcase_favorites_user_team_idx").on(
			table.userDbId,
			table.teamDbId,
		),
	],
);

export const showcaseFavoriteRelations = relations(
	showcaseFavorites,
	({ one }) => ({
		user: one(users, {
			fields: [showcaseFavorites.userDbId],
			references: [users.dbId],
		}),
		team: one(teams, {
			fields: [showcaseFavorites.teamDbId],
			references: [teams.dbId],
		}),
	}),
);

// ── Featured Items (Lobby) ──────────────────────────────────
export type FeaturedItemType = "app" | "workflow";

export const featuredItems = pgTable(
	"featured_items",
	{
		dbId: serial("db_id").primaryKey(),
		teamDbId: integer("team_db_id")
			.notNull()
			.references(() => teams.dbId, { onDelete: "cascade" }),
		itemType: text("item_type").$type<FeaturedItemType>().notNull(),
		/** For apps: apps.id; for workflows: workspaces.id */
		itemId: text("item_id").notNull(),
		featuredByUserDbId: integer("featured_by_user_db_id")
			.notNull()
			.references(() => users.dbId, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("featured_items_team_db_id_idx").on(table.teamDbId),
		unique("featured_items_team_type_item_uidx").on(
			table.teamDbId,
			table.itemType,
			table.itemId,
		),
	],
);

export const featuredItemRelations = relations(featuredItems, ({ one }) => ({
	team: one(teams, {
		fields: [featuredItems.teamDbId],
		references: [teams.dbId],
	}),
	featuredBy: one(users, {
		fields: [featuredItems.featuredByUserDbId],
		references: [users.dbId],
	}),
}));
