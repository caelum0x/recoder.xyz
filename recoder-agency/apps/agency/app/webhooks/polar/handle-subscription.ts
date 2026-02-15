import { and, desc, eq, ne } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { db, polarSubscriptionHistories, teamMemberships, teams } from "@/db";
import { logger } from "@/lib/logger";
import {
	DRAFT_TEAM_NAME_METADATA_KEY,
	DRAFT_TEAM_USER_DB_ID_METADATA_KEY,
	UPGRADING_TEAM_DB_ID_KEY,
} from "@/services/teams/constants";
import { createTeamId } from "@/services/teams/utils";

type TransactionType = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface PolarSubscriptionPayload {
	id: string;
	status: string;
	productId: string;
	customerId: string;
	metadata: Record<string, string>;
	currentPeriodEnd?: string;
	createdAt: string;
}

/**
 * Handle subscription.active event from Polar webhook
 */
export async function handleSubscriptionActive(
	subscription: PolarSubscriptionPayload,
) {
	const { id: subscriptionId, customerId, metadata } = subscription;

	logger.info({ subscriptionId }, "[polar-webhook] Subscription activated");

	try {
		await db.transaction(async (tx) => {
			// Idempotency check
			const [existing] = await tx
				.select({ teamDbId: polarSubscriptionHistories.teamDbId })
				.from(polarSubscriptionHistories)
				.where(eq(polarSubscriptionHistories.subscriptionId, subscriptionId))
				.orderBy(desc(polarSubscriptionHistories.createdAt))
				.limit(1);

			if (existing) {
				logger.info(
					{ subscriptionId, teamDbId: existing.teamDbId },
					"[polar-webhook] Subscription already processed, updating existing team",
				);
				await updateExistingTeam(
					tx,
					subscription,
					customerId,
					existing.teamDbId,
				);
				return;
			}

			if (UPGRADING_TEAM_DB_ID_KEY in metadata) {
				const teamDbId = Number.parseInt(
					metadata[UPGRADING_TEAM_DB_ID_KEY],
					10,
				);
				await upgradeExistingTeam(tx, subscription, customerId, teamDbId);
			} else if (
				DRAFT_TEAM_NAME_METADATA_KEY in metadata &&
				DRAFT_TEAM_USER_DB_ID_METADATA_KEY in metadata
			) {
				const teamName = metadata[DRAFT_TEAM_NAME_METADATA_KEY];
				const userDbId = Number.parseInt(
					metadata[DRAFT_TEAM_USER_DB_ID_METADATA_KEY],
					10,
				);
				await createNewProTeam(
					tx,
					subscription,
					customerId,
					userDbId,
					teamName,
				);
			} else {
				throw new Error(
					`Invalid subscription metadata. Expected one of: [${UPGRADING_TEAM_DB_ID_KEY}, (${DRAFT_TEAM_NAME_METADATA_KEY} & ${DRAFT_TEAM_USER_DB_ID_METADATA_KEY})]. Actual keys: [${Object.keys(metadata).join(", ")}]`,
				);
			}
		});
	} catch (error) {
		if (isActiveSubscriptionIdViolation(error)) {
			logger.info(
				{ subscriptionId },
				"[polar-webhook] Subscription already processed (unique constraint)",
			);
			return;
		}
		throw error;
	}
}

/**
 * Handle subscription.canceled event from Polar webhook
 */
export async function handleSubscriptionCanceled(
	subscription: PolarSubscriptionPayload,
) {
	const { id: subscriptionId, customerId } = subscription;

	logger.info({ subscriptionId }, "[polar-webhook] Subscription canceled");

	await db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ teamDbId: polarSubscriptionHistories.teamDbId })
			.from(polarSubscriptionHistories)
			.where(eq(polarSubscriptionHistories.subscriptionId, subscriptionId))
			.orderBy(desc(polarSubscriptionHistories.createdAt))
			.limit(1);

		if (!existing) {
			throw new Error(
				`No subscription history found for canceled subscription ${subscriptionId}`,
			);
		}

		await tx
			.update(teams)
			.set({
				plan: "free",
				activeSubscriptionId: null,
				activeCustomerId: null,
			})
			.where(
				and(
					eq(teams.dbId, existing.teamDbId),
					eq(teams.activeSubscriptionId, subscriptionId),
					ne(teams.plan, "internal"),
					ne(teams.plan, "enterprise"),
				),
			);

		await recordSubscriptionHistory(
			tx,
			subscription,
			customerId,
			existing.teamDbId,
		);

		logger.info(
			{ teamDbId: existing.teamDbId, subscriptionId },
			"[polar-webhook] Downgraded team to free",
		);
	});
}

