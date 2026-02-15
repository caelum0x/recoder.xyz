import { z } from "zod";

const securitySettingsSchema = z.object({
  two_factor_enabled: z.boolean(),
  session_timeout: z.number(),
  require_password_change: z.boolean(),
  password_change_days: z.number(),
  allowed_ip_addresses: z.array(z.string()),
  block_unknown_devices: z.boolean(),
});

export const securitySettingsGetResponseSchema = z.object({
  success: z.literal(true),
  settings: securitySettingsSchema,
});

export const securitySettingsPutResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

export const twoFactorSetupResponseSchema = z.object({
  success: z.literal(true),
  secret: z.string(),
  qrCodeURL: z.string(),
  message: z.string(),
});

export const twoFactorVerifyResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

export const twoFactorEnableResponseSchema = z.object({
  success: z.literal(true),
  backupCodes: z.array(z.string()).optional(),
  message: z.string(),
});

export const twoFactorDisableResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
});

export function assertSecuritySettingsGetResponse(payload: unknown) {
  return securitySettingsGetResponseSchema.parse(payload);
}

export function assertSecuritySettingsPutResponse(payload: unknown) {
  return securitySettingsPutResponseSchema.parse(payload);
}

export function assertTwoFactorSetupResponse(payload: unknown) {
  return twoFactorSetupResponseSchema.parse(payload);
}

export function assertTwoFactorVerifyResponse(payload: unknown) {
  return twoFactorVerifyResponseSchema.parse(payload);
}

export function assertTwoFactorEnableResponse(payload: unknown) {
  return twoFactorEnableResponseSchema.parse(payload);
}

export function assertTwoFactorDisableResponse(payload: unknown) {
  return twoFactorDisableResponseSchema.parse(payload);
}
