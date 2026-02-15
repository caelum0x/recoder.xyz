import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VALID_ENV = {
	DATABASE_URL:
		"postgresql://user:pass@db-pooler.example.com:5432/agency?pgbouncer=true",
	AUTH_DATABASE_URL: "postgresql://user:pass@db.example.com:5432/agency_auth",
	BETTER_AUTH_SECRET: "a-very-strong-random-secret-value",
};

describe("validateEnv", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...originalEnv };
		for (const [key, value] of Object.entries(VALID_ENV)) {
			process.env[key] = value;
		}
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	async function loadValidateEnv() {
		const mod = await import("./env-validation");
		return mod.validateEnv;
	}

	it("passes with valid required vars", async () => {
		const validateEnv = await loadValidateEnv();
		expect(() => validateEnv()).not.toThrow();
	});

	it("throws when DATABASE_URL is missing", async () => {
		delete process.env.DATABASE_URL;
		const validateEnv = await loadValidateEnv();
		expect(() => validateEnv()).toThrow("DATABASE_URL");
	});

	it("throws when BETTER_AUTH_SECRET is missing", async () => {
		delete process.env.BETTER_AUTH_SECRET;
		const validateEnv = await loadValidateEnv();
		expect(() => validateEnv()).toThrow("BETTER_AUTH_SECRET");
	});

	it("throws when BETTER_AUTH_SECRET is a placeholder", async () => {
		process.env.BETTER_AUTH_SECRET = "changeme";
		const validateEnv = await loadValidateEnv();
		expect(() => validateEnv()).toThrow();
	});

	it("throws when BETTER_AUTH_SECRET is too short", async () => {
		process.env.BETTER_AUTH_SECRET = "short";
		const validateEnv = await loadValidateEnv();
		expect(() => validateEnv()).toThrow();
	});

	it("returns typed ServerEnv on success", async () => {
		const validateEnv = await loadValidateEnv();
		const env = validateEnv();
		expect(env.DATABASE_URL).toBe(VALID_ENV.DATABASE_URL);
		expect(env.BETTER_AUTH_SECRET).toBe(VALID_ENV.BETTER_AUTH_SECRET);
	});
});
