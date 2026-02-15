import { z } from "zod";

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	CHANNEL_GATEWAY_PORT: z.coerce.number().default(4080),
	CHANNEL_GATEWAY_LOG_LEVEL: z
		.enum(["trace", "debug", "info", "warn", "error", "fatal"])
		.default("info"),
	CHANNEL_GATEWAY_PUBLIC_URL: z.string().url().optional(),
	CHANNEL_GATEWAY_AGENCY_URL: z.string().url().optional(),
	CHANNEL_GATEWAY_SHARED_SECRET: z.string().min(1).optional(),
	SLACK_SIGNING_SECRET: z.string().min(1).optional(),
	SLACK_BOT_TOKEN: z.string().min(1).optional(),
	WHATSAPP_VERIFY_TOKEN: z.string().min(1).optional(),
	WHATSAPP_APP_SECRET: z.string().min(1).optional(),
	WHATSAPP_ACCESS_TOKEN: z.string().min(1).optional(),
	WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
	TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
	TELEGRAM_WEBHOOK_SECRET: z.string().min(1).optional(),
	DISCORD_BOT_TOKEN: z.string().min(1).optional(),
	DISCORD_PUBLIC_KEY: z.string().min(1).optional(),
	DISCORD_APPLICATION_ID: z.string().min(1).optional(),
});

export type ChannelGatewayEnv = z.infer<typeof envSchema>;

export const env = envSchema.parse({
	NODE_ENV: process.env.NODE_ENV,
	CHANNEL_GATEWAY_PORT: process.env.CHANNEL_GATEWAY_PORT,
	CHANNEL_GATEWAY_LOG_LEVEL: process.env.CHANNEL_GATEWAY_LOG_LEVEL,
	CHANNEL_GATEWAY_PUBLIC_URL: process.env.CHANNEL_GATEWAY_PUBLIC_URL,
	CHANNEL_GATEWAY_AGENCY_URL: process.env.CHANNEL_GATEWAY_AGENCY_URL,
	CHANNEL_GATEWAY_SHARED_SECRET: process.env.CHANNEL_GATEWAY_SHARED_SECRET,
	SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET,
	SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
	WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
	WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
	WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
	WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
	TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
	TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
	DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
	DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY,
	DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID,
});
