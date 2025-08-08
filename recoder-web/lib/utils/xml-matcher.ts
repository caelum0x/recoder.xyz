/**
 * XML matching utility for parsing responses from AI providers
 */

export class XmlMatcher {
  private pattern: RegExp;
  private tagName: string;
  private callback?: (chunk: { matched: boolean; data: string }) => any;
  private buffer: string = '';

  constructor(tagName: string, callback?: (chunk: { matched: boolean; data: string }) => any) {
    this.tagName = tagName;
    this.callback = callback;
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

  /**
   * Update with new content chunk for streaming processing
   */
  update(chunk: string): any[] {
    if (!this.callback) {
      return [];
    }

    this.buffer += chunk;
    const results: any[] = [];

    // Check for complete XML tags
    const matches = this.match(this.buffer);
    if (matches.length > 0) {
      for (const match of matches) {
        results.push(this.callback({ matched: true, data: match }));
      }
      // Remove processed content from buffer
      this.buffer = this.buffer.replace(this.pattern, '');
    } else if (chunk) {
      // No complete tags found, treat as regular text
      results.push(this.callback({ matched: false, data: chunk }));
    }

    return results;
  }

  /**
   * Process any remaining content in buffer
   */
  final(): any[] {
    if (!this.callback || !this.buffer) {
      return [];
    }

    const results: any[] = [];
    if (this.buffer.trim()) {
      results.push(this.callback({ matched: false, data: this.buffer }));
    }
    this.buffer = '';
    return results;
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