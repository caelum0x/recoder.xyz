import { getDaytonaClient } from './daytona-client.js';

export type DaytonaPreviewAccess = {
  url: string;
  token?: string;
  host: string;
  port: number;
  signed: boolean;
};

const DEFAULT_SIGNED_PREVIEW_EXPIRY_SECONDS = 86400;

function getDaytonaPreviewHost(url: string, sandboxId: string, port: number): string {
  try {
    return new URL(url).host;
  } catch {
    return `${port}-${sandboxId}.sandbox.recoder.xyz`;
  }
}

export async function getDaytonaPreviewAccess(
  entry: { id: string } | string,
  port: number,
  options?: { signedExpirySeconds?: number; preferSigned?: boolean },
): Promise<DaytonaPreviewAccess> {
  const sandboxId = typeof entry === 'string' ? entry : entry.id;
  const dc = getDaytonaClient();
  const preferSigned = options?.preferSigned !== false;
  const signedExpirySeconds = options?.signedExpirySeconds ?? DEFAULT_SIGNED_PREVIEW_EXPIRY_SECONDS;

  if (preferSigned) {
    try {
      const signedPreview = await dc.getSignedPortPreviewUrl(sandboxId, port, signedExpirySeconds);
      if (signedPreview?.url) {
        return {
          url: signedPreview.url,
          token: signedPreview.token,
          host: getDaytonaPreviewHost(signedPreview.url, sandboxId, port),
          port,
          signed: true,
        };
      }
    } catch {
      // Fall through to standard preview URL.
    }
  }

  try {
    const preview = await dc.getPortPreviewUrl(sandboxId, port);
    const url = preview?.url || dc.getPreviewUrl(sandboxId, port);
    return {
      url,
      token: preview?.token,
      host: getDaytonaPreviewHost(url, sandboxId, port),
      port,
      signed: false,
    };
  } catch {
    const url = dc.getPreviewUrl(sandboxId, port);
    return {
      url,
      host: getDaytonaPreviewHost(url, sandboxId, port),
      port,
      signed: false,
    };
  }
}

export function buildDaytonaPreviewHeaders(
  preview: DaytonaPreviewAccess,
  options: {
    accept?: string;
    forwardedHost?: string;
  } = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    Host: preview.host,
    Accept: options.accept || '*/*',
    'X-Daytona-Skip-Preview-Warning': 'true',
    'X-Daytona-Disable-CORS': 'true',
    'X-Forwarded-Host': options.forwardedHost || preview.host,
  };

  if (preview.token && !preview.signed) {
    headers['X-Daytona-Preview-Token'] = preview.token;
  }

  return headers;
}
