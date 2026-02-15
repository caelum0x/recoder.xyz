import { webSearch as createWebSearch } from '../../../../../packages/web-search/src/web-search';

type GiselleFormats = Array<'html' | 'markdown'>;

const selfMadeSearcher = createWebSearch({ provider: 'self-made' });

export async function fetchUrlWithGiselleWebSearch(
  url: string,
  formats: GiselleFormats = ['html'],
): Promise<{ url: string; title: string; html: string; markdown: string } | null> {
  try {
    return await selfMadeSearcher.fetchUrl(url, formats);
  } catch {
    return null;
  }
}
