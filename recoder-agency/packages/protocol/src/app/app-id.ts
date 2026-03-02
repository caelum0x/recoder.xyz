import { createIdGenerator } from "@recoder/utils";
import type * as z from "zod/v4";

export const AppId = createIdGenerator("app");
export type AppId = z.infer<typeof AppId.schema>;
