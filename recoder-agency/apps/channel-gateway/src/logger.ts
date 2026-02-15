import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
	level: env.CHANNEL_GATEWAY_LOG_LEVEL,
	base: {
		service: "channel-gateway",
	},
});
