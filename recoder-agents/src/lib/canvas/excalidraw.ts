export const EXCALIDRAW_FILE_SUFFIXES = ['.excalidraw', '.excalidraw.json'] as const;
export const EXCALIDRAW_SOURCE = 'https://agents.recoder.xyz';

type JsonObject = Record<string, unknown>;

export interface ExcalidrawSceneData {
  type: 'excalidraw';
  version: number;
  source: string;
  elements: unknown[];
  appState: JsonObject;
  files: JsonObject;
}

const PERSISTED_APP_STATE_KEYS = [
  'gridSize',
  'gridStep',
  'scrollX',
  'scrollY',
  'theme',
  'viewBackgroundColor',
  'zoom',
] as const;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isExcalidrawFileName(fileName: string): boolean {
  const normalized = fileName.trim().toLowerCase();
  return EXCALIDRAW_FILE_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export function getExcalidrawDisplayName(fileName: string): string {
  const normalized = fileName.trim();

  if (normalized.toLowerCase().endsWith('.excalidraw.json')) {
    return normalized.slice(0, -'.excalidraw.json'.length);
  }

  if (normalized.toLowerCase().endsWith('.excalidraw')) {
    return normalized.slice(0, -'.excalidraw'.length);
  }

  return normalized;
}

export function createEmptyExcalidrawScene(
  overrides: Partial<ExcalidrawSceneData> = {}
): ExcalidrawSceneData {
  return {
    type: 'excalidraw',
    version: 2,
    source: EXCALIDRAW_SOURCE,
    elements: [],
    appState: {},
    files: {},
    ...overrides,
  };
}

export function parseExcalidrawScene(content: string | null | undefined): ExcalidrawSceneData {
  if (!content?.trim()) {
    return createEmptyExcalidrawScene();
  }

  try {
    const parsed = JSON.parse(content) as unknown;

    if (!isJsonObject(parsed)) {
      return createEmptyExcalidrawScene();
    }

    return createEmptyExcalidrawScene({
      type: parsed.type === 'excalidraw' ? 'excalidraw' : 'excalidraw',
      version: typeof parsed.version === 'number' ? parsed.version : 2,
      source: typeof parsed.source === 'string' ? parsed.source : EXCALIDRAW_SOURCE,
      elements: Array.isArray(parsed.elements) ? parsed.elements : [],
      appState: isJsonObject(parsed.appState) ? parsed.appState : {},
      files: isJsonObject(parsed.files) ? parsed.files : {},
    });
  } catch {
    return createEmptyExcalidrawScene();
  }
}

export function serializeExcalidrawScene(scene: {
  elements: unknown[];
  appState?: unknown;
  files?: unknown;
}): string {
  const appState = isJsonObject(scene.appState) ? scene.appState : {};
  const files = isJsonObject(scene.files) ? scene.files : {};

  const persistedAppState = Object.fromEntries(
    PERSISTED_APP_STATE_KEYS.flatMap((key) =>
      appState[key] === undefined ? [] : [[key, appState[key]]]
    )
  );

  return JSON.stringify(
    createEmptyExcalidrawScene({
      elements: Array.isArray(scene.elements) ? scene.elements : [],
      appState: persistedAppState,
      files,
    }),
    null,
    2
  );
}
