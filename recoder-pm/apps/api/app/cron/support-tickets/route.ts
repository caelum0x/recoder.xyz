import { syncZendeskInstallations } from "@repo/backend/support-tickets";

export const maxDuration = 300;
export const revalidate = 0;
export const dynamic = "force-dynamic";

export const GET = async (): Promise<Response> => {
  await syncZendeskInstallations();

  return new Response("OK", { status: 200 });
};
