import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { decryptApiKey } from "./ai-keys";
import { database } from "./database";

const resolveProvider = () => {
  const configured = process.env.AI_PROVIDER?.toLowerCase();

  if (configured === "openrouter") {
    return "openrouter";
  }

  if (configured === "anthropic") {
    return "anthropic";
  }

  if (configured === "openai") {
    return "openai";
  }

  if (process.env.OPENROUTER_API_KEY) {
    return "openrouter";
  }

  return "openai";
};

const openrouterClient = createOpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

const createOpenAiClient = (apiKey?: string) =>
  createOpenAI({
    apiKey: apiKey ?? process.env.OPENAI_API_KEY,
  });

const createOpenRouterClient = (apiKey?: string) =>
  createOpenAI({
    apiKey: apiKey ?? process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
  });

const createAnthropicClient = async (apiKey?: string) => {
  if (!apiKey) {
    return anthropic;
  }

  const sdk = (await import("@ai-sdk/anthropic")) as {
    createAnthropic?: (options: {
      apiKey: string;
    }) => (model: string) => unknown;
  };

  if (sdk.createAnthropic) {
    return sdk.createAnthropic({ apiKey });
  }

  return anthropic;
};

const getOpenAiTextModelName = () =>
  process.env.OPENAI_TEXT_MODEL ?? "gpt-5-nano";

const getOpenRouterTextModelName = () =>
  process.env.OPENROUTER_TEXT_MODEL ?? "openai/gpt-5-nano";

const getAnthropicTextModelName = () => process.env.ANTHROPIC_TEXT_MODEL;

export const getTextModel = (): any => {
  const provider = resolveProvider();

  if (provider === "openrouter") {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not set");
    }

    return openrouterClient(getOpenRouterTextModelName());
  }

  if (provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    const modelName = getAnthropicTextModelName();

    if (!modelName) {
      throw new Error("ANTHROPIC_TEXT_MODEL is not set");
    }

    return anthropic(modelName);
  }

  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  return openai(getOpenAiTextModelName());
};

export const getOrganizationTextModel = async (
  organizationId?: string | null
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
): Promise<any> => {
  if (!organizationId) {
    return getTextModel();
  }

  const organization = await database.organization.findUnique({
    where: { id: organizationId },
    select: {
      aiProvider: true,
      aiModel: true,
      aiProviderKeys: {
        where: { isActive: true },
        select: {
          provider: true,
          encryptedKey: true,
        },
      },
    },
  });

  if (!organization) {
    return getTextModel();
  }

  const provider =
    organization.aiProvider &&
    ["openrouter", "openai", "anthropic"].includes(organization.aiProvider)
      ? organization.aiProvider
      : resolveProvider();
  const aiModel = organization.aiModel;
  const providerKey = organization.aiProviderKeys.find(
    (key) => key.provider === provider
  );
  const apiKey = providerKey ? decryptApiKey(providerKey.encryptedKey) : null;

  if (provider === "openrouter") {
    if (!(apiKey || process.env.OPENROUTER_API_KEY)) {
      throw new Error("OPENROUTER_API_KEY is not set");
    }

    const client = createOpenRouterClient(apiKey ?? undefined);
    return client(aiModel ?? getOpenRouterTextModelName());
  }

  if (provider === "anthropic") {
    if (!(apiKey || process.env.ANTHROPIC_API_KEY)) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    const modelName = aiModel ?? getAnthropicTextModelName();

    if (!modelName) {
      throw new Error("ANTHROPIC_TEXT_MODEL is not set");
    }

    const client = await createAnthropicClient(apiKey ?? undefined);
    return client(modelName);
  }

  if (!(apiKey || process.env.OPENAI_API_KEY)) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const client = createOpenAiClient(apiKey ?? undefined);
  return client(aiModel ?? getOpenAiTextModelName());
};

export const getTranscriptionModel = (): any => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  return openai.transcription(
    process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1"
  );
};
