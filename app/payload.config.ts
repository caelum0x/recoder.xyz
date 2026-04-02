import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { buildConfig } from 'payload';
import { BlogPosts } from './lib/cms/collections/BlogPosts';
import { ChangelogEntries } from './lib/cms/collections/ChangelogEntries';
import { CmsUsers } from './lib/cms/collections/CmsUsers';

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
