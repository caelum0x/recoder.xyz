/**
 * XML matching utilities
 */

export function matchXmlTag(content: string, tagName: string): string[] | null {
  const regex = new RegExp(`<${tagName}[^>]*>(.*?)</${tagName}>`, 'gs')
  const matches = content.match(regex)
  return matches || null
}

export function extractXmlContent(content: string, tagName: string): string | null {
  const match = content.match(new RegExp(`<${tagName}[^>]*>(.*?)</${tagName}>`, 's'))
  return match ? match[1].trim() : null
}

export function hasXmlTag(content: string, tagName: string): boolean {
  return new RegExp(`<${tagName}[^>]*>.*?</${tagName}>`, 's').test(content)
}

export class XmlMatcher {
  private content: string = ''
  private buffer: string = ''

  static match(content: string, tagName: string): string[] | null {
    return matchXmlTag(content, tagName)
  }
  
  static extract(content: string, tagName: string): string | null {
    return extractXmlContent(content, tagName)
  }
  
  static has(content: string, tagName: string): boolean {
    return hasXmlTag(content, tagName)
  }

  // Instance methods for streaming XML parsing
  update(chunk: string, _options?: any): void {
    this.buffer += chunk
    this.content += chunk
  }

  final(): string {
    const result = this.content
    this.content = ''
    this.buffer = ''
    return result
  }

  reset(): void {
    this.content = ''
    this.buffer = ''
  }
}