"use server";

import { currentOrganizationId } from "@repo/backend/auth/utils";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";
import { database } from "@/lib/database";

export const acknowledgeContradiction = async (
  id: string
): Promise<{ success: true } | { error: string }> => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    await database.contradiction.update({
      where: { id, organizationId },
      data: {
        status: "acknowledged",
        resolvedAt: new Date(),
      },
      select: { id: true },
    });

    revalidatePath("/insights/contradictions");
    return { success: true };
  } catch (error) {
    return { error: parseError(error) };
  }
};

export const dismissContradiction = async (
  id: string
): Promise<{ success: true } | { error: string }> => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    await database.contradiction.update({
      where: { id, organizationId },
      data: {
        status: "dismissed",
        resolvedAt: new Date(),
      },
      select: { id: true },
    });

    revalidatePath("/insights/contradictions");
    return { success: true };
  } catch (error) {
    return { error: parseError(error) };
  }
};

export const snoozeContradiction = async (
  id: string,
  days: number
): Promise<{ success: true } | { error: string }> => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    const snoozedUntil = new Date();
    snoozedUntil.setDate(snoozedUntil.getDate() + days);

    await database.contradiction.update({
      where: { id, organizationId },
      data: {
        status: "snoozed",
        snoozedUntil,
      },
      select: { id: true },
    });

    revalidatePath("/insights/contradictions");
    return { success: true };
  } catch (error) {
    return { error: parseError(error) };
  }
};

export const reactivateContradiction = async (
  id: string
): Promise<{ success: true } | { error: string }> => {
  try {
    const organizationId = await currentOrganizationId();

    if (!organizationId) {
      throw new Error("Not authenticated");
    }

    await database.contradiction.update({
      where: { id, organizationId },
      data: {
        status: "active",
        snoozedUntil: null,
        resolvedAt: null,
      },
      select: { id: true },
    });

    revalidatePath("/insights/contradictions");
    return { success: true };
  } catch (error) {
    return { error: parseError(error) };
  }
};
