import { flag } from "flags/next";

async function safeEdgeConfigGet(key: string): Promise<unknown> {
	try {
		const { get } = await import("@vercel/edge-config");
		return await get(key);
	} catch {
		// Edge Config not available (non-Vercel deployment)
		return undefined;
	}
}

function takeLocalEnv(localEnvironmentKey: string) {
	if (process.env.NODE_ENV !== "development") {
		return false;
	}
	if (
		process.env[localEnvironmentKey] === undefined ||
		process.env[localEnvironmentKey] === "false"
	) {
		return false;
	}
	return true;
}

export const developerFlag = flag<boolean>({
	key: "developer",
	decide() {
		return takeLocalEnv("DEVELOPER_FLAG");
	},
	description: "Enable Developer",
	defaultValue: false,
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const webSearchActionFlag = flag<boolean>({
	key: "web-search-action",
	decide() {
		return takeLocalEnv("WEB_SEARCH_ACTION_FLAG");
	},
	description: "Enable Web Search Action",
	defaultValue: false,
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const layoutV3Flag = flag<boolean>({
	key: "layout-v3",
	async decide() {
		if (process.env.NODE_ENV === "development") {
			return takeLocalEnv("LAYOUT_V3_FLAG");
		}
		const edgeConfig = await safeEdgeConfigGet(`flag__${this.key}`);
		if (edgeConfig === undefined) {
			return false;
		}
		return edgeConfig === true || edgeConfig === "true";
	},
	description: "Enable Layout V3",
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const experimental_storageFlag = flag<boolean>({
	key: "experimental-storage",
	async decide() {
		if (process.env.NODE_ENV === "development") {
			return takeLocalEnv("EXPERIMENTAL_STORAGE_FLAG");
		}
		const edgeConfig = await safeEdgeConfigGet(`flag__${this.key}`);
		if (edgeConfig === undefined) {
			return true;
		}
		return edgeConfig === true || edgeConfig === "true";
	},
	description: "Enable experimental storage",
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const stageV2Flag = flag<boolean>({
	key: "stage-v2",
	async decide() {
		if (process.env.NODE_ENV === "development") {
			return takeLocalEnv("STAGE_V2_FLAG");
		}
		const edgeConfig = await safeEdgeConfigGet(`flag__${this.key}`);
		if (edgeConfig === undefined) {
			return false;
		}
		return edgeConfig === true || edgeConfig === "true";
	},
	description: "Enable stage showcase (Apps page)",
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const aiGatewayFlag = flag<boolean>({
	key: "ai-gateway",
	async decide() {
		if (process.env.NODE_ENV === "development") {
			return takeLocalEnv("AI_GATEWAY_FLAG");
		}
		const edgeConfig = await safeEdgeConfigGet(`flag__${this.key}`);
		if (edgeConfig === undefined) {
			return false;
		}
		return edgeConfig === true || edgeConfig === "true";
	},
	description: "Enable AI Gateway",
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const aiGatewayUnsupportedModelsFlag = flag<boolean>({
	key: "ai-gateway-unsupported-models",
	async decide() {
		if (process.env.NODE_ENV === "development") {
			return takeLocalEnv("AI_GATEWAY_UNSUPPORTED_MODELS_FLAG");
		}
		const edgeConfig = await safeEdgeConfigGet(`flag__${this.key}`);
		if (edgeConfig === undefined) {
			return false;
		}
		return edgeConfig === true || edgeConfig === "true";
	},
	description: "Allow unsupported AI Gateway models",
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
	defaultValue: false,
});

export const googleUrlContextFlag = flag<boolean>({
	key: "google-url-context",
	async decide() {
		if (process.env.NODE_ENV === "development") {
			return takeLocalEnv("GOOGLE_URL_CONTEXT_FLAG");
		}
		const edgeConfig = await safeEdgeConfigGet(`flag__${this.key}`);
		if (edgeConfig === undefined) {
			return false;
		}
		return edgeConfig === true || edgeConfig === "true";
	},
	description: "Enable Google URL Context tool",
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
	defaultValue: false,
});

export const newEditorFlag = flag<boolean>({
	key: "new-editor",
	async decide() {
		if (process.env.NODE_ENV === "development") {
			return takeLocalEnv("NEW_EDITOR_FLAG");
		}
		const edgeConfig = await safeEdgeConfigGet(`flag__${this.key}`);
		if (edgeConfig === undefined) {
			return false;
		}
		return edgeConfig === true || edgeConfig === "true";
	},
	description: "Enable new editor",
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const generateContentNodeFlag = flag<boolean>({
	key: "generate-content-node",
	async decide() {
		if (process.env.NODE_ENV === "development") {
			return takeLocalEnv("GENERATE_CONTENT_NODE_FLAG");
		}
		const edgeConfig = await safeEdgeConfigGet(`flag__${this.key}`);
		if (edgeConfig === undefined) {
			return false;
		}
		return edgeConfig === true || edgeConfig === "true";
	},
	description: "Enable generate content node",
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const privatePreviewToolsFlag = flag<boolean>({
	key: "private-preview-tools",
	async decide() {
		if (process.env.NODE_ENV === "development") {
			return takeLocalEnv("PRIVATE_PREVIEW_TOOLS_FLAG");
		}
		const edgeConfig = await safeEdgeConfigGet(`flag__${this.key}`);
		if (edgeConfig === undefined) {
			return false;
		}
		return edgeConfig === true || edgeConfig === "true";
	},
	description: "Enable private preview tools (PostgreSQL, etc.)",
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
	defaultValue: false,
});

export const studioInteropMvpFlag = flag<boolean>({
	key: "studio-interop-mvp",
	async decide() {
		if (process.env.NODE_ENV === "development") {
			return takeLocalEnv("STUDIO_INTEROP_MVP_FLAG");
		}
		const edgeConfig = await safeEdgeConfigGet(`flag__${this.key}`);
		if (edgeConfig === undefined) {
			return false;
		}
		return edgeConfig === true || edgeConfig === "true";
	},
	description: "Enable Studio interop MVP (delegate/status/timeline)",
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
	defaultValue: false,
});

export type StudioInteropRolloutStage = "internal" | "beta" | "ga" | "off";

function parseBoolLike(value: unknown, fallback = false): boolean {
	if (value === undefined || value === null) return fallback;
	if (typeof value === "boolean") return value;
	const normalized = String(value).trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function parseRolloutStage(value: unknown, fallback: StudioInteropRolloutStage): StudioInteropRolloutStage {
	if (typeof value !== "string") return fallback;
	const normalized = value.trim().toLowerCase();
	if (normalized === "internal" || normalized === "beta" || normalized === "ga" || normalized === "off") {
		return normalized;
	}
	return fallback;
}

function parsePercent(value: unknown, fallback: number): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(100, Math.max(0, Math.round(parsed)));
}

export async function getStudioInteropRolloutConfig(): Promise<{
	mvpFlag: boolean;
	stage: StudioInteropRolloutStage;
	killSwitch: boolean;
	rolloutPercent: number;
}> {
	const mvpFlag = await studioInteropMvpFlag();

	const envStage = process.env.STUDIO_INTEROP_ROLLOUT_STAGE;
	const envKillSwitch = process.env.STUDIO_INTEROP_KILL_SWITCH;
	const envRolloutPercent = process.env.STUDIO_INTEROP_ROLLOUT_PERCENT;

	let stage = parseRolloutStage(envStage, "internal");
	let killSwitch = parseBoolLike(envKillSwitch, false);
	let rolloutPercent = parsePercent(envRolloutPercent, 0);

	if (process.env.NODE_ENV !== "development") {
		const stageConfig = await safeEdgeConfigGet("flag__studio-interop-rollout-stage");
		const killSwitchConfig = await safeEdgeConfigGet("flag__studio-interop-kill-switch");
		const percentConfig = await safeEdgeConfigGet("flag__studio-interop-rollout-percent");
		stage = parseRolloutStage(stageConfig ?? envStage, stage);
		killSwitch = parseBoolLike(killSwitchConfig ?? envKillSwitch, killSwitch);
		rolloutPercent = parsePercent(percentConfig ?? envRolloutPercent, rolloutPercent);
	}

	return {
		mvpFlag,
		stage,
		killSwitch,
		rolloutPercent,
	};
}

/**
 * Unified decision function for the interop feature.
 *
 * Combines the MVP flag, kill switch, rollout stage, and percentage into a
 * single boolean. Use this instead of calling `studioInteropMvpFlag()` directly.
 *
 * Decision logic:
 *  1. Kill switch ON → always disabled
 *  2. Stage "off" → always disabled
 *  3. Stage "ga" → always enabled (general availability)
 *  4. Stage "beta" → enabled by deterministic user bucketing when userId is provided
 *     otherwise enabled when rolloutPercent > 0 (server-safe fallback)
 *  5. Stage "internal" → enabled only if mvpFlag is true (dev/edge-config toggle)
 */
export async function shouldEnableInterop(userId?: string): Promise<boolean> {
	const config = await getStudioInteropRolloutConfig();

	// Hard kill switch overrides everything
	if (config.killSwitch) return false;

	// Stage-based decision
	switch (config.stage) {
		case "off":
			return false;
		case "ga":
			return true;
		case "beta": {
			if (config.rolloutPercent <= 0) return false;
			if (config.rolloutPercent >= 100) return true;
			// Server-safe fallback: expose the route when beta is non-zero.
			if (!userId) {
				return true;
			}
			// Deterministic hash from stable userId.
			const seed = userId;
			let hash = 0;
			for (let i = 0; i < seed.length; i++) {
				hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
			}
			return (Math.abs(hash) % 100) < config.rolloutPercent;
		}
		case "internal":
		default:
			return config.mvpFlag;
	}
}
