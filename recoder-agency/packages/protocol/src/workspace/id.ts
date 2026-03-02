import { createIdGenerator } from "@recoder/utils";
import type * as z from "zod/v4";

export const WorkspaceId = createIdGenerator("wrks");
export type WorkspaceId = z.infer<typeof WorkspaceId.schema>;
