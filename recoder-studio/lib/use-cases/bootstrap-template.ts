import {
	createDataStoreNode,
	createDocumentVectorStoreNode,
	createGitHubVectorStoreNode,
	createTextGenerationNode,
	createTextNode,
} from "@recoder/node-registry";
import type { Workspace, WorkspaceId } from "@recoder/protocol";
import type {
	AiStudioBlueprintSourceKind,
	AiStudioUseCase,
} from "@recoder/ecosystem-config";
import { resolveWorkflowRequiredSources } from "@recoder/ecosystem-config";
import { openaiLanguageModels } from "@recoder/language-model";
import { giselle } from "@/app/giselle";

function starterBriefText(useCase: AiStudioUseCase): string {
	const blueprint = useCase.workflowBlueprint;
	return [
		`Use case: ${useCase.title}`,
		`Team: ${useCase.targetTeam}`,
		`Summary: ${useCase.summary}`,
		`Flow: ${useCase.automationFlow}`,
		"",
		"Objective:",
		blueprint.objective,
		"",
		"Primary starter prompt:",
		useCase.starterPrompt,
		"",
		"Required sources:",
		...resolveWorkflowRequiredSources(blueprint).map((item) => `- ${item}`),
		"",
		"Simulation checks:",
		...blueprint.simulationChecks.map((item) => `- ${item}`),
		"",
		"Deploy checklist:",
		...blueprint.deployChecklist.map((item) => `- ${item}`),
		"",
		"Success criteria:",
		...blueprint.successCriteria.map((item) => `- ${item}`),
		"",
		`Tags: ${useCase.tags.join(", ")}`,
	].join("\n");
}

function chooseStarterModel() {
	return (
		openaiLanguageModels.find((model) => model.id === "gpt-5-mini") ??
		openaiLanguageModels[0]
	);
}

function createSourceNode(kind: AiStudioBlueprintSourceKind) {
	if (kind === "documentVectorStore") {
		const node = createDocumentVectorStoreNode();
		node.name = "Document Knowledge Source";
		return node;
	}
	if (kind === "githubVectorStore") {
		const node = createGitHubVectorStoreNode();
		node.name = "Code & Repository Source";
		return node;
	}
	const node = createDataStoreNode();
	node.name = "Business & Runtime Data Source";
	return node;
}

export async function applyUseCaseStarterTemplate(args: {
	workspaceId: WorkspaceId;
	useCase: AiStudioUseCase;
}) {
	const workspace = await giselle.getWorkspace(args.workspaceId);
	const starterBriefNode = createTextNode();
	starterBriefNode.name = `${args.useCase.title} Brief`;
	starterBriefNode.content.text = starterBriefText(args.useCase);

	const model = chooseStarterModel();
	const starterAgentNode = createTextGenerationNode(model);
	starterAgentNode.name = `${args.useCase.title} Agent`;
	starterAgentNode.content.prompt = args.useCase.starterPrompt;

	const sourceKinds = Array.from(
		new Set(resolveWorkflowRequiredSources(args.useCase.workflowBlueprint)),
	);
	const sourceNodes = sourceKinds.map((kind) => createSourceNode(kind));
	const starterNodes: Workspace["nodes"] = [
		starterBriefNode,
		starterAgentNode,
		...sourceNodes,
	];

	const startingX = -520;
	const startingY = -100;
	const positionedNodeState = starterNodes.reduce<Workspace["ui"]["nodeState"]>(
		(acc, node, index) => {
			acc[node.id] = {
				position: {
					x: startingX + index * 260,
					y: startingY,
				},
				selected: false,
				tab: "overview",
				showError: false,
				highlighted: false,
			};
			return acc;
		},
		{},
	);

	const updatedWorkspace: Workspace = {
		...workspace,
		name: workspace.name ?? `${args.useCase.title} Workspace`,
		nodes: [...workspace.nodes, ...starterNodes],
		ui: {
			...workspace.ui,
			nodeState: {
				...workspace.ui.nodeState,
				...positionedNodeState,
			},
		},
	};

	return await giselle.updateWorkspace(updatedWorkspace);
}
