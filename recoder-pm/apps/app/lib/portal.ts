import { currentOrganizationId } from "@repo/backend/auth/utils";
import type { PortalFeature } from "@repo/backend/prisma/client";
import { env } from "@/env";
import { database } from "@/lib/database";

function toAbsoluteUrl(pathname: string, baseValue: string | undefined, fallback: string): URL {
  try {
    return new URL(pathname, baseValue || fallback);
  } catch {
    return new URL(pathname, fallback);
  }
}

export const getPortalUrl = async (
  portalId?: PortalFeature["id"]
): Promise<string> => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    throw new Error("Not logged in");
  }

  const portal = await database.portal.findFirst({
    where: { organizationId },
    select: { slug: true },
  });

  if (!portal) {
    throw new Error("No portal found");
  }

  const portalUrl = toAbsoluteUrl(
    portalId ?? "/",
    env.RECODER_PM_PORTAL_URL,
    "https://pm.recoder.xyz/portal"
  );
  portalUrl.hostname = [portal.slug, portalUrl.hostname].join(".");

  return portalUrl.toString();
};
