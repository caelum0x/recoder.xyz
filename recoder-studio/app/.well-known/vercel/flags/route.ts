import { createFlagsDiscoveryEndpoint, getProviderData } from "flags/next";
import {
	aiGatewayFlag,
	aiGatewayUnsupportedModelsFlag,
	developerFlag,
	experimental_storageFlag,
	generateContentNodeFlag,
	googleUrlContextFlag,
	layoutV3Flag,
	newEditorFlag,
	privatePreviewToolsFlag,
	stageV2Flag,
	studioInteropMvpFlag,
	webSearchActionFlag,
} from "../../../../flags";

const flagDefinitions = {
	developerFlag,
	webSearchActionFlag,
	layoutV3Flag,
	experimental_storageFlag,
	stageV2Flag,
	aiGatewayFlag,
	aiGatewayUnsupportedModelsFlag,
	googleUrlContextFlag,
	newEditorFlag,
	generateContentNodeFlag,
	privatePreviewToolsFlag,
	studioInteropMvpFlag,
};

export const runtime = "edge";
export const dynamic = "force-dynamic"; // defaults to auto

// This function handles the authorization check for you
export const GET = createFlagsDiscoveryEndpoint(async (_request) => {
	// Get provider data for feature flags
	const apiData = await getProviderData(flagDefinitions);

	// Return the ApiData directly, without a NextResponse.json object
	return apiData;
});
