import { Polar } from "@polar-sh/sdk";

let instance: Polar | null = null;

export function getPolar(): Polar {
	if (!instance) {
		const accessToken = process.env.POLAR_ACCESS_TOKEN;
		if (!accessToken) {
			throw new Error("POLAR_ACCESS_TOKEN is not configured");
		}
		instance = new Polar({ accessToken, server: "production" });
	}
	return instance;
}

export const polar: Polar = new Proxy({} as Polar, {
	get(_, prop) {
		return Reflect.get(getPolar(), prop);
	},
});
