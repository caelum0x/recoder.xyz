import { authClient as sharedAuthClient } from "@recoder/auth/client";

export const authClient = sharedAuthClient;

/**
 * @deprecated Use authClient from @recoder/auth/client instead.
 */
export const createClient = () => {
  throw new Error(
    "Supabase client is no longer available. Use authClient instead."
  );
};
