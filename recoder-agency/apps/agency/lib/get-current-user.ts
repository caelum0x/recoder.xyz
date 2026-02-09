import { cache } from "react";
import { getSessionUser } from "./auth/server";

async function _getCurrentUser() {
	const user = await getSessionUser();
	return {
		id: user.id,
		dbId: user.dbId,
		displayName: user.displayName,
		email: user.email,
		avatarUrl: user.avatarUrl,
	};
}

export const getCurrentUser = cache(_getCurrentUser);
