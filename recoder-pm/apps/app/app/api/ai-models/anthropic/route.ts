import { decryptApiKey } from "@repo/backend/ai-keys";
import { currentOrganizationId } from "@repo/backend/auth/utils";
import { database } from "@repo/backend/database";
import { NextResponse } from "next/server";

type AnthropicModelsResponse = {
  data?: { id?: string }[];
};

export const GET = async (): Promise<Response> => {
  const organizationId = await currentOrganizationId();

  if (!organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keyRecord = await database.organizationAiProviderKey.findFirst({
    where: {
      organizationId,
      provider: "anthropic",
      isActive: true,
    },
    select: { encryptedKey: true },
  });

  const apiKey =
    (keyRecord ? decryptApiKey(keyRecord.encryptedKey) : null) ?? null;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing organization Anthropic BYOK API key." },
      { status: 400 }
    );
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      next: { revalidate: 60 * 60 * 12 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch Anthropic models" },
        { status: response.status }
      );
    }

    const payload = (await response.json()) as AnthropicModelsResponse;
    const models = (payload.data ?? [])
      .map((model) => model.id)
      .filter((id): id is string => Boolean(id))
      .sort();

    return NextResponse.json(
      { models },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=43200",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch Anthropic models" },
      { status: 500 }
    );
  }
};
