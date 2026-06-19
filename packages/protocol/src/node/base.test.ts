import { expect, test } from "vitest";
import { isSquadStepNode, Node } from ".";

test("should parse operation node with required inputs correctly", () => {
	const parse = Node.safeParse({
		id: "nd-HgwthAQztKwwJzQ9",
		name: "Create Issue Comment",
		type: "operation",
		inputs: [
			{
				id: "inp-NnAVaRCdioDX0Jnb",
				label: "body",
				isRequired: true,
				accessor: "body",
			},
		],
		outputs: [],
		content: {
			type: "action",
			command: {
				provider: "github",
				state: {
					status: "configured",
					commandId: "github.create.issueComment",
					installationId: 65591132,
					repositoryNodeId: "R_kgDONFn3Nw",
				},
			},
		},
	});
	expect(parse.success).toBeTruthy();
	if (parse.success) {
		expect(parse.data.inputs[0].isRequired).toBe(true);
	}
});

test("should parse squad step operation node", () => {
	const parse = Node.safeParse({
		id: "nd-HgwthAQztKwwJzQ9",
		name: "Dispatch Build Squad",
		type: "operation",
		inputs: [
			{
				id: "inp-NnAVaRCdioDX0Jnb",
				label: "Task",
				accessor: "task",
			},
		],
		outputs: [
			{
				id: "otp-NnAVaRCdioDX0Jnb",
				label: "Result",
				accessor: "result",
			},
		],
		content: {
			type: "squadStep",
			squadId: "squad_build",
			task: "Fix the failing tests",
			strategy: "leader",
		},
	});

	expect(parse.success).toBeTruthy();
	if (parse.success) {
		expect(isSquadStepNode(parse.data)).toBe(true);
		expect(parse.data.content.type).toBe("squadStep");
	}
});
