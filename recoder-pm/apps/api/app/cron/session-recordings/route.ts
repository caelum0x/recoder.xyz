import { syncSessionRecordingInsights } from "@repo/backend/session-recordings";

export const maxDuration = 300;
export const revalidate = 0;
export const dynamic = "force-dynamic";

export const GET = async (): Promise<Response> => {
  await syncSessionRecordingInsights();

  return new Response("OK", { status: 200 });
};
