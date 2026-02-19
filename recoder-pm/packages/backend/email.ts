import "server-only";
import { Resend } from "resend";

let resendInstance: Resend | null = null;

const getResend = () => {
  if (!resendInstance) {
    const apiKey = process.env.RESEND_TOKEN ?? process.env.RESEND_API_KEY;
    if (!apiKey) {
      return null;
    }
    resendInstance = new Resend(apiKey);
  }
  return resendInstance;
};

const getFromAddress = () =>
  process.env.RESEND_FROM ?? "Recoder PM <noreply@recoder.xyz>";

export const sendMagicLinkEmail = async (email: string, url: string) => {
  const resend = getResend();

  if (!resend) {
    console.warn(
      "[Auth] RESEND_TOKEN not configured - magic link email not sent"
    );
    return;
  }

  await resend.emails.send({
    from: getFromAddress(),
    to: email,
    subject: "Sign in to Recoder PM",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #111; margin-bottom: 16px;">Sign in to Recoder PM</h2>
        <p style="color: #555; font-size: 16px; line-height: 1.5;">
          Click the link below to sign in to your account. This link expires in 15 minutes.
        </p>
        <a href="${url}" style="display: inline-block; background: #8b5cf6; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0; font-size: 16px;">
          Sign in
        </a>
        <p style="color: #999; font-size: 14px; margin-top: 24px;">
          If you didn't request this link, you can safely ignore this email.
        </p>
      </div>
    `,
  });
};

export const sendSignupEmail = async (email: string, url: string) => {
  const resend = getResend();

  if (!resend) {
    console.warn("[Auth] RESEND_TOKEN not configured - signup email not sent");
    return;
  }

  await resend.emails.send({
    from: getFromAddress(),
    to: email,
    subject: "Confirm your email address for Recoder PM",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #111; margin-bottom: 16px;">Welcome to Recoder PM</h2>
        <p style="color: #555; font-size: 16px; line-height: 1.5;">
          Thanks for signing up! Click the link below to confirm your email and get started. This link expires in 15 minutes.
        </p>
        <a href="${url}" style="display: inline-block; background: #8b5cf6; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0; font-size: 16px;">
          Confirm Email Address
        </a>
        <p style="color: #999; font-size: 14px; margin-top: 24px;">
          If you didn't sign up for Recoder PM, you can safely ignore this email.
        </p>
      </div>
    `,
  });
};

export const sendDataHealthAlertEmail = async ({
  to,
  organizationName,
  issues,
}: {
  to: string;
  organizationName: string;
  issues: string[];
}) => {
  const resend = getResend();

  if (!resend) {
    console.info(
      `[Data Health] Alert for ${organizationName} → ${to}: ${issues.join(" | ")}`
    );
    return;
  }

  const list = issues
    .map((issue) => `<li style="margin-bottom: 8px;">${issue}</li>`)
    .join("");

  await resend.emails.send({
    from: getFromAddress(),
    to,
    subject: `Recoder PM data health alert: ${organizationName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #111; margin-bottom: 12px;">Data health alert</h2>
        <p style="color: #555; font-size: 15px; line-height: 1.5;">
          We detected ingestion issues for <strong>${organizationName}</strong>.
        </p>
        <ul style="color: #444; font-size: 14px; line-height: 1.5; padding-left: 20px;">
          ${list}
        </ul>
        <p style="color: #555; font-size: 14px; margin-top: 20px;">
          Review Data Health in Recoder PM to diagnose and re-sync connectors.
        </p>
      </div>
    `,
  });
};
