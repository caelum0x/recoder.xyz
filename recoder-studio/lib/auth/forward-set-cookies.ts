import { cookies } from "next/headers";

type CookieAttrs = {
	domain?: string;
	path?: string;
	httpOnly?: boolean;
	secure?: boolean;
	sameSite?: "strict" | "lax" | "none";
	maxAge?: number;
	expires?: Date;
};

function parseSetCookie(setCookie: string) {
	const parts = setCookie.split(";").map((part) => part.trim());
	const [nameValue, ...attributes] = parts;
	if (!nameValue) {
		return null;
	}

	const separatorIndex = nameValue.indexOf("=");
	if (separatorIndex <= 0) {
		return null;
	}

	const name = nameValue.slice(0, separatorIndex);
	const value = nameValue.slice(separatorIndex + 1);
	const attrs: CookieAttrs = {};

	for (const rawAttr of attributes) {
		const [rawKey, ...rawValueParts] = rawAttr.split("=");
		const key = rawKey.toLowerCase();
		const attrValue = rawValueParts.join("=");

		if (key === "domain" && attrValue) {
			attrs.domain = attrValue;
			continue;
		}

		if (key === "path" && attrValue) {
			attrs.path = attrValue;
			continue;
		}

		if (key === "httponly") {
			attrs.httpOnly = true;
			continue;
		}

		if (key === "secure") {
			attrs.secure = true;
			continue;
		}

		if (key === "samesite" && attrValue) {
			const normalized = attrValue.toLowerCase();
			if (
				normalized === "strict" ||
				normalized === "lax" ||
				normalized === "none"
			) {
				attrs.sameSite = normalized;
			}
			continue;
		}

		if (key === "max-age" && attrValue) {
			const maxAge = Number(attrValue);
			if (Number.isFinite(maxAge)) {
				attrs.maxAge = maxAge;
			}
			continue;
		}

		if (key === "expires" && attrValue) {
			const expires = new Date(attrValue);
			if (!Number.isNaN(expires.getTime())) {
				attrs.expires = expires;
			}
		}
	}

	return { name, value, attrs };
}

export async function forwardSetCookiesFromResponse(response: Response) {
	const cookieStore = await cookies();
	const headers = response.headers as Headers & {
		getSetCookie?: () => string[];
	};
	const setCookieHeaders = headers.getSetCookie?.() ?? [];

	for (const setCookie of setCookieHeaders) {
		const parsed = parseSetCookie(setCookie);
		if (!parsed) {
			continue;
		}

		cookieStore.set(parsed.name, parsed.value, parsed.attrs);
	}
}
