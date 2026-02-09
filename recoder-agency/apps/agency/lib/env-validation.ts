const REQUIRED_VARS = ["DATABASE_URL", "BETTER_AUTH_SECRET"] as const;

const RECOMMENDED_VARS = [
	"BETTER_AUTH_URL",
	"COOKIE_SECRET",
	"TOKEN_ENCRYPTION_KEY",
] as const;

const PLACEHOLDER_PATTERNS = [
	/^changeme$/i,
	/^placeholder$/i,
	/^xxx+$/i,
	/^todo$/i,
	/^replace.?me$/i,
	/^your[_-]?secret$/i,
	/^secret$/i,
	/^password$/i,
];

const SECRET_VARS = [
	"BETTER_AUTH_SECRET",
	"COOKIE_SECRET",
	"TOKEN_ENCRYPTION_KEY",
	"STRIPE_SECRET_KEY",
] as const;

const MIN_SECRET_LENGTH = 16;

export function validateEnv(): void {
	const missing: string[] = [];

	for (const key of REQUIRED_VARS) {
		if (!process.env[key]) {
			missing.push(key);
		}
	}

	if (missing.length > 0) {
		throw new Error(
			`[env-validation] Missing required environment variables: ${missing.join(", ")}. ` +
				"See apps/agency/.env.example for reference.",
		);
	}

	const recommended: string[] = [];

	for (const key of RECOMMENDED_VARS) {
		if (!process.env[key]) {
			recommended.push(key);
		}
	}

	if (recommended.length > 0) {
		console.warn(
			`[env-validation] Recommended environment variables not set: ${recommended.join(", ")}. ` +
				"The app will start, but some features may not work correctly.",
		);
	}
}

export function checkSecretHygiene(): void {
	for (const key of SECRET_VARS) {
		const value = process.env[key];
		if (!value) continue;

		if (value.length < MIN_SECRET_LENGTH) {
			console.warn(
				`[env-validation] ${key} is shorter than ${MIN_SECRET_LENGTH} characters. Use a strong, randomly generated value.`,
			);
		}

		for (const pattern of PLACEHOLDER_PATTERNS) {
			if (pattern.test(value)) {
				console.warn(
					`[env-validation] ${key} looks like a placeholder ("${value}"). Replace it with a real secret before deploying.`,
				);
				break;
			}
		}
	}
}