function isPostgresError(
	value: unknown,
): value is { code: string; constraint: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		"code" in value &&
		"constraint" in value
	);
}

function isActiveSubscriptionIdViolation(error: unknown): boolean {
	if (!(error instanceof DrizzleQueryError)) return false;
	if (!isPostgresError(error.cause)) return false;
	return (
		error.cause.code === "23505" &&
		error.cause.constraint === "teams_active_subscription_id_unique"
	);
}

async function recordSubscriptionHistory(
	tx: TransactionType,
	subscription: PolarSubscriptionPayload,
	customerId: string,
	teamDbId: number,
) {
	await tx.insert(polarSubscriptionHistories).values({
		teamDbId,
		subscriptionId: subscription.id,
		customerId,
		productId: subscription.productId,
		status: subscription.status,
		currentPeriodEnd: subscription.currentPeriodEnd
			? new Date(subscription.currentPeriodEnd)
			: null,
		metadata: subscription.metadata ?? null,
	});
}

async function createNewProTeam(
	tx: TransactionType,
	subscription: PolarSubscriptionPayload,
	customerId: string,
	userDbId: number,
	teamName: string,
) {
	const [team] = await tx
		.insert(teams)
		.values({
			id: createTeamId(),
			name: teamName,
			plan: "pro",
			activeSubscriptionId: subscription.id,
			activeCustomerId: customerId,
		})
		.returning({ dbId: teams.dbId });

	await tx.insert(teamMemberships).values({
		teamDbId: team.dbId,
		userDbId,
		role: "admin",
	});

	await recordSubscriptionHistory(tx, subscription, customerId, team.dbId);

	logger.info(
		{ teamDbId: team.dbId, subscriptionId: subscription.id },
		"[polar-webhook] Created new pro team",
	);
}

async function upgradeExistingTeam(
	tx: TransactionType,
	subscription: PolarSubscriptionPayload,
	customerId: string,
	teamDbId: number,
) {
	const result = await tx
		.select({ dbId: teams.dbId })
		.from(teams)
		.for("update")
		.where(eq(teams.dbId, teamDbId));

	if (result.length !== 1) {
		throw new Error(`Team not found: ${teamDbId}`);
	}

	await tx
		.update(teams)
		.set({
			plan: "pro",
			activeSubscriptionId: subscription.id,
			activeCustomerId: customerId,
		})
		.where(
			and(
				eq(teams.dbId, teamDbId),
				ne(teams.plan, "internal"),
				ne(teams.plan, "enterprise"),
			),
		);

	await recordSubscriptionHistory(tx, subscription, customerId, teamDbId);

	logger.info(
		{ teamDbId, subscriptionId: subscription.id },
		"[polar-webhook] Upgraded team to pro",
	);
}

async function updateExistingTeam(
	tx: TransactionType,
	subscription: PolarSubscriptionPayload,
	customerId: string,
	teamDbId: number,
) {
	await tx
		.update(teams)
		.set({
			plan: "pro",
			activeSubscriptionId: subscription.id,
			activeCustomerId: customerId,
		})
		.where(
			and(
				eq(teams.dbId, teamDbId),
				ne(teams.plan, "internal"),
				ne(teams.plan, "enterprise"),
			),
		);

	await recordSubscriptionHistory(tx, subscription, customerId, teamDbId);

	logger.info(
		{ teamDbId, subscriptionId: subscription.id },
		"[polar-webhook] Updated existing team (idempotent retry)",
	);
}
