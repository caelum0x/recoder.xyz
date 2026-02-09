type SessionUser = {
	id: string;
	dbId: number;
	displayName: string | null;
	email: string | null;
	avatarUrl: string | null;
};

type SessionResponse = {
	data: {
		user: SessionUser | null;
	};
};

const sessionFallback: SessionResponse = { data: { user: null } };

export const authClient = {
	getSession: async (): Promise<SessionResponse> => {
		try {
			const response = await fetch("/api/auth/session", {
				credentials: "include",
			});

			if (!response.ok) {
				return sessionFallback;
			}

			return (await response.json()) as SessionResponse;
		} catch {
			return sessionFallback;
		}
	},
	signOut: async (): Promise<void> => {
		await fetch("/api/auth/sign-out", {
			method: "POST",
		});
	},
};
