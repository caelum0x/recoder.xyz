import { pathToFileURL } from 'node:url';
import { getPayload } from 'payload';

import { fallbackBlogPosts } from '../lib/cms/blog-content.ts';
import { fallbackChangelogEntries } from '../lib/cms/changelog-content.ts';
import config from '../payload.config.ts';

type CliOptions = {
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  return {
    dryRun: argv.includes('--dry-run'),
  };
}

function parseDateOrThrow(value: string, label: string): string {
  const direct = new Date(value);

  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString();
  }

  const withDay = new Date(`${value} 1`);

  if (!Number.isNaN(withDay.getTime())) {
    return withDay.toISOString();
  }

  throw new Error(`Could not parse ${label}: ${value}`);
}

function toBlogDocument(post: (typeof fallbackBlogPosts)[number]) {
  return {
    _status: 'published' as const,
    author: post.author,
    category: post.category,
    content: post.content,
    excerpt: post.excerpt,
    publishedAt: parseDateOrThrow(post.date, `blog post "${post.slug}" date`),
    readTime: post.readTime,
    slug: post.slug,
    title: post.title,
  };
}

function toChangelogDocument(entry: (typeof fallbackChangelogEntries)[number]) {
  return {
    _status: 'published' as const,
    changes: entry.changes.map((change) => ({
      text: change.text,
      type: change.type,
    })),
    publishedAt: parseDateOrThrow(
      entry.date,
      `changelog entry "${entry.version}" date`,
    ),
    summary: entry.summary,
    title: entry.title,
    version: entry.version,
  };
}

async function upsertBlogPosts() {
  const payload = await getPayload({ config });
  let created = 0;
  let updated = 0;

  for (const post of fallbackBlogPosts) {
    const data = toBlogDocument(post);
    const existing = await payload.find({
      collection: 'blog-posts',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        slug: {
          equals: post.slug,
        },
      },
    });

    const current = existing.docs[0];

    if (current?.id) {
      await payload.update({
        collection: 'blog-posts',
        data,
        id: current.id,
        overrideAccess: true,
      });
      updated += 1;
      continue;
    }

    await payload.create({
      collection: 'blog-posts',
      data,
      overrideAccess: true,
    });
    created += 1;
  }

  return { created, updated };
}

async function upsertChangelogEntries() {
  const payload = await getPayload({ config });
  let created = 0;
  let updated = 0;

  for (const entry of fallbackChangelogEntries) {
    const data = toChangelogDocument(entry);
    const existing = await payload.find({
      collection: 'changelog-entries',
      depth: 0,
      limit: 1,
      overrideAccess: true,
      pagination: false,
      where: {
        version: {
          equals: entry.version,
        },
      },
    });

    const current = existing.docs[0];

    if (current?.id) {
      await payload.update({
        collection: 'changelog-entries',
        data,
        id: current.id,
        overrideAccess: true,
      });
      updated += 1;
      continue;
    }

    await payload.create({
      collection: 'changelog-entries',
      data,
      overrideAccess: true,
    });
    created += 1;
  }

  return { created, updated };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.dryRun) {
    const blogDocs = fallbackBlogPosts.map(toBlogDocument);
    const changelogDocs = fallbackChangelogEntries.map(toChangelogDocument);

    console.log(
      `Dry run: prepared ${blogDocs.length} blog posts and ${changelogDocs.length} changelog entries for Payload CMS.`,
    );
    console.log(
      `Blog slugs: ${blogDocs.map((doc) => doc.slug).join(', ')}`,
    );
    console.log(
      `Changelog versions: ${changelogDocs.map((doc) => doc.version).join(', ')}`,
    );
    return;
  }

  const [blogResult, changelogResult] = await Promise.all([
    upsertBlogPosts(),
    upsertChangelogEntries(),
  ]);

  console.log(
    `Seeded Payload CMS content: blog created=${blogResult.created}, blog updated=${blogResult.updated}, changelog created=${changelogResult.created}, changelog updated=${changelogResult.updated}.`,
  );
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((error) => {
    console.error('Payload CMS seed failed:', error);
    process.exitCode = 1;
  });
}
