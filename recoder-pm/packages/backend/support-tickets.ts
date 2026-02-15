import "server-only";
import { log } from "@repo/observability/log";
import { fetchZendeskTickets } from "@repo/zendesk";
import { decryptApiKey } from "./ai-keys";
import { database } from "./database";
import type { PrismaClient, ZendeskInstallation } from "./prisma/client";

const getSyncStart = (installation: ZendeskInstallation) => {
  if (installation.lastSyncedAt) {
    return Math.floor(installation.lastSyncedAt.getTime() / 1000);
  }

  return Math.floor((Date.now() - 1000 * 60 * 60 * 24 * 7) / 1000);
};

const syncZendeskInstallation = async (
  client: PrismaClient,
  installation: ZendeskInstallation
) => {
  const apiToken = decryptApiKey(installation.encryptedKey);
  const startTime = getSyncStart(installation);

  const { tickets, endTime } = await fetchZendeskTickets({
    subdomain: installation.subdomain,
    email: installation.email,
    apiToken,
    startTime,
  });

  for (const ticket of tickets) {
    const externalId = String(ticket.id);

    const existing = await client.supportTicket.findUnique({
      where: {
        organizationId_source_externalId: {
          organizationId: installation.organizationId,
          source: "ZENDESK",
          externalId,
        },
      },
      select: { id: true },
    });

    if (existing) {
      continue;
    }

    await client.supportTicket.create({
      data: {
        organizationId: installation.organizationId,
        source: "ZENDESK",
        subject: ticket.subject ?? null,
        content: ticket.description ?? "",
        externalId,
        requesterId: ticket.requester_id?.toString() ?? null,
        status: ticket.status ?? null,
        raw: ticket.raw,
        zendeskId: installation.id,
      },
      select: { id: true },
    });
  }

  await client.zendeskInstallation.update({
    where: { id: installation.id },
    data: { lastSyncedAt: new Date(endTime * 1000), status: "ACTIVE" },
    select: { id: true },
  });
};

export const syncZendeskInstallations = async () => {
  const installations = await database.zendeskInstallation.findMany({
    where: { status: { in: ["ACTIVE", "ERROR"] } },
  });

  for (const installation of installations) {
    try {
      await syncZendeskInstallation(database, installation);
    } catch (error) {
      log.error("Zendesk sync failed", error);

      await database.zendeskInstallation.update({
        where: { id: installation.id },
        data: { status: "ERROR" },
        select: { id: true },
      });
    }
  }
};

export const syncZendeskInstallationById = async (installationId: string) => {
  const installation = await database.zendeskInstallation.findUnique({
    where: { id: installationId },
  });

  if (!installation) {
    return;
  }

  await syncZendeskInstallation(database, installation);
};
