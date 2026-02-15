import "server-only";
import { createAuth } from "@recoder/auth";
import { sendEmail } from "@/services/external/email/send-email";

export const auth = createAuth({
	sendMagicLink: async ({ email, url }) => {
		await sendEmail(
			"Sign in to Recoder Agency",
			`Click the link below to sign in:\n\n${url}\n\nIf you did not request this, you can safely ignore this email.`,
			[{ userDisplayName: email.split("@")[0], userEmail: email }],
			{
				html: [
					"<h2>Sign in to Recoder Agency</h2>",
					`<p>Click the link below to sign in:</p>`,
					`<p><a href="${url}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;">Sign in</a></p>`,
					`<p style="color:#6b7280;font-size:14px;">Or copy this URL: ${url}</p>`,
					`<p style="color:#6b7280;font-size:12px;">If you did not request this, you can safely ignore this email.</p>`,
				].join("\n"),
			},
		);
	},
});
