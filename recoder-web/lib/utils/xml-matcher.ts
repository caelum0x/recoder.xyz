/**
 * XML matching utility for parsing responses from AI providers
 */

export class XmlMatcher {
  private pattern: RegExp;

  constructor(tagName: string) {
    // Create regex pattern to match XML tags
    this.pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  }

  /**
   * Extract content from XML tags
   */
  match(content: string): string[] {
    const matches: string[] = [];
    let match;
    
    while ((match = this.pattern.exec(content)) !== null) {
      matches.push(match[1].trim());
    }
    
    return matches;
  }

  /**
   * Extract first match from XML tags
   */
  matchFirst(content: string): string | null {
    const matches = this.match(content);
    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * Check if content contains the XML tag
   */
  test(content: string): boolean {
    return this.pattern.test(content);
  }

  /**
   * Remove XML tags from content
   */
  strip(content: string): string {
    return content.replace(this.pattern, '$1');
  }
}

/**
 * Common XML matchers for AI responses
 */
export const xmlMatchers = {
  thinking: new XmlMatcher('thinking'),
  code: new XmlMatcher('code'),
  answer: new XmlMatcher('answer'),
  response: new XmlMatcher('response'),
  output: new XmlMatcher('output'),
  result: new XmlMatcher('result'),
};