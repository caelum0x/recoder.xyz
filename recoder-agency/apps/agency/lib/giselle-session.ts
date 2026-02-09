import * as v from "valibot";
import { teamIdSchema } from "@/services/teams/validations";
import { getCookie, setCookie } from "./signed-cookie";

const COOKIE_NAME = "recoder-session";

const SessionSchema = v.object({
	teamId: v.optional(teamIdSchema),
	// used in creating a new pro team flow
	checkoutSessionId: v.optional(v.string()),
});

type RecoderSession = v.InferOutput<typeof SessionSchema>;

export async function getGiselleSession(): Promise<RecoderSession | null> {
	const rawSession = await getCookie(COOKIE_NAME);
	if (rawSession == null) {
		return null;
	}
	return v.parse(SessionSchema, rawSession);
}

export async function updateGiselleSession(session: Partial<RecoderSession>) {
	const currentSession = await getGiselleSession();
	const values = v.parse(SessionSchema, {
		...currentSession,
		...session,
	});
	await setSession(values);
}

async function setSession(session: RecoderSession) {
	await setCookie(COOKIE_NAME, v.parse(SessionSchema, session));
}
