"use server";

import { authAdmin } from "@repo/backend/auth/server";
import { currentUser } from "@repo/backend/auth/utils";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";

export const updateProfileImage = async (
  imageUrl: string
): Promise<{ error?: string }> => {
  try {
    const user = await currentUser();

    if (!user) {
      throw new Error("User not found");
    }

    await authAdmin.updateUserById(user.id, { imageUrl });

    revalidatePath("/profile");

    return {};
  } catch (error) {
    const message = parseError(error);

    return { error: message };
  }
};
