import "server-only";
import { authDatabase } from "@recoder/auth";
import {
  type AuthCoreUser,
} from "@recoder/auth/session";
import { verifySession } from "@recoder/auth/verify";
import { slugify } from "@repo/lib/slugify";
import { cookies } from "next/headers";
import { database } from "../database";
import type { AuthProfile, User } from "./index";
import { toUser } from "./index";

/**
 * Get the current authenticated user from the session cookie.
 * Returns the User with user_metadata compatibility layer, or null.
 */
export const getSessionUser = async (): Promise<User | null> => {
  const cookieStore = await cookies();
  const session = await verifySession(
    (name) => cookieStore.get(name)?.value ?? null
  );

  if (!session) {
    return null;
  }

  const profile = await ensureProfile(session.user);
  return toUser(session.user, profile);
};

const ensureProfile = async (
  coreUser: AuthCoreUser
): Promise<AuthProfile | null> => {
  const existing = await database.authUser.findUnique({
    where: { id: coreUser.id },
  });

  if (existing) {
    if (
      existing.email !== coreUser.email ||
      existing.name !== coreUser.name ||
      existing.imageUrl !== coreUser.image ||
      existing.emailVerified !== coreUser.emailVerified
    ) {
      return database.authUser.update({
        where: { id: coreUser.id },
        data: {
          email: coreUser.email,
          name: coreUser.name,
          imageUrl: coreUser.image,
          emailVerified: coreUser.emailVerified,
        },
      });
    }

    return existing;
  }

  // Auto-create organization for new users (no "Create workspace" screen)
  const orgName = coreUser.name
    ? `${coreUser.name}'s Workspace`
    : coreUser.email.split("@")[0] + "'s Workspace";

  let slug = slugify(orgName);
  const existingOrg = await database.organization.findFirst({
    where: { slug },
  });
  if (existingOrg) {
    slug = `${slug}-${Math.floor(Math.random() * 1000)}`;
  }

  const newOrg = await database.organization.create({
    data: {
      name: orgName,
      slug,
      featureStatuses: {
        createMany: {
          data: [
            { name: "Backlog", color: "#94a3b8", order: 0, complete: false },
            { name: "In Progress", color: "#f59e0b", order: 1, complete: false },
            { name: "Completed", color: "#22c55e", order: 2, complete: true },
          ],
        },
      },
    },
  });

  return database.authUser.create({
    data: {
      id: coreUser.id,
      email: coreUser.email,
      emailVerified: coreUser.emailVerified,
      name: coreUser.name,
      imageUrl: coreUser.image,
      organizationId: newOrg.id,
      organizationRole: "ADMIN",
    },
  });
};

type UpdateUserInput = {
  organizationId?: string | null;
  organizationRole?: string | null;
  firstName?: string;
  lastName?: string;
  name?: string;
  imageUrl?: string;
};

const toOrganizationRole = (
  role?: string | null
): "ADMIN" | "EDITOR" | "MEMBER" =>
  (role as "ADMIN" | "EDITOR" | "MEMBER") ?? "MEMBER";

const buildCoreUserUpdateData = (data: UpdateUserInput) => ({
  ...(data.name !== undefined && { name: data.name }),
  ...(data.imageUrl !== undefined && { image: data.imageUrl }),
});

const buildAuthUserCreateData = (
  userId: string,
  coreUser: AuthCoreUser,
  data: UpdateUserInput
) => ({
  id: userId,
  email: coreUser.email,
  emailVerified: coreUser.emailVerified,
  name: data.name ?? coreUser.name,
  firstName: data.firstName ?? null,
  lastName: data.lastName ?? null,
  imageUrl: data.imageUrl ?? coreUser.image,
  organizationId: data.organizationId ?? null,
  organizationRole: toOrganizationRole(data.organizationRole),
});

const buildAuthUserUpdateData = (data: UpdateUserInput) => ({
  ...(data.organizationId !== undefined && {
    organizationId: data.organizationId,
  }),
  ...(data.organizationRole !== undefined && {
    organizationRole: toOrganizationRole(data.organizationRole),
  }),
  ...(data.firstName !== undefined && { firstName: data.firstName }),
  ...(data.lastName !== undefined && { lastName: data.lastName }),
  ...(data.name !== undefined && { name: data.name }),
  ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
});

/**
 * Admin-like helpers for managing users via Prisma.
 * Admin-level user management via Prisma (Better Auth).
 */
export const authAdmin = {
  getUserById: async (userId: string): Promise<User | null> => {
    const coreUser = await authDatabase.user.findUnique({
      where: { id: userId },
    });

    if (!coreUser) {
      return null;
    }

    const profile = await ensureProfile(coreUser);
    return toUser(coreUser, profile);
  },

  listUsers: async (options?: { perPage?: number }) => {
    const users = await authDatabase.user.findMany({
      take: options?.perPage ?? 100_000,
      orderBy: { createdAt: "desc" },
    });

    const profiles = await database.authUser.findMany({
      where: { id: { in: users.map((user) => user.id) } },
    });
    const profileMap = new Map(
      profiles.map((profile) => [profile.id, profile])
    );

    return users.map((user) => toUser(user, profileMap.get(user.id) ?? null));
  },

  updateUserById: async (
    userId: string,
    data: UpdateUserInput
  ): Promise<User> => {
    const coreUser = await authDatabase.user.findUnique({
      where: { id: userId },
    });

    if (!coreUser) {
      throw new Error("Shared auth user not found");
    }

    if (data.name !== undefined || data.imageUrl !== undefined) {
      await authDatabase.user.update({
        where: { id: userId },
        data: buildCoreUserUpdateData(data),
      });
    }

    const profile = await database.authUser.upsert({
      where: { id: userId },
      create: buildAuthUserCreateData(userId, coreUser, data),
      update: buildAuthUserUpdateData(data),
    });

    return toUser(coreUser, profile);
  },

  inviteUserByEmail: async (
    email: string,
    data: {
      organizationId: string;
      organizationRole: string;
    }
  ): Promise<User> => {
    const coreUser = await authDatabase.user.upsert({
      where: { email },
      create: {
        id: crypto.randomUUID(),
        email,
        name: email.split("@")[0],
        emailVerified: false,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      update: {},
    });

    const profile = await database.authUser.upsert({
      where: { id: coreUser.id },
      create: {
        id: coreUser.id,
        email: coreUser.email,
        emailVerified: coreUser.emailVerified,
        name: coreUser.name,
        imageUrl: coreUser.image,
        organizationId: data.organizationId,
        organizationRole:
          (data.organizationRole as "ADMIN" | "EDITOR" | "MEMBER") ?? "MEMBER",
      },
      update: {
        email: coreUser.email,
        emailVerified: coreUser.emailVerified,
        name: coreUser.name,
        imageUrl: coreUser.image,
        organizationId: data.organizationId,
        organizationRole:
          (data.organizationRole as "ADMIN" | "EDITOR" | "MEMBER") ?? "MEMBER",
      },
    });

    return toUser(coreUser, profile);
  },

  deleteUser: async (userId: string): Promise<void> => {
    await database.authUser.delete({ where: { id: userId } });
    await authDatabase.user.delete({ where: { id: userId } });
  },
};

/**
 * @deprecated Use getSessionUser() or authAdmin instead.
 * Kept for backwards compatibility during migration.
 */
export const createClient = () => {
  throw new Error(
    "Supabase client is no longer available. Use getSessionUser() or authAdmin instead."
  );
};
