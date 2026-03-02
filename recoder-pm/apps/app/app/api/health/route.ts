import { NextResponse } from "next/server";

export const GET = async (): Promise<Response> => {
  return NextResponse.json({
    status: "ok",
    service: "recoder-pm",
    timestamp: new Date().toISOString(),
  });
};
