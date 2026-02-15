"use server";

import { RecoderPmRole } from "@repo/backend/auth";
import { authAdmin } from "@repo/backend/auth/server";
import { currentMembers, currentUser } from "@repo/backend/auth/utils";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";

export const updateUserRole = async (
  userId: string,
  role: RecoderPmRole
): Promise<{ error?: string }> => {
  try {
    const user = await currentUser();

    if (!user) {
      throw new Error("User not found");
    }

    if (user.user_metadata.organization_role !== RecoderPmRole.Admin) {
      throw new Error("You are not authorized to update user roles");
    }

    const members = await currentMembers();
    const admins = members.filter(
      (member) => member.user_metadata.organization_role === RecoderPmRole.Admin
    );

    if (admins.length === 1) {
      const [admin] = admins;

      if (admin.id === userId && role !== RecoderPmRole.Admin) {
        throw new Error("There must be at least one admin.");
      }
    }

    await authAdmin.updateUserById(userId, { organizationRole: role });

    revalidatePath("/settings/members");

    return {};
  } catch (error) {
    const message = parseError(error);

    return { error: message };
  }
};
