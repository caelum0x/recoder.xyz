import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { buildConfig } from 'payload';

// The Payload CLI loads this file through tsx rather than Next's bundler, so
// the collection imports need explicit TS extensions for ESM resolution.
import { BlogPosts } from './lib/cms/collections/BlogPosts.ts';
import { ChangelogEntries } from './lib/cms/collections/ChangelogEntries.ts';
import { CmsUsers } from './lib/cms/collections/CmsUsers.ts';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || 'recoder-payload-dev-secret',
  serverURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  admin: {
    user: CmsUsers.slug,
    importMap: {
      baseDir: dirname,
    },
  },
  collections: [CmsUsers, BlogPosts, ChangelogEntries],
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL,
    },
    migrationDir: path.resolve(dirname, 'payload-migrations'),
    push: false,
  }),
  routes: {
    admin: '/cms',
    api: '/api/cms',
  },
  telemetry: false,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
});
