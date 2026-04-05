import { createAuth } from "@recoder/auth";
import { resolveBrowserBackendApiUrl } from '@/lib/runtime-urls';

const getBackendUrl = () => resolveBrowserBackendApiUrl();

export const auth = createAuth({
  sendMagicLink: async ({ email, url }) => {
    // Use the backend API to send magic link emails
    // This keeps email delivery consistent with the existing Resend setup
    try {
      await fetch(`${getBackendUrl()}/auth/send-magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, url }),
      });
    } catch {
      // Fallback: log the magic link for development
      
    }
  },
  sendResetPassword: async ({ user, url }) => {
    const email = user.email;
    if (!email) return;
    try {
      await fetch(`${getBackendUrl()}/auth/send-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, url }),
      });
    } catch {
      
    }
  },
  sendVerificationEmail: async ({ user, url }) => {
    const email = user.email;
    if (!email) return;
    try {
      await fetch(`${getBackendUrl()}/auth/send-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, url }),
      });
    } catch {
      
    }
  },
});
