import type { ActionFunctionArgs, LoaderFunctionArgs } from '@remix-run/cloudflare';
import * as z from 'zod/v4';
import { JsonResponse } from './json-response';

type RouteArgs = ActionFunctionArgs | LoaderFunctionArgs;

export function methodNotAllowed(): JsonResponse<{ success: false; error: string }> {
  return JsonResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
}

export function authRequired(): JsonResponse<{ success: false; error: string }> {
  return JsonResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
}

export function validationError(message: string): JsonResponse<{ success: false; error: string }> {
  return JsonResponse.json({ success: false, error: message }, { status: 400 });
}

export function internalError(message: string): JsonResponse<{ success: false; error: string }> {
  return JsonResponse.json({ success: false, error: message }, { status: 500 });
}

export async function parseJsonWithSchema<TSchema extends z.ZodTypeAny>(
  request: Request,
  schema: TSchema,
): Promise<{ ok: true; data: z.infer<TSchema> } | { ok: false; response: JsonResponse<{ success: false; error: string }> }> {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        ok: false,
        response: validationError(issue?.message || 'Invalid request body'),
      };
    }

    return { ok: true, data: parsed.data };
  } catch {
    return {
      ok: false,
      response: validationError('Invalid JSON body'),
    };
  }
}

export function parseQueryWithSchema<TSchema extends z.ZodTypeAny>(
  args: Pick<RouteArgs, 'request'>,
  schema: TSchema,
): { ok: true; data: z.infer<TSchema> } | { ok: false; response: JsonResponse<{ success: false; error: string }> } {
  const url = new URL(args.request.url);
  const raw: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    raw[key] = value;
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      response: validationError(issue?.message || 'Invalid query parameters'),
    };
  }

  return { ok: true, data: parsed.data };
}
