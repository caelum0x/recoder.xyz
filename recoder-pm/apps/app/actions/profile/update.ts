"use server";

import { currentUser } from "@repo/backend/auth/utils";
import { database } from "@repo/backend/database";
import { parseError } from "@repo/lib/parse-error";

export const updateProfile = async (data: {
  firstName: string;
  lastName: string;
  email?: string;
}): Promise<{ error?: string }> => {
  try {
    const user = await currentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    const name =
      [data.firstName, data.lastName].filter(Boolean).join(" ") || null;

    await database.authUser.update({
      where: { id: user.id },
      data: {
        firstName: data.firstName || null,
        lastName: data.lastName || null,
        name,
        ...(data.email ? { email: data.email } : {}),
      },
    });

    return {};
  } catch (error) {
    const message = parseError(error);

    return { error: message };
  }
};
