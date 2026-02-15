"use server";
import { RecoderPmRole } from "@repo/backend/auth";
import { authAdmin } from "@repo/backend/auth/server";
import { currentOrganizationId, currentUser } from "@repo/backend/auth/utils";
import { database } from "@repo/backend/database";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";

export const inviteMember = async (
  email: string,
  role: RecoderPmRole
): Promise<
  | {
      error: string;
    }
  | {
      message: string;
    }
> => {
  try {
    const [user, organizationId] = await Promise.all([
      currentUser(),
      currentOrganizationId(),
    ]);

    if (!user) {
      throw new Error("Not logged in");
    }

    if (user.user_metadata.organization_role !== RecoderPmRole.Admin) {
      throw new Error("You are not authorized to invite users");
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

    if (!organization.polarSubscriptionId) {
      throw new Error(
        "You must have a subscription to invite other users. Please upgrade your plan."
      );
    }

    const users = await authAdmin.listUsers();
    const existingMember = users.find((u) => u.email === email);

    if (existingMember) {
      if (existingMember.organizationId === organizationId) {
        throw new Error("This user is already a member of your organization");
      }

      throw new Error("This user is already a member of another organization");
    }

    await authAdmin.inviteUserByEmail(email, {
      organizationId,
      organizationRole: role,
    });

    revalidatePath("/settings/members");

    return { message: "Member invited successfully" };
  } catch (error) {
    const message = parseError(error);

    return { error: message };
  }
};
