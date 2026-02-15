import { isJsonContent as giselleIsJsonContent } from '../../../../../packages/text-editor-utils/src/is-json-content';

export function isJsonContent(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }

  const trimmed = content.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) {
    return false;
  }

  return giselleIsJsonContent(trimmed);
}

export function jsonContentToText(json: unknown): string {
  if (typeof json === 'string') {
    return json;
  }
  if (Array.isArray(json)) {
    return json.map((item) => jsonContentToText(item)).join('\n');
  }
  if (typeof json === 'object' && json !== null) {
    if ('content' in json && Array.isArray((json as any).content)) {
      return (json as any).content
        .map((block: any) => {
          if (block.type === 'paragraph' && block.content) {
            return block.content
              .map((item: any) => item.text || '')
              .join('');
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    }
    return JSON.stringify(json);
  }
  return String(json);
}

export function jsonContentToPlainText(json: unknown): string {
  return jsonContentToText(json);
}
