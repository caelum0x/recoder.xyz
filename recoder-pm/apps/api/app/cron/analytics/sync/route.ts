import { syncAllAnalyticsConnectors } from "@repo/backend/analytics-connectors";

export const maxDuration = 300;
export const revalidate = 0;
export const dynamic = "force-dynamic";

export const GET = async (): Promise<Response> => {
  await syncAllAnalyticsConnectors();

  return new Response("OK", { status: 200 });
};
