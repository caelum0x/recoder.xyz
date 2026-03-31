const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isLikelySandboxProjectId(value?: string | null): value is string {
  if (!value) {
    return false;
  }

  return value.startsWith('project-') || UUID_RE.test(value);
}

export function resolveSandboxProjectId(options: {
  preferredProjectId?: string | null;
  storedProjectId?: string | null;
  urlId?: string | null;
  chatId?: string | null;
  now?: () => number;
}): string {
  const { preferredProjectId, storedProjectId, urlId, chatId, now = Date.now } = options;
  const candidates = [preferredProjectId, storedProjectId, urlId, chatId];

  for (const candidate of candidates) {
    if (isLikelySandboxProjectId(candidate)) {
      return candidate;
    }
  }

  return `project-${now()}`;
}
