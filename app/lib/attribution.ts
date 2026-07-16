import { NextRequest } from 'next/server';

type AttributionInput = Record<string, unknown> | null | undefined;

export interface AttributionData {
  referredByCode: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  firstTouchReferrer: string | null;
  firstTouchLanding: string | null;
  acquisitionSource: string;
}

function normalize(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 512) : null;
}

export function extractAttribution(
  request: NextRequest,
  input?: AttributionInput
): AttributionData {
  const searchParams = new URL(request.url).searchParams;

  const referredByCode =
    normalize(input?.referralCode) ??
    normalize(input?.ref) ??
    normalize(searchParams.get('referralCode')) ??
    normalize(searchParams.get('ref')) ??
    normalize(searchParams.get('r'));

  const utmSource = normalize(input?.utm_source) ?? normalize(searchParams.get('utm_source'));
  const utmMedium = normalize(input?.utm_medium) ?? normalize(searchParams.get('utm_medium'));
  const utmCampaign = normalize(input?.utm_campaign) ?? normalize(searchParams.get('utm_campaign'));
  const utmTerm = normalize(input?.utm_term) ?? normalize(searchParams.get('utm_term'));
  const utmContent = normalize(input?.utm_content) ?? normalize(searchParams.get('utm_content'));

  const firstTouchReferrer = normalize(request.headers.get('referer'));
  const firstTouchLanding = `${new URL(request.url).pathname}${new URL(request.url).search}`;

  let acquisitionSource = 'direct';
  if (utmSource) acquisitionSource = `utm:${utmSource}`;
  else if (referredByCode) acquisitionSource = 'referral';
  else if (firstTouchReferrer) acquisitionSource = 'referrer';

  return {
    referredByCode,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
    firstTouchReferrer,
    firstTouchLanding,
    acquisitionSource,
  };
}
