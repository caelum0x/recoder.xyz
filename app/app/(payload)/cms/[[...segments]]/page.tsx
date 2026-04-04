import type { Metadata } from 'next';
import config from '@/payload.config';
import { RootPage, generatePageMetadata } from '@payloadcms/next/views';
import { importMap } from '../importMap';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;
type Params = {
  segments?: string[];
};

type PageProps = {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
};

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  return generatePageMetadata({
    config: Promise.resolve(config),
    params: Promise.resolve(await params),
    searchParams: Promise.resolve(await searchParams),
  });
}

export default async function PayloadCmsPage({
  params,
  searchParams,
}: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  return RootPage({
    config: Promise.resolve(config),
    importMap,
    params: Promise.resolve({
      segments: Array.isArray(resolvedParams?.segments) ? resolvedParams.segments : [],
    }),
    searchParams: Promise.resolve(resolvedSearchParams ?? {}),
  });
}
