import type { CollectionConfig } from 'payload';

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
