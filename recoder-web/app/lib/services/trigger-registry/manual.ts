import { z } from 'zod';
import type { InputData, ManualTriggerPayload } from './types';

/**
 * Manual trigger event definition
 */
export const manualTriggerEvent = {
  id: 'manual.trigger',
  label: 'Manual Trigger',
  payload: z.object({
    triggeredBy: z.string(),
    triggeredAt: z.string(),
    parameters: z.record(z.unknown()).optional(),
  }),
  meta: {
    triggeredBy: { label: 'Triggered By' },
    triggeredAt: { label: 'Triggered At' },
    parameters: { label: 'Custom Parameters' },
  },
};

/**
 * Schema for manual trigger configuration
 */
export const ManualTriggerConfigSchema = z.object({
  /**
   * Custom parameters that can be passed when triggering manually
   */
  parameters: z
    .array(
      z.object({
        key: z.string().min(1, 'Parameter key is required'),
        label: z.string().optional(),
        type: z.enum(['text', 'number', 'boolean', 'json']).default('text'),
        required: z.boolean().default(false),
        defaultValue: z.unknown().optional(),
        description: z.string().optional(),
      })
    )
    .default([]),

  /**
   * Whether to require confirmation before triggering
   */
  requireConfirmation: z.boolean().default(false),

  /**
   * Description shown when triggering manually
   */
  description: z.string().optional(),
});

export type ManualTriggerConfig = z.infer<typeof ManualTriggerConfigSchema>;

/**
 * Schema for manual trigger invocation
 */
export const ManualTriggerInvocationSchema = z.object({
  /**
   * ID of the user triggering the action
   */
  userId: z.string(),

  /**
   * Custom parameters provided by the user
   */
  parameters: z.record(z.unknown()).optional(),

  /**
   * Optional metadata about the invocation
   */
  metadata: z
    .object({
      source: z.enum(['ui', 'api', 'cli', 'schedule']).optional(),
      userAgent: z.string().optional(),
      ip: z.string().optional(),
    })
    .optional(),
});

export type ManualTriggerInvocation = z.infer<typeof ManualTriggerInvocationSchema>;

/**
 * Create a manual trigger payload from an invocation
 */
export function createManualTriggerPayload(invocation: ManualTriggerInvocation): ManualTriggerPayload {
  return {
    triggeredBy: invocation.userId,
    triggeredAt: new Date().toISOString(),
    parameters: invocation.parameters,
  };
}

/**
 * Validate manual trigger parameters against a configuration
 */
export function validateManualTriggerParameters(
  config: ManualTriggerConfig,
  parameters: Record<string, unknown> = {}
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const param of config.parameters) {
    const value = parameters[param.key];

    // Check required parameters
    if (param.required && (value === undefined || value === null || value === '')) {
      errors.push(`Parameter "${param.label || param.key}" is required`);
      continue;
    }

    // Skip validation for optional empty values
    if (value === undefined || value === null) {
      continue;
    }

    // Type validation
    switch (param.type) {
      case 'number':
        if (typeof value !== 'number' && isNaN(Number(value))) {
          errors.push(`Parameter "${param.label || param.key}" must be a number`);
        }
        break;

      case 'boolean':
        if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
          errors.push(`Parameter "${param.label || param.key}" must be a boolean`);
        }
        break;

      case 'json':
        if (typeof value === 'string') {
          try {
            JSON.parse(value);
          } catch {
            errors.push(`Parameter "${param.label || param.key}" must be valid JSON`);
          }
        }
        break;

      case 'text':
      default:
        if (typeof value !== 'string' && typeof value !== 'number') {
          errors.push(`Parameter "${param.label || param.key}" must be a string`);
        }
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Convert manual trigger config parameters to input fields for UI rendering
 */
export function manualTriggerConfigToInputFields(config: ManualTriggerConfig): InputData[] {
  return config.parameters.map((param) => ({
    key: param.key,
    label: param.label || param.key,
    optional: !param.required,
    type: param.type === 'number' ? 'number' : param.type === 'json' ? 'multiline-text' : 'text',
  }));
}

/**
 * Coerce manual trigger parameters to their expected types
 */
export function coerceManualTriggerParameters(
  config: ManualTriggerConfig,
  parameters: Record<string, unknown> = {}
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const param of config.parameters) {
    const value = parameters[param.key];

    if (value === undefined || value === null) {
      if (param.defaultValue !== undefined) {
        result[param.key] = param.defaultValue;
      }
      continue;
    }

    switch (param.type) {
      case 'number':
        result[param.key] = typeof value === 'number' ? value : Number(value);
        break;

      case 'boolean':
        result[param.key] = typeof value === 'boolean' ? value : value === 'true';
        break;

      case 'json':
        result[param.key] = typeof value === 'string' ? JSON.parse(value) : value;
        break;

      case 'text':
      default:
        result[param.key] = String(value);
        break;
    }
  }

  return result;
}
