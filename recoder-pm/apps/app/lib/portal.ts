import { currentOrganizationId } from "@repo/backend/auth/utils";
import type { PortalFeature } from "@repo/backend/prisma/client";
import { env } from "@/env";
import { database } from "@/lib/database";

function normalizeBaseUrl(baseValue: string | undefined, fallback: string): string {
  try {
    return new URL(baseValue || fallback).toString();
  } catch {
    try {
      return new URL(fallback).toString();
    } catch {
      return fallback.startsWith("http") ? fallback : `https://${fallback}`;
    }
  }
}

function toAbsoluteUrl(
  pathname: string,
  baseValue: string | undefined,
  fallback: string
): URL {
  const normalizedBaseUrl = normalizeBaseUrl(baseValue, fallback);

  try {
    return new URL(pathname, normalizedBaseUrl);
  } catch {
    return new URL(pathname, normalizeBaseUrl(undefined, fallback));
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
  portalUrl.hostname = [portal.slug, portalUrl.hostname].filter(Boolean).join(".");

  return portalUrl.toString();
};
