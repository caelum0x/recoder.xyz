import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionUserOrNull } from "./auth/server";

async function _getCurrentUser() {
	const user = await getSessionUserOrNull();
	if (!user) {
		redirect("/login");
	}
	return {
		id: user.id,
		dbId: user.dbId,
		displayName: user.displayName,
		email: user.email,
		avatarUrl: user.avatarUrl,
	};
}

export const getCurrentUser = cache(_getCurrentUser);
