/**
 * XML matching utilities
 */

export function findXMLTags(text: string, tagName: string): string[] {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\/${tagName}>`, 'gi');
  const matches: string[] = [];
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1].trim());
  }
  
  return matches;
}

export function extractXMLContent(text: string, tagName: string): string | null {
  const matches = findXMLTags(text, tagName);
  return matches.length > 0 ? matches[0] : null;
}

export function hasXMLTag(text: string, tagName: string): boolean {
  const regex = new RegExp(`<${tagName}[^>]*>`, 'i');
  return regex.test(text);
}

export function removeXMLTags(text: string, tagName?: string): string {
  if (tagName) {
    const regex = new RegExp(`<\/?${tagName}[^>]*>`, 'gi');
    return text.replace(regex, '');
  } else {
    // Remove all XML tags
    return text.replace(/<[^>]*>/g, '');
  }
}

export class XmlMatcher {
  private text: string;

  constructor(text: string) {
    this.text = text;
  }

  findTags(tagName: string): string[] {
    return findXMLTags(this.text, tagName);
  }

  extractContent(tagName: string): string | null {
    return extractXMLContent(this.text, tagName);
  }

  hasTag(tagName: string): boolean {
    return hasXMLTag(this.text, tagName);
  }

  removeTags(tagName?: string): string {
    return removeXMLTags(this.text, tagName);
  }

  getText(): string {
    return this.text;
  }

  setText(text: string): void {
    this.text = text;
  }
}
