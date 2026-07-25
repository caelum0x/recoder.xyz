import type { CollectionConfig } from 'payload';
import { indexNowAfterChange, indexNowAfterDelete } from '../hooks/indexnow';

// Changelog entries have no per-entry route; they render on the single
// /changelog listing page, so any change re-pings that one URL.
const changelogPaths = (): string[] => ['/changelog'];

export const ChangelogEntries: CollectionConfig = {
  slug: 'changelog-entries',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['version', 'title', 'publishedAt', 'updatedAt'],
  },
  access: {
    read: () => true,
  },
  versions: {
    drafts: true,
  },
  hooks: {
    // Notify search engines the moment the changelog listing changes.
    // Degrade-safe + fire-and-forget: never blocks or fails the CMS write.
    afterChange: [indexNowAfterChange('changelog-entries', changelogPaths)],
    afterDelete: [indexNowAfterDelete('changelog-entries', changelogPaths)],
  },
  fields: [
    {
      name: 'version',
      type: 'text',
      required: true,
    },
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'summary',
      type: 'textarea',
    },
    {
      name: 'publishedAt',
      type: 'date',
      required: true,
    },
    {
      name: 'changes',
      type: 'array',
      required: true,
      fields: [
        {
          name: 'type',
          type: 'select',
          required: true,
          defaultValue: 'feature',
          options: [
            { label: 'Feature', value: 'feature' },
            { label: 'Improvement', value: 'improvement' },
            { label: 'Fix', value: 'fix' },
            { label: 'Security', value: 'security' },
          ],
        },
        {
          name: 'text',
          type: 'text',
          required: true,
        },
      ],
    },
  ],
};
