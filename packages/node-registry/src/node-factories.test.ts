import { isSquadStepNode } from "@recoder/protocol";
import { describe, expect, it } from "vitest";
import { defaultName } from "./node-default-name";
import { cloneNode, createSquadStepNode, nodeFactories } from "./node-factories";

describe("squad step node factory", () => {
	it("creates a configurable squad step node", () => {
		const node = createSquadStepNode();

		expect(isSquadStepNode(node)).toBe(true);
		expect(node.content).toEqual({
			type: "squadStep",
			squadId: "",
			task: "",
			strategy: "all",
		});
		expect(node.inputs).toMatchObject([{ label: "Task", accessor: "task" }]);
		expect(node.outputs).toMatchObject([{ label: "Result", accessor: "result" }]);
		expect(defaultName(node)).toBe("Squad Step");
	});

	it("creates and clones squad steps through the generic factory", () => {
		const node = nodeFactories.create("squadStep");
		if (!isSquadStepNode(node)) {
			throw new Error("expected squad step node");
		}

		node.content.squadId = "squad_build";
		node.content.task = "Ship the branch";
		node.content.strategy = "leader";

		const clone = cloneNode(node).newNode;

		expect(isSquadStepNode(clone)).toBe(true);
		expect(clone.id).not.toBe(node.id);
		expect(clone.content).toEqual(node.content);
		expect(clone.inputs[0]?.id).not.toBe(node.inputs[0]?.id);
		expect(clone.outputs[0]?.id).not.toBe(node.outputs[0]?.id);
	});
});
