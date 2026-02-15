/**
 * User type that is compatible with the old Supabase User type.
 * Provides user_metadata as a computed property so existing code
 * that accesses user.user_metadata.* continues to work unchanged.
 */
export type User = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  organizationId: string | null;
  organizationRole: string;
  createdAt: Date;
  updatedAt: Date;
  user_metadata: {
    name: string | null;
    first_name: string | null;
    last_name: string | null;
    image_url: string | null;
    imageUrl: string | null;
    organization_id: string | null;
    organization_role: string;
  };
};

export type { AuthCoreUser } from "@recoder/auth/session";

export type AuthProfile = {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  organizationId: string | null;
  organizationRole: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Convert the shared auth user + PM profile into our User type
 * with the user_metadata compatibility layer.
 */
export const toUser = (
  coreUser: AuthCoreUser,
  profile: AuthProfile | null
): User => {
  const name = profile?.name ?? coreUser.name ?? null;
  const firstName = profile?.firstName ?? null;
  const lastName = profile?.lastName ?? null;
  const imageUrl = profile?.imageUrl ?? coreUser.image ?? null;
  const organizationId = profile?.organizationId ?? null;
  const organizationRole = profile?.organizationRole ?? "MEMBER";

  return {
    id: coreUser.id,
    email: coreUser.email,
    emailVerified: coreUser.emailVerified,
    name,
    firstName,
    lastName,
    imageUrl,
    organizationId,
    organizationRole,
    createdAt: coreUser.createdAt,
    updatedAt: coreUser.updatedAt,
    user_metadata: {
      name,
      first_name: firstName,
      last_name: lastName,
      image_url: imageUrl,
      imageUrl,
      organization_id: organizationId,
      organization_role: organizationRole,
    },
  };
};

// biome-ignore lint/style/noEnum: legacy enum
export enum RecoderPmRole {
  Admin = "ADMIN",
  Editor = "EDITOR",
  Member = "MEMBER",
}
