import type { Generation, Message } from "@recoder/protocol";

export function getAssistantTextFromGeneration(generation: Generation): string {
	if (!("messages" in generation) || generation.messages === undefined) {
		return "";
	}

	const assistantMessages = (generation.messages as Message[]).filter(
		(message) => message.role === "assistant",
	);

	return assistantMessages
		.map((message) =>
			message.parts
				?.filter(
					(
						part: { type?: string; text?: string },
					): part is { type: "text"; text: string } =>
						part.type === "text" && typeof part.text === "string",
				)
				.map((part: { text: string }) => part.text)
				.join("\n"),
		)
		.filter(Boolean)
		.join("\n\n");
}
