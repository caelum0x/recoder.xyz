import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import {
	createCronIngestTrigger,
	processRepository,
} from "@/lib/vector-stores/github";
import { fetchIngestTargets } from "./fetch-ingest-targets";

export const maxDuration = 800;

const bearerPrefix = "Bearer ";

const digest = (value: string) =>
	createHash("sha256").update(value, "utf8").digest();

const isAuthorized = (authHeader: string | null, secret: string) => {
	if (!authHeader?.startsWith(bearerPrefix)) {
		return false;
	}

	const providedSecret = authHeader.slice(bearerPrefix.length).trim();

	if (providedSecret.length === 0) {
		return false;
	}

	return timingSafeEqual(digest(secret), digest(providedSecret));
};

export async function GET(request: NextRequest) {
	const cronSecret = process.env.CRON_SECRET;

	if (!cronSecret) {
		console.error("CRON_SECRET environment variable is not set");
		return new Response("Server misconfigured", { status: 500 });
	}

	const authHeader = request.headers.get("authorization");
	if (!isAuthorized(authHeader, cronSecret)) {
		return new Response("Unauthorized", {
			status: 401,
		});
	}

	const targetGitHubRepositories = await fetchIngestTargets();
	const trigger = createCronIngestTrigger();

	const results = await Promise.allSettled(
		targetGitHubRepositories.map((repo) => processRepository(repo, trigger)),
	);

	const failures = results.filter(
		(r): r is PromiseRejectedResult => r.status === "rejected",
	);
	if (failures.length > 0) {
		for (const failure of failures) {
			console.error("[vector-store-cron] Repository ingest failed:", failure.reason);
		}
		return new Response(
			JSON.stringify({
				ok: false,
				total: results.length,
				failed: failures.length,
			}),
			{ status: 207, headers: { "Content-Type": "application/json" } },
		);
	}

	return new Response("ok", { status: 200 });
}
