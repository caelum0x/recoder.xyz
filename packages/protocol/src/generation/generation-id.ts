import { createIdGenerator } from "@recoder/utils";
import type z from "zod/v4";

export const GenerationId = createIdGenerator("gnr");
export type GenerationId = z.infer<typeof GenerationId.schema>;
