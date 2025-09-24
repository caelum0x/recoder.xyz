/**
 * XML matching utilities for production engine
 */

export function extractXmlContent(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

export function hasXmlTag(xml: string, tag: string): boolean {
  const regex = new RegExp(`<${tag}[^>]*>`, 'i');
  return regex.test(xml);
}

export function extractAllXmlContent(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const matches: string[] = [];
  let match;
  
  while ((match = regex.exec(xml)) !== null) {
    matches.push(match[1].trim());
  }
  
  return matches;
}

export class XmlMatcher {
  constructor(private content: string) {}
  
  extract(tag: string): string | null {
    return extractXmlContent(this.content, tag);
  }
  
  has(tag: string): boolean {
    return hasXmlTag(this.content, tag);
  }
  
  extractAll(tag: string): string[] {
    return extractAllXmlContent(this.content, tag);
  }
}