import { database } from "@repo/backend/database";
import { getQueueConnection } from "@repo/queue";
import { NextResponse } from "next/server";

export const GET = async (): Promise<Response> => {
  const checks: Record<string, string> = {
    api: "ok",
  };

  try {
    await database.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (_error) {
    checks.database = "error";
    return NextResponse.json({ status: "error", checks }, { status: 500 });
  }

  try {
    const redis = getQueueConnection();
    await redis.ping();
    checks.redis = "ok";
  } catch (_error) {
    checks.redis = "error";
    return NextResponse.json({ status: "error", checks }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", checks });
};
