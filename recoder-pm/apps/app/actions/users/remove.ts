"use server";

import { RecoderPmRole } from "@repo/backend/auth";
import { authAdmin } from "@repo/backend/auth/server";
import { currentOrganizationId, currentUser } from "@repo/backend/auth/utils";
import { database } from "@repo/backend/database";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";

export const removeUser = async (
  userId: string
): Promise<{ error: string } | { message: string }> => {
  try {
    const [user, organizationId] = await Promise.all([
      currentUser(),
      currentOrganizationId(),
    ]);

    if (!user) {
      throw new Error("User not found");
    }

    if (user.user_metadata.organization_role !== RecoderPmRole.Admin) {
      throw new Error("You are not authorized to delete users");
    }

    if (!organizationId) {
      throw new Error("Not logged in");
    }

    const organization = await database.organization.findFirst({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new Error("Organization not found");
    }

    await authAdmin.updateUserById(userId, {
      organizationId: null,
      organizationRole: RecoderPmRole.Member,
    });

    revalidatePath("/settings/members");

    return { message: "Member removed successfully" };
  } catch (error) {
    const message = parseError(error);

    return { error: message };
  }
};
