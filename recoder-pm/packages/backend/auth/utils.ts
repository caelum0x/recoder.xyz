import { authDatabase } from "@recoder/auth";
import { database } from "../database";
import type { User } from "./index";
import { toUser } from "./index";
import { getSessionUser } from "./server";

export const currentUser = async (): Promise<User | null> => getSessionUser();

export const currentOrganizationId = async (): Promise<string | null> => {
  const user = await currentUser();

  if (!user?.organizationId) {
    return null;
  }

  return user.organizationId;
};

export const getMembers = async (organizationId: string): Promise<User[]> => {
  if (!organizationId) {
    return [];
  }

  const profiles = await database.authUser.findMany({
    where: { organizationId },
  });

  if (!profiles.length) {
    return [];
  }

  const coreUsers = await authDatabase.user.findMany({
    where: { id: { in: profiles.map((profile) => profile.id) } },
  });
  const coreMap = new Map(coreUsers.map((user) => [user.id, user]));

  return profiles.map((profile) =>
    toUser(
      coreMap.get(profile.id) ?? {
        id: profile.id,
        email: profile.email,
        emailVerified: profile.emailVerified,
        name: profile.name,
        image: profile.imageUrl,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
      },
      profile
    )
  );
};

export const currentMembers = async (): Promise<User[]> => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return [];
  }

  return getMembers(organizationId);
};
