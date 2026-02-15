import { runDataHealthAlerts } from "@repo/backend/data-health-alerts";

export const maxDuration = 300;
export const revalidate = 0;
export const dynamic = "force-dynamic";

export const GET = async (): Promise<Response> => {
  await runDataHealthAlerts();

  return new Response("OK", { status: 200 });
};
