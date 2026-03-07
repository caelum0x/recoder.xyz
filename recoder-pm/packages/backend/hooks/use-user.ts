import { useEffect, useState } from "react";
import { authClient } from "../auth/client";
import { type User, RecoderPmRole } from "../auth/index";

export const useUser = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const session = await authClient.getSession();

        if (session?.data?.user) {
          const sessionUser = session.data.user;
          const now = new Date();
          setUser({
            id: sessionUser.id,
            email: sessionUser.email,
            emailVerified: sessionUser.emailVerified,
            name: sessionUser.name ?? null,
            firstName: null,
            lastName: null,
            imageUrl: sessionUser.image ?? null,
            organizationId: null,
            organizationRole: RecoderPmRole.Member,
            createdAt: now,
            updatedAt: now,
            user_metadata: {
              name: sessionUser.name ?? null,
              first_name: null,
              last_name: null,
              image_url: sessionUser.image ?? null,
              imageUrl: sessionUser.image ?? null,
              organization_id: null,
              organization_role: RecoderPmRole.Member,
            },
          });
        }
      } catch (error) {
        console.error("Failed to fetch user session:", error);
      }
    };
    fetchUser();
  }, []);

  return user;
};
