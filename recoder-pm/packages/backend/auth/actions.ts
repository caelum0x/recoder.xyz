"use server";

import { authDatabase } from "@recoder/auth";
import { database } from "../database";

const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
const baseUrl = `${protocol}://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}`;

export const login = async (
  email: string
): Promise<
  | {
      error: string;
    }
  | {
      success: true;
    }
> => {
  try {
    const existingUser = await authDatabase.user.findUnique({
      where: { email },
    });

    if (!existingUser) {
      return { error: "No account found with that email address." };
    }

    // Create a magic link verification token
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 15); // 15 minutes

    await authDatabase.verification.create({
      data: {
        identifier: email,
        value: token,
        expiresAt,
        updatedAt: new Date(),
      },
    });

    // The magic link URL — auth/confirm route handles verification
    const magicLinkUrl = new URL("/auth/confirm", baseUrl);
    magicLinkUrl.searchParams.set("token", token);
    magicLinkUrl.searchParams.set("email", email);

    const { sendMagicLinkEmail } = await import("../email");
    await sendMagicLinkEmail(email, magicLinkUrl.toString());

    return { success: true };
  } catch {
    return { error: "An unexpected error occurred." };
  }
};

export const signup = async (
  email: string,
  firstName: string | undefined,
  lastName: string | undefined
): Promise<
  | {
      error: string;
    }
  | {
      success: true;
    }
> => {
  try {
    const existingUser = await authDatabase.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return { error: "An account with that email already exists." };
    }

    const name = [firstName, lastName].filter(Boolean).join(" ") || null;

    const coreUser = await authDatabase.user.create({
      data: {
        id: crypto.randomUUID(),
        email,
        name: name ?? email.split("@")[0],
        emailVerified: false,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    await database.authUser.upsert({
      where: { id: coreUser.id },
      create: {
        id: coreUser.id,
        email: coreUser.email,
        emailVerified: coreUser.emailVerified,
        name,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        imageUrl: coreUser.image,
        organizationRole: "MEMBER",
      },
      update: {
        email: coreUser.email,
        emailVerified: coreUser.emailVerified,
        name,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
        imageUrl: coreUser.image,
      },
    });

    // Create a magic link verification token
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 15); // 15 minutes

    await authDatabase.verification.create({
      data: {
        identifier: email,
        value: token,
        expiresAt,
        updatedAt: new Date(),
      },
    });

    const magicLinkUrl = new URL("/auth/confirm", baseUrl);
    magicLinkUrl.searchParams.set("token", token);
    magicLinkUrl.searchParams.set("email", email);

    const { sendSignupEmail } = await import("../email");
    await sendSignupEmail(email, magicLinkUrl.toString());

    return { success: true };
  } catch {
    return { error: "An unexpected error occurred." };
  }
};
