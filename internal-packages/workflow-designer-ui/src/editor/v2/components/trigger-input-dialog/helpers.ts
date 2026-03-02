import type { Trigger, TriggerNode } from "@recoder/protocol";
import {
	githubEvents,
	githubEventToInputFields,
} from "@recoder/trigger-registry";

export function buttonLabel(node: TriggerNode) {
	switch (node.content.provider) {
		case "manual":
			return "Start Manual Flow";
		case "github":
			return "Test with Dummy Data";
		case "whatsapp":
		case "slack":
			return "Run Trigger";
		default: {
			throw new Error(
				`Unhandled trigger provider type: ${String(node.content.provider)}`,
			);
		}
	}
}

export interface FormInput {
	name: string;
	label: string;
	type: "text" | "multiline-text" | "number";
	required: boolean;
}

export function createInputsFromTrigger(
	trigger: Trigger | undefined,
): FormInput[] {
	if (trigger === undefined) {
		return [];
	}

	switch (trigger.configuration.provider) {
		case "github": {
			const eventId = String((trigger.configuration.event as { id?: unknown }).id);
			if (!(eventId in githubEvents)) {
				return [];
			}
			const githubEvent = githubEvents[eventId as keyof typeof githubEvents];
			return githubEventToInputFields(githubEvent).map((item) => ({
				name: item.key,
				label: item.label,
				type: item.type,
				required: !item.optional,
			}));
		}
		case "manual": {
			return trigger.configuration.event.parameters.map(
				(parameter: {
					id: string;
					name: string;
					type: "text" | "multiline-text" | "number";
					required: boolean;
				}) => ({
					name: parameter.id,
					label: parameter.name,
					type: parameter.type,
					required: parameter.required,
				}),
			);
		}
		default: {
			throw new Error(
				`Unhandled provider: ${String((trigger.configuration as { provider?: string }).provider ?? "unknown")}`,
			);
		}
	}
}

export function parseFormInputs(inputs: FormInput[], formData: FormData) {
	const errors: Record<string, string> = {};
	const values: Record<string, string | number> = {};

	for (const input of inputs) {
		const formDataEntryValue = formData.get(input.name);
		const value = formDataEntryValue
			? formDataEntryValue.toString().trim()
			: "";

		if (input.required && value === "") {
			errors[input.name] = `${input.label} is required`;
			continue;
		}

		if (value === "") {
			values[input.name] = "";
			continue;
		}

		switch (input.type) {
			case "text":
			case "multiline-text":
				values[input.name] = value;
				break;
			case "number": {
				const numValue = Number(value);
				if (Number.isNaN(numValue)) {
					errors[input.name] = `${input.label} must be a valid number`;
				} else {
					values[input.name] = numValue;
				}
				break;
			}
			default: {
				throw new Error(`Unhandled input type: ${String(input.type)}`);
			}
		}
	}

	return { errors, values };
}
