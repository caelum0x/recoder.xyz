import { replaceNullCharacters } from '../../../../../packages/rag/src/utils/text';

export function sanitizePostgresText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return replaceNullCharacters(value);
}
