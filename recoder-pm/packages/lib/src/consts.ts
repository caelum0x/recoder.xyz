export const FEEDBACK_PAGE_SIZE = 20;
export const CRON_PAGE_SIZE = 20;

export const MAX_FREE_MEMBERS = 10;
export const MAX_FREE_FEEDBACK = 250;
export const MAX_FREE_FEATURES = 150;
export const MAX_FREE_CHANGELOGS = 5;
export const MAX_FREE_INITIATIVES = 5;
export const MAX_FREE_INITIATIVE_PAGES = 5;
export const MAX_FREE_INITIATIVE_UPDATES = 5;
export const MAX_FREE_RELEASES = 5;

const publicBaseUrl =
  process.env.RECODER_PM_WEB_URL ??
  process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ??
  process.env.VERCEL_PROJECT_PRODUCTION_URL ??
  (process.env.NODE_ENV === "production" ? "https://pm.recoder.xyz" : "http://localhost:3000");

function toAbsoluteUrl(value: string | undefined, fallback: string): string {
  try {
    return new URL(value || fallback).toString();
  } catch {
    return new URL(fallback).toString();
  }
}

export const baseUrl = toAbsoluteUrl(publicBaseUrl, "https://pm.recoder.xyz");

export const BLOG_POST_PAGE_SIZE = 12;
