import { cache } from 'react';
import type { ChangelogEntry } from '@/lib/cms/changelog-content';
import {
  fallbackChangelogEntries,
} from '@/lib/cms/changelog-content';
import {
  getPayloadClient,
  isPayloadCmsEnabled,
  logPayloadCmsError,
} from '@/lib/cms/payload';

function formatDateLabel(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function mapChangelogEntry(doc: any): ChangelogEntry | null {
  if (!doc?.version || !doc?.title) {
    return null;
  }

  return {
    version: String(doc.version),
    date: formatDateLabel(
      typeof doc.publishedAt === 'string' ? doc.publishedAt : '',
    ),
    title: String(doc.title),
    summary: typeof doc.summary === 'string' ? doc.summary : undefined,
    changes: Array.isArray(doc.changes)
      ? doc.changes
          .map((change: any) => ({
            type:
              typeof change?.type === 'string' ? change.type : 'feature',
            text: typeof change?.text === 'string' ? change.text : '',
          }))
          .filter((change: { text: string }) => Boolean(change.text))
      : [],
  };
}

const fetchChangelogEntries = cache(async (): Promise<ChangelogEntry[]> => {
  if (!isPayloadCmsEnabled()) {
    return fallbackChangelogEntries;
  }

  const payload = await getPayloadClient();
  if (!payload) {
    return fallbackChangelogEntries;
  }

  try {
    const result = await payload.find({
      collection: 'changelog-entries',
      depth: 0,
      limit: 100,
      pagination: false,
      overrideAccess: true,
      sort: '-publishedAt',
      where: {
        _status: {
          equals: 'published',
        },
      },
    });

    const entries = result.docs
      .map(mapChangelogEntry)
      .filter(Boolean) as ChangelogEntry[];

    return entries.length > 0 ? entries : fallbackChangelogEntries;
  } catch (error) {
    logPayloadCmsError('failed to load changelog entries', error);
    return fallbackChangelogEntries;
  }
});

export async function getChangelogEntries(): Promise<ChangelogEntry[]> {
  return fetchChangelogEntries();
}
