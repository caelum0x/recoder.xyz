import { useEffect, useState } from "react";
import { authClient } from "../auth/client";
import type { User } from "../auth/index";

export const useUser = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const session = await authClient.getSession();

        if (session?.data?.user) {
          const sessionUser = session.data.user as User;
          setUser({
            ...sessionUser,
            createdAt: new Date(sessionUser.createdAt),
            updatedAt: new Date(sessionUser.updatedAt),
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
