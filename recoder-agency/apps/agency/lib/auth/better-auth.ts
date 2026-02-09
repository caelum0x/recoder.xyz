import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: {
			user: schema.users,
			session: schema.authSessions,
			account: schema.authAccounts,
			verification: schema.authVerifications,
		},
	}),
	secret: process.env.BETTER_AUTH_SECRET,
	baseURL: process.env.BETTER_AUTH_URL,
	emailAndPassword: {
		enabled: false,
	},
	plugins: [
		magicLink({
			sendMagicLink: async ({ email, url }) => {
				// TODO: implement email sending via Resend/nodemailer
				console.log(`Magic link for ${email}: ${url}`);
			},
		}),
	],
	socialProviders: {
		...(process.env.GITHUB_APP_CLIENT_ID && process.env.GITHUB_APP_CLIENT_SECRET
			? {
					github: {
						clientId: process.env.GITHUB_APP_CLIENT_ID,
						clientSecret: process.env.GITHUB_APP_CLIENT_SECRET,
					},
				}
			: {}),
		...(process.env.GOOGLE_OAUTH_CLIENT_ID &&
		process.env.GOOGLE_OAUTH_CLIENT_SECRET
			? {
					google: {
						clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
						clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
					},
				}
			: {}),
	},
	user: {
		modelName: "user",
		additionalFields: {
			displayName: {
				type: "string",
				required: false,
				fieldName: "displayName",
			},
			avatarUrl: {
				type: "string",
				required: false,
				fieldName: "avatarUrl",
			},
			dbId: {
				type: "number",
				required: false,
				fieldName: "dbId",
				input: false,
			},
		},
	},
	session: {
		modelName: "authSession",
	},
	account: {
		modelName: "authAccount",
	},
	verification: {
		modelName: "authVerification",
	},
});
