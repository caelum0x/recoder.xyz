import {
  DEFAULT_GA_MEASUREMENT_ID,
  resolveGaMeasurementId,
  resolveSiteVerification,
} from '../ga';

describe('resolveGaMeasurementId', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('falls back to the current production id when NEXT_PUBLIC_GA_ID is unset', () => {
    delete process.env.NEXT_PUBLIC_GA_ID;
    expect(resolveGaMeasurementId()).toBe(DEFAULT_GA_MEASUREMENT_ID);
    expect(DEFAULT_GA_MEASUREMENT_ID).toBe('G-V0G79DP41C');
  });

  it('falls back when NEXT_PUBLIC_GA_ID is empty or whitespace', () => {
    process.env.NEXT_PUBLIC_GA_ID = '   ';
    expect(resolveGaMeasurementId()).toBe(DEFAULT_GA_MEASUREMENT_ID);
  });

  it('uses NEXT_PUBLIC_GA_ID when it is set', () => {
    process.env.NEXT_PUBLIC_GA_ID = 'G-TEST12345';
    expect(resolveGaMeasurementId()).toBe('G-TEST12345');
  });
});

describe('resolveSiteVerification', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('returns undefined (no meta tags) when no tokens are configured', () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
    delete process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION;
    expect(resolveSiteVerification()).toBeUndefined();
  });

  it('omits empty/whitespace tokens', () => {
    process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION = '';
    process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION = '   ';
    expect(resolveSiteVerification()).toBeUndefined();
  });

  it('emits the Google token when configured', () => {
    process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION = 'google-token';
    delete process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION;
    expect(resolveSiteVerification()).toEqual({ google: 'google-token' });
  });

  it('emits the Bing token under msvalidate.01 when configured', () => {
    delete process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
    process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION = 'bing-token';
    expect(resolveSiteVerification()).toEqual({
      other: { 'msvalidate.01': 'bing-token' },
    });
  });
});
