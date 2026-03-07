import "server-only";
import { authDatabase as sharedAuthDatabase } from "@recoder/auth";

export const authDatabase: typeof sharedAuthDatabase = sharedAuthDatabase;
