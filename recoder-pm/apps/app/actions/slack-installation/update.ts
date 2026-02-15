"use server";

import { parseError } from "@repo/lib/src/parse-error";
import { database } from "@/lib/database";

export const updateSlackInstallation = async (
  id: string,
  data: { dataHealthAlertsEnabled?: boolean }
): Promise<
  | {
      error: string;
    }
  | {
      success: true;
    }
> => {
  try {
    const installation = await database.slackInstallation.findFirst({
      where: { id },
      select: { id: true },
    });

    if (!installation) {
      throw new Error("Slack installation not found");
    }

    await database.slackInstallation.update({
      where: { id },
      data: {
        ...(data.dataHealthAlertsEnabled !== undefined && {
          dataHealthAlertsEnabled: data.dataHealthAlertsEnabled,
        }),
      },
      select: { id: true },
    });

    return {
      success: true,
    };
  } catch (error) {
    const message = parseError(error);

    return { error: message };
  }
};
