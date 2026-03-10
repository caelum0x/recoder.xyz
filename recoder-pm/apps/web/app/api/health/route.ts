export const dynamic = "force-dynamic";

export const GET = () =>
  Response.json({
    status: "ok",
    service: "recoder-pm",
    timestamp: new Date().toISOString(),
  });
