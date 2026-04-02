'use server';

import { handleServerFunctions } from '@payloadcms/next/layouts';
import type { ImportMap } from 'payload';

import config from '@/payload.config';

type PayloadServerFunctionArgs = {
  args?: Record<string, unknown>;
  importMap?: ImportMap;
  name: string;
  serverFunctions?: Record<string, (...args: any[]) => Promise<unknown> | unknown>;
};

export async function payloadCmsServerFunction({
  args,
  importMap,
  name,
  serverFunctions,
}: PayloadServerFunctionArgs) {
  return handleServerFunctions({
    args,
    config: Promise.resolve(config),
    importMap,
    name,
    serverFunctions,
  });
}
