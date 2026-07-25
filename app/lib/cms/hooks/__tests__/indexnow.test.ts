import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { indexNowAfterChange, indexNowAfterDelete } from '../indexnow';

const ORIGINAL_ENV = { ...process.env };

/** Minimal Payload hook args carrying just the doc the hooks read. */
function args(doc: Record<string, unknown>): any {
  return { doc };
}

/** Let the fire-and-forget microtask/promise chain flush before asserting. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function blogPaths(doc: Record<string, unknown>): string[] {
  const slug = typeof doc.slug === 'string' ? doc.slug : '';
  return slug ? [`/blog/${slug}`, '/blog'] : ['/blog'];
}

describe('cms/hooks/indexnow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
    process.env = { ...process.env, NODE_ENV: 'production' }; // submissions enabled by default
    delete process.env.INDEXNOW_KEY;
    delete process.env.INDEXNOW_ENABLE_IN_DEV;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.SITE_URL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('afterChange submits the post URL + /blog index for a published doc', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));

    const hook = indexNowAfterChange('blog-posts', blogPaths);
    const doc = { slug: 'hello', _status: 'published' };
    const result = hook(args(doc));

    // Returns the doc unchanged — the hook never blocks/mutates the write.
    expect(result).toBe(doc);

    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
    expect(body.urlList).toEqual([
      'https://recoder.xyz/blog/hello',
      'https://recoder.xyz/blog',
    ]);
  });

  it('afterChange skips a draft (unpublished) doc — no network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const hook = indexNowAfterChange('blog-posts', blogPaths);
    hook(args({ slug: 'draftpost', _status: 'draft' }));
    await flush();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not submit when submissions are disabled (non-production)', async () => {
    process.env = { ...process.env, NODE_ENV: 'test' };
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const hook = indexNowAfterChange('blog-posts', blogPaths);
    hook(args({ slug: 'hello', _status: 'published' }));
    await flush();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('afterDelete submits the removed page + index', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    const hook = indexNowAfterDelete('blog-posts', blogPaths);
    hook(args({ slug: 'gone' }));
    await flush();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
    expect(body.urlList).toContain('https://recoder.xyz/blog/gone');
  });

  it('never throws even if the path builder throws — the write is unaffected', () => {
    const hook = indexNowAfterChange('blog-posts', () => {
      throw new Error('boom');
    });
    expect(() => hook(args({ _status: 'published' }))).not.toThrow();
  });
});
