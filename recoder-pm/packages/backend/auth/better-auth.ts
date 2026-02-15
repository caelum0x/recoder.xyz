import "server-only";
import { createAuth } from "@recoder/auth";
import { sendMagicLinkEmail } from "../email";

export const auth = createAuth({
  sendMagicLink: async ({ email, url }) => {
    await sendMagicLinkEmail(email, url);
  },
});

export type BetterAuthSession = typeof auth.$Infer.Session;
