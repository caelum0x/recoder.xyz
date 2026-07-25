/**
 * Payload CMS → IndexNow content-change hooks.
 *
 * When a published document changes or is deleted in the CMS, we notify search
 * engines (via IndexNow, which fans out to Bing/Yandex/Seznam/…) that the
 * affected public URL(s) changed — the real per-content trigger, firing the
 * moment content is published rather than waiting for a full redeploy.
 *
 * Degrade-safe contract (load-bearing): these hooks NEVER block or fail a CMS
 * write. The submit is fire-and-forget, `submitUrls` never throws, and every
 * path is wrapped so a bug here can never reject a save/delete. They also only
 * POST when {@link isIndexNowSubmissionEnabled} is true (production, or an
 * explicit dev override), so local/CI edits never ping live search engines.
 *
 * Truthfulness: `submitUrls` performs a real POST and reports the upstream
 * status verbatim; nothing here fabricates a submission.
 */

import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload';
import { logger } from '@/lib/logger';
import { isIndexNowSubmissionEnabled, siteUrlForPath, submitUrls } from '@/lib/seo/indexnow';

/** A Payload doc is an opaque record here; callers narrow the fields they read. */
type CmsDoc = Record<string, unknown>;

/** Derive the site-relative paths a changed doc should trigger a submit for. */
type PathsFromDoc = (doc: CmsDoc) => readonly string[];

/**
 * Fire a best-effort IndexNow submit for the given site-relative paths. Skips
 * entirely when submissions are disabled or no usable path is provided. Never
 * throws — the returned promise is intentionally not awaited by callers so the
 * CMS write is never blocked.
 */
function fireSubmit(collection: string, paths: readonly string[]): void {
  if (!isIndexNowSubmissionEnabled()) {
    return;
  }

  const uniquePaths = [...new Set(paths.filter((p) => typeof p === 'string' && p.length > 0))];
  if (uniquePaths.length === 0) {
    return;
  }

  const urls = uniquePaths.map(siteUrlForPath);

  // Fire-and-forget: submitUrls never throws, but the .catch is a belt-and-braces
  // guard so an unexpected rejection can never surface into the CMS write path.
  void submitUrls(urls)
    .then((result) => {
      if (result.submitted) {
        logger.info('IndexNow CMS submit completed', {
          collection,
          urlCount: result.urlCount,
          upstreamStatus: result.upstreamStatus,
        });
      } else {
        logger.info('IndexNow CMS submit not accepted', {
          collection,
          urlCount: result.urlCount,
          upstreamStatus: result.upstreamStatus,
          // `in`-narrowing: robust under the app's non-strict tsconfig, where
          // `if (result.submitted)` does not narrow the discriminated union.
          reason: 'reason' in result ? result.reason : 'unknown',
        });
      }
    })
    .catch((error: unknown) => {
      logger.warn('IndexNow CMS submit threw unexpectedly', {
        collection,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}

/**
 * Build an `afterChange` hook that submits a changed doc's public URL(s).
 *
 * @param collection    Human label for logs (the collection slug).
 * @param buildPaths    Maps the doc to the site-relative path(s) to submit.
 * @param publishedOnly When true (default), only published docs are submitted —
 *                      draft/autosave saves (`_status !== 'published'`) are
 *                      skipped so unpublished content is never announced.
 */
export function indexNowAfterChange(
  collection: string,
  buildPaths: PathsFromDoc,
  publishedOnly = true,
): CollectionAfterChangeHook {
  return ({ doc }) => {
    try {
      const record = (doc ?? {}) as CmsDoc;
      const status = record._status;
      if (publishedOnly && typeof status === 'string' && status !== 'published') {
        return doc;
      }
      fireSubmit(collection, buildPaths(record));
    } catch {
      // Degrade-safe: a submit-path bug must never block the CMS write.
    }
    return doc;
  };
}

/**
 * Build an `afterDelete` hook that submits the removed doc's public URL(s).
 * IndexNow explicitly supports notifying engines of removed pages so they
 * recrawl and drop them; the index/listing URL is typically included too so its
 * updated (now shorter) listing is recrawled.
 */
export function indexNowAfterDelete(
  collection: string,
  buildPaths: PathsFromDoc,
): CollectionAfterDeleteHook {
  return ({ doc }) => {
    try {
      fireSubmit(collection, buildPaths((doc ?? {}) as CmsDoc));
    } catch {
      // Degrade-safe: a submit-path bug must never block the CMS delete.
    }
    return doc;
  };
}
