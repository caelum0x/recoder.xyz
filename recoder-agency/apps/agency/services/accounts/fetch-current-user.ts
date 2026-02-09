import { cache } from "react";
import { getCurrentUser } from "@/lib/get-current-user";

/**
 * @deprecated Use `getCurrentUser` from "@/lib/get-current-user" instead.
 */
async function fetchCurrentUser() {
	const user = await getCurrentUser();
	return { dbId: user.dbId, id: user.id };
}

const cachedFetchCurrentUser = cache(fetchCurrentUser);
export { cachedFetchCurrentUser as fetchCurrentUser };
