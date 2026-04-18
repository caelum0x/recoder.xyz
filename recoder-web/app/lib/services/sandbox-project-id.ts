const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const ROOT_SANDBOX_PROJECT_STORAGE_KEY = 'recoder.web.rootSandboxProjectId';

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

export function getStoredSandboxProjectId(storageKey: string = ROOT_SANDBOX_PROJECT_STORAGE_KEY): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storedValue = window.sessionStorage.getItem(storageKey);
    return isLikelySandboxProjectId(storedValue) ? storedValue : null;
  } catch {
    return null;
  }
}

export function persistStoredSandboxProjectId(
  projectId: string,
  storageKey: string = ROOT_SANDBOX_PROJECT_STORAGE_KEY,
): void {
  if (typeof window === 'undefined' || !isLikelySandboxProjectId(projectId)) {
    return;
  }

  try {
    window.sessionStorage.setItem(storageKey, projectId);
  } catch {
    // Ignore storage failures.
  }
}

export function clearStoredSandboxProjectId(storageKey: string = ROOT_SANDBOX_PROJECT_STORAGE_KEY): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore storage failures.
  }
}
