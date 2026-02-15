#!/usr/bin/env node --experimental-strip-types

import { pathToFileURL } from "node:url";

interface Connection {
	readonly id: string;
	readonly sourceNodeId: string;
	readonly targetNodeId: string;
}

interface NodeContent {
	readonly type: string;
	readonly prompt?: string;
	readonly text?: string;
}

interface Node {
	readonly id: string;
	readonly name: string;
	readonly type: string;
	readonly inputs: readonly unknown[];
	readonly outputs: readonly unknown[];
	readonly content: NodeContent;
}

interface UIState {
	readonly nodeState?: Record<string, unknown>;
	readonly [key: string]: unknown;
}

interface Workspace {
	readonly id: string;
	readonly name: string;
	readonly schemaVersion: string;
	readonly nodes: readonly Node[];
	readonly connections: readonly Connection[];
	readonly ui?: UIState;
}

class WorkspaceProcessingError extends Error {
	constructor(message: string, cause?: Error) {
		super(message);
		this.name = "WorkspaceProcessingError";
		this.cause = cause;
	}
}

class InvalidJSONError extends WorkspaceProcessingError {
	constructor(cause: Error) {
		super("Invalid JSON format in workspace data", cause);
		this.name = "InvalidJSONError";
	}
}

const createNodeIdentifier = (node: Node): string =>
	`id: ${node.id}, name: ${node.name}`;

const stripNodeContent = (node: Node): Node => ({
	...node,
	content: {
		...node.content,
		...(node.content.prompt !== undefined && {
			prompt: createNodeIdentifier(node),
		}),
		...(node.content.text !== undefined && {
			text: createNodeIdentifier(node),
		}),
	},
});

const stripUIState = (ui: UIState | undefined): UIState | undefined =>
	ui ? { ...ui, nodeState: {} } : undefined;

const stripWorkspace = (workspace: Workspace): Workspace => ({
	...workspace,
	nodes: workspace.nodes.map(stripNodeContent),
	ui: stripUIState(workspace.ui),
});

const parseWorkspace = (input: string): Workspace => {
	try {
		return JSON.parse(input) as Workspace;
	} catch (error) {
		throw new InvalidJSONError(error as Error);
	}
};

const readStdin = async (): Promise<string> => {
	process.stdin.setEncoding("utf8");
	let data = "";

	for await (const chunk of process.stdin) {
		data += chunk;
	}

	return data;
};

const processWorkspace = async (): Promise<string> => {
	const inputData = await readStdin();
	const workspace = parseWorkspace(inputData);
	const strippedWorkspace = stripWorkspace(workspace);

	return JSON.stringify(strippedWorkspace, null, 2);
};

const handleError = (error: unknown): never => {
	const message =
		error instanceof Error ? error.message : "Unknown error occurred";
	console.error("Error:", message);
	process.exit(1);
};

async function main(): Promise<void> {
	try {
		const result = await processWorkspace();
		console.log(result);
	} catch (error) {
		handleError(error);
	}
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}

export type { Workspace, Node, Connection, NodeContent, UIState };
