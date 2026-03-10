const SUBSCRIPTION_URL =
	process.env.RECODER_SUBSCRIPTION_URL ||
	"https://recoder.xyz/api/user/subscription";

export interface SubscriptionInfo {
	plan: "free" | "pro" | "enterprise";
	active: boolean;
}

export async function fetchSubscriptionStatus(
	cookieHeader?: string,
): Promise<SubscriptionInfo | null> {
	try {
		const res = await fetch(SUBSCRIPTION_URL, {
			headers: cookieHeader ? { Cookie: cookieHeader } : {},
			next: { revalidate: 300 },
		});
		if (!res.ok) return null;
		return (await res.json()) as SubscriptionInfo;
	} catch {
		return null;
	}
}
