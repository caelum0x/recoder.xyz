import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { decryptApiKey } from "./ai-keys";
import { database } from "./database";

const resolveConfiguredProvider = () => {
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

  return "openrouter";
};

const createOpenAiClient = (apiKey?: string) =>
  createOpenAI({
    apiKey,
  });

const createOpenRouterClient = (apiKey?: string) =>
  createOpenAI({
    apiKey,
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
  process.env.OPENAI_TEXT_MODEL ?? "gpt-4o-mini";

const getOpenRouterTextModelName = () =>
  process.env.OPENROUTER_TEXT_MODEL ?? "openai/gpt-4o-mini";

const getAnthropicTextModelName = () => process.env.ANTHROPIC_TEXT_MODEL;

function ensureApiKey(apiKey: string | null, provider: string): string {
  if (!apiKey) {
    throw new Error(`Missing active ${provider} BYOK API key`);
  }
  return apiKey;
}

export const getTextModel = (): any => {
  throw new Error(
    "BYOK is required. Use getOrganizationTextModel() with an organization-scoped provider key."
  );
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
      : (organization.aiProviderKeys[0]?.provider ?? resolveConfiguredProvider());
  const aiModel = organization.aiModel;
  const providerKey = organization.aiProviderKeys.find(
    (key) => key.provider === provider
  );
  const apiKey = providerKey ? decryptApiKey(providerKey.encryptedKey) : null;

  if (provider === "openrouter") {
    const client = createOpenRouterClient(ensureApiKey(apiKey, "openrouter"));
    return client.chat(aiModel ?? getOpenRouterTextModelName());
  }

  if (provider === "anthropic") {
    const modelName = aiModel ?? getAnthropicTextModelName();

    if (!modelName) {
      throw new Error("ANTHROPIC_TEXT_MODEL is not set");
    }

    const client = await createAnthropicClient(ensureApiKey(apiKey, "anthropic"));
    return client(modelName);
  }

  const client = createOpenAiClient(ensureApiKey(apiKey, "openai"));
  return client.chat(aiModel ?? getOpenAiTextModelName());
};

export const getTranscriptionModel = (): any => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  return openai.transcription(
    process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1"
  );
};
