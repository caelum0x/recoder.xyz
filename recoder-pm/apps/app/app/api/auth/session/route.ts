import { getSessionUser } from "@repo/backend/auth/server";

export const GET = async () => {
  const user = await getSessionUser();

  return Response.json({
    data: {
      user,
    },
  });
};
