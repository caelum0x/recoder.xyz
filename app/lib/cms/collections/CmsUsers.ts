import type { CollectionConfig } from 'payload';

export const CmsUsers: CollectionConfig = {
  slug: 'cms-users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  fields: [
    {
      name: 'displayName',
      type: 'text',
    },
  ],
};
