"use server";

import { redirect } from "next/navigation";

type AuthError = {
	code: string;
	message: string;
	name: string;
	status: number;
};

/**
 * @deprecated Password reset is no longer available with magic link authentication.
 * Users should use the magic link login flow instead.
 */
// biome-ignore lint/suspicious/useAwait: Server action requires async
export const resetPassword = async (
	_prevState: AuthError | null,
	_formData: FormData,
): Promise<AuthError | null> => {
	redirect("/login");
};
