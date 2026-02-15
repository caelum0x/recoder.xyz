import * as v from "valibot";
import { teamIdSchema } from "@/services/teams/validations";
import { getCookie, setCookie } from "./signed-cookie";

const COOKIE_NAME = "giselle-session";

const RecoderStudioSessionSchema = v.object({
	teamId: v.optional(teamIdSchema),
	// used in creating a new pro team flow
	checkoutSessionId: v.optional(v.string()),
});

type RecoderStudioSession = v.InferOutput<typeof RecoderStudioSessionSchema>;

export async function getRecoderStudioSession(): Promise<RecoderStudioSession | null> {
	const rawSession = await getCookie(COOKIE_NAME);
	if (rawSession == null) {
		return null;
	}
	return v.parse(RecoderStudioSessionSchema, rawSession);
}

export async function updateRecoderStudioSession(
	session: Partial<RecoderStudioSession>,
) {
	const currentSession = await getRecoderStudioSession();
	const values = v.parse(RecoderStudioSessionSchema, {
		...currentSession,
		...session,
	});
	await setRecoderStudioSession(values);
}

async function setRecoderStudioSession(session: RecoderStudioSession) {
	await setCookie(COOKIE_NAME, v.parse(RecoderStudioSessionSchema, session));
}

// Backward compatibility aliases for legacy imports.
export const getGiselleSession = getRecoderStudioSession;
export const updateGiselleSession = updateRecoderStudioSession;
