import "server-only";
import { database } from "./database";

const buildInstructionBlock = (prompt: string) =>
  ["Organization instructions:", prompt.trim()].join("\n");

export const getOrganizationAiPrompt = async (
  organizationId?: string | null
): Promise<string | null> => {
  if (!organizationId) {
    return null;
  }

  const organization = await database.organization.findUnique({
    where: { id: organizationId },
    select: { aiPrompt: true },
  });

  const prompt = organization?.aiPrompt?.trim() ?? "";

  return prompt.length > 0 ? prompt : null;
};

export const withOrganizationSystemPrompt = async (
  organizationId: string | null | undefined,
  system: string
) => {
  const prompt = await getOrganizationAiPrompt(organizationId);

  if (!prompt) {
    return system;
  }

  return [system.trim(), "", buildInstructionBlock(prompt)].join("\n");
};

export const withOrganizationUserPrompt = async (
  organizationId: string | null | undefined,
  prompt: string
) => {
  const organizationPrompt = await getOrganizationAiPrompt(organizationId);

  if (!organizationPrompt) {
    return prompt;
  }

  return [buildInstructionBlock(organizationPrompt), "", prompt.trim()].join(
    "\n"
  );
};
