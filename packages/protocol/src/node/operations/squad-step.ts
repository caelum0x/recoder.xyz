import * as z from "zod/v4";

export const SquadStepStrategy = z.enum([
	"all",
	"leader",
	"round-robin",
	"best-match",
]);
export type SquadStepStrategy = z.infer<typeof SquadStepStrategy>;

export const SquadStepContent = z.object({
	type: z.literal("squadStep"),
	squadId: z.string(),
	task: z.string(),
	strategy: SquadStepStrategy,
});
export type SquadStepContent = z.infer<typeof SquadStepContent>;

export const SquadStepContentReference = z.object({
	type: SquadStepContent.shape.type,
});
export type SquadStepContentReference = z.infer<
	typeof SquadStepContentReference
>;
