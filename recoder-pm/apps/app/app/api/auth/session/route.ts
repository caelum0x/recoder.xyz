export const GET = async () => {
  try {
    const { getSessionUser } = await import("@repo/backend/auth/server");
    const user = await getSessionUser();

    return Response.json({
      data: {
        user,
      },
    });
  } catch (error) {
    console.error("Failed to resolve PM auth session:", error);

    return Response.json({
      data: {
        user: null,
      },
    });
  }
};
