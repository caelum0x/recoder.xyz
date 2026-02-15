import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const getEncryptionKey = () => {
  const secret = process.env.AI_KEY_ENCRYPTION_SECRET;

  if (!secret) {
    throw new Error("AI_KEY_ENCRYPTION_SECRET is not set");
  }

  return createHash("sha256").update(secret).digest();
};

export const encryptApiKey = (apiKey: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(apiKey, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
};

export const decryptApiKey = (payload: string): string => {
  const [ivPart, tagPart, dataPart] = payload.split(".");

  if (!(ivPart && tagPart && dataPart)) {
    throw new Error("Invalid encrypted API key payload");
  }

  const iv = Buffer.from(ivPart, "base64");
  const tag = Buffer.from(tagPart, "base64");
  const encrypted = Buffer.from(dataPart, "base64");
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);

  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
};

export const maskApiKey = (apiKey: string): string => {
  if (apiKey.length <= 10) {
    return `${apiKey.slice(0, 2)}...${apiKey.slice(-2)}`;
  }

  return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`;
};

export const validateApiKeyFormat = (
  apiKey: string,
  provider: string
): boolean => {
  const trimmed = apiKey.trim();

  if (!trimmed || trimmed.length > 500) {
    return false;
  }

  if (provider === "openrouter") {
    return trimmed.startsWith("sk-or-");
  }

  if (provider === "openai") {
    return trimmed.startsWith("sk-");
  }

  if (provider === "anthropic") {
    return trimmed.startsWith("sk-ant-");
  }

  if (provider === "google") {
    return trimmed.startsWith("AIza");
  }

  // Allow unknown providers with basic sanity check
  return trimmed.length >= 8;
};
