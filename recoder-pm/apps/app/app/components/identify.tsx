"use client";

import { identify } from "@repo/analytics/posthog/client";
import { useUser } from "@repo/backend/hooks/use-user";
import { useEffect } from "react";

export const Identify = () => {
  const user = useUser();

  useEffect(() => {
    if (!user || process.env.NODE_ENV === "development") {
      return;
    }

    identify(user.id, {
      email: user.email ?? "",
      name: user.user_metadata?.name ?? "",
    });
  }, [user]);

  return null;
};
