import { flag } from "flags/next";

function takeEnvFlag(envKey: string, defaultValue = false): boolean {
	const val = process.env[envKey];
	if (val === undefined || val === "false" || val === "0") {
		return defaultValue;
	}
	return val === "true" || val === "1";
}

export const developerFlag = flag<boolean>({
	key: "developer",
	decide() {
		return takeEnvFlag("DEVELOPER_FLAG");
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
		return takeEnvFlag("WEB_SEARCH_ACTION_FLAG");
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
	decide() {
		return takeEnvFlag("LAYOUT_V3_FLAG");
	},
	description: "Enable Layout V3",
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const experimental_storageFlag = flag<boolean>({
	key: "experimental-storage",
	decide() {
		return takeEnvFlag("EXPERIMENTAL_STORAGE_FLAG", true);
	},
	description: "Enable experimental storage",
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const stageV2Flag = flag<boolean>({
	key: "stage-v2",
	decide() {
		return takeEnvFlag("STAGE_V2_FLAG", true);
	},
	description: "Enable stage showcase (Apps page)",
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const aiGatewayFlag = flag<boolean>({
	key: "ai-gateway",
	decide() {
		return takeEnvFlag("AI_GATEWAY_FLAG");
	},
	description: "Enable AI Gateway",
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const aiGatewayUnsupportedModelsFlag = flag<boolean>({
	key: "ai-gateway-unsupported-models",
	decide() {
		return takeEnvFlag("AI_GATEWAY_UNSUPPORTED_MODELS_FLAG");
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
	decide() {
		return takeEnvFlag("GOOGLE_URL_CONTEXT_FLAG");
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
	decide() {
		return takeEnvFlag("NEW_EDITOR_FLAG");
	},
	description: "Enable new editor",
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const generateContentNodeFlag = flag<boolean>({
	key: "generate-content-node",
	decide() {
		return takeEnvFlag("GENERATE_CONTENT_NODE_FLAG");
	},
	description: "Enable generate content node",
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
});

export const privatePreviewToolsFlag = flag<boolean>({
	key: "private-preview-tools",
	decide() {
		return takeEnvFlag("PRIVATE_PREVIEW_TOOLS_FLAG");
	},
	description: "Enable private preview tools (PostgreSQL, etc.)",
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
	defaultValue: false,
});

export const dataStoreFlag = flag<boolean>({
	key: "data-store",
	decide() {
		return takeEnvFlag("DATA_STORE_FLAG");
	},
	description: "Enable Data Store and Data Query nodes",
	options: [
		{ value: false, label: "disable" },
		{ value: true, label: "Enable" },
	],
	defaultValue: false,
});
