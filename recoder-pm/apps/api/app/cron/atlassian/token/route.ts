import { createClient } from "@repo/atlassian";
import { database } from "@repo/backend/database";
import { log } from "@repo/observability/log";
import { NextResponse } from "next/server";

export const maxDuration = 300;
export const revalidate = 0;
export const dynamic = "force-dynamic";

export const GET = async (): Promise<Response> => {
  const installations = await database.atlassianInstallation.findMany({
    select: {
      id: true,
      organizationId: true,
      accessToken: true,
      email: true,
      siteUrl: true,
    },
  });

  if (!installations.length) {
    return NextResponse.json({ message: "No Atlassian installations." });
  }

  let verified = 0;
  let failed = 0;

  for (const installation of installations) {
    try {
      const atlassian = createClient(installation);
      const response = await atlassian.GET("/rest/api/2/myself");

      if (response.error) {
        failed += 1;
        log.warn("Atlassian token check failed", {
          installationId: installation.id,
          organizationId: installation.organizationId,
        });
        continue;
      }

      verified += 1;
    } catch (error) {
      failed += 1;
      log.error("Atlassian token check crashed", {
        installationId: installation.id,
        organizationId: installation.organizationId,
        error,
      });
    }
  }

  return NextResponse.json({
    message: "Atlassian token check complete.",
    total: installations.length,
    verified,
    failed,
  });
};
