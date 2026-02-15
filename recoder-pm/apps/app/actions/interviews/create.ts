"use server";

import { currentOrganizationId, currentUser } from "@repo/backend/auth/utils";
import { textToContent } from "@repo/editor/lib/tiptap";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";
import { database } from "@/lib/database";

export const createInterview = async (
  title: string,
  transcript: string,
  audioUrl?: string
) => {
  try {
    const [user, organizationId] = await Promise.all([
      currentUser(),
      currentOrganizationId(),
    ]);

    if (!(user && organizationId)) {
      throw new Error("Not logged in");
    }

    const normalizedTranscript = transcript.trim();
    const normalizedAudioUrl = audioUrl?.trim() ?? "";

    if (!(title.trim() && (normalizedTranscript || normalizedAudioUrl))) {
      throw new Error("Title and transcript or audio URL are required");
    }

    const interview = await database.interview.create({
      data: {
        title: title.trim(),
        transcript: textToContent(normalizedTranscript),
        audioUrl: normalizedAudioUrl || null,
        creatorId: user.id,
        organizationId,
      },
      select: { id: true },
    });

    revalidatePath("/interviews");

    return { id: interview.id };
  } catch (error) {
    const message = parseError(error);

    return { error: message };
  }
};
