"use server";

import {
  encryptApiKey,
  maskApiKey,
  validateApiKeyFormat,
} from "@repo/backend/ai-keys";
import { RecoderPmRole } from "@repo/backend/auth";
import { currentOrganizationId, currentUser } from "@repo/backend/auth/utils";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";
import { database } from "@/lib/database";

export type AiProvider = "openrouter" | "openai" | "anthropic";

type UpdateAiSettingsInput = {
  provider: AiProvider;
  model?: string;
  apiKey?: string;
};

const validateModelFormat = (provider: AiProvider, model?: string) => {
  const trimmed = model?.trim();

  if (!trimmed) {
    return;
  }

  if (provider === "openrouter" && !trimmed.includes("/")) {
    throw new Error(
      "OpenRouter models should include a provider prefix (example: openai/gpt-4o-mini)."
    );
  }

  if (provider !== "openrouter" && trimmed.includes("/")) {
    throw new Error(
      "OpenAI/Anthropic models should not include a provider prefix."
    );
  }
};

export const updateAiSettings = async ({
  provider,
  model,
  apiKey,
}: UpdateAiSettingsInput): Promise<{ error?: string }> => {
  try {
    const [user, organizationId] = await Promise.all([
      currentUser(),
      currentOrganizationId(),
    ]);

    if (!(user && organizationId)) {
      throw new Error("Not logged in");
    }

    if (user.user_metadata.organization_role !== RecoderPmRole.Admin) {
      throw new Error("You do not have permission to update AI settings");
    }

    validateModelFormat(provider, model);

    if (model && provider !== "openrouter") {
      const prefix = provider === "openai" ? "openai/" : "anthropic/";
      const normalized = model.startsWith(prefix)
        ? model.slice(prefix.length)
        : model;
      model = normalized;
    }

    await database.organization.update({
      where: { id: organizationId },
      data: {
        aiProvider: provider,
        aiModel: model?.trim() || null,
      },
      select: { id: true },
    });

    if (apiKey?.trim()) {
      if (!validateApiKeyFormat(apiKey, provider)) {
        throw new Error("Invalid API key format for selected provider");
      }

      const encryptedKey = encryptApiKey(apiKey.trim());
      const keyPrefix = maskApiKey(apiKey.trim());

      await database.organizationAiProviderKey.upsert({
        where: {
          organizationId_provider: {
            organizationId,
            provider,
          },
        },
        create: {
          organizationId,
          provider,
          encryptedKey,
          keyPrefix,
          isActive: true,
        },
        update: {
          encryptedKey,
          keyPrefix,
          isActive: true,
        },
        select: { id: true },
      });
    }

    revalidatePath("/settings/ai");

    return {};
  } catch (error) {
    const message = parseError(error);

    return { error: message };
  }
};
