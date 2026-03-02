import { createAuth } from "@recoder/auth";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "";

export const auth = createAuth({
  sendMagicLink: async ({ email, url }) => {
    // Use the backend API to send magic link emails
    // This keeps email delivery consistent with the existing Resend setup
    try {
      await fetch(`${backendUrl}/auth/send-magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, url }),
      });
    } catch {
      // Fallback: log the magic link for development
      console.log(`Magic link for ${email}: ${url}`);
    }
  },
  sendResetPassword: async ({ user, url }) => {
    const email = user.email;
    if (!email) return;
    try {
      await fetch(`${backendUrl}/auth/send-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, url }),
      });
    } catch {
      console.log(`Password reset for ${email}: ${url}`);
    }
  },
  sendVerificationEmail: async ({ user, url }) => {
    const email = user.email;
    if (!email) return;
    try {
      await fetch(`${backendUrl}/auth/send-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, url }),
      });
    } catch {
      console.log(`Verification email for ${email}: ${url}`);
    }
  },
});
