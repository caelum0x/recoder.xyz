import { NextResponse } from "next/server";

type OpenRouterModelsResponse = {
  data?: { id?: string }[];
};

export const GET = async (): Promise<Response> => {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Accept: "application/json" },
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch OpenRouter models" },
        { status: response.status }
      );
    }

    const payload = (await response.json()) as OpenRouterModelsResponse;
    const models = (payload.data ?? [])
      .map((model) => model.id)
      .filter((id): id is string => Boolean(id))
      .sort();

    return NextResponse.json(
      { models },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch OpenRouter models" },
      { status: 500 }
    );
  }
};
