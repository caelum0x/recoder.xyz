/**
 * Search Service - Uses ripgrep for fast file search
 */

import Docker from 'dockerode';

const docker = new Docker();

export interface SearchResult {
  file: string;
  line: number;
  column: number;
  text: string;
  matchStart: number;
  matchEnd: number;
}

export interface SearchOptions {
  regex?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  include?: string;
  exclude?: string;
  maxResults?: number;
}

export class SearchService {
  /**
   * Search in files using ripgrep
   */
  async search(
    containerId: string,
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    if (!query.trim()) return [];

    const container = docker.getContainer(containerId);
    
    // Build ripgrep command
    let cmd = 'rg --json --line-number --column';
    
    if (!options.caseSensitive) cmd += ' -i';
    if (options.wholeWord) cmd += ' -w';
    if (options.regex) cmd += ' -e';
    if (options.include) cmd += ` -g "${options.include}"`;
    if (options.exclude) cmd += ` -g "!${options.exclude}"`;
    
    const maxResults = options.maxResults || 1000;
    cmd += ` -m ${maxResults}`;
    
    // Escape query for shell
    const escapedQuery = query.replace(/"/g, '\\"');
    cmd += ` "${escapedQuery}" /workspace 2>/dev/null || true`;

    try {
      const output = await this.execCommand(container, cmd);
      return this.parseRipgrepOutput(output);
    } catch (error) {
      console.error('[Search] Error:', error);
      return [];
    }
  }

  /**
   * Replace in files
   */
  async replace(
    containerId: string,
    searchQuery: string,
    replaceText: string,
    files: string[]
  ): Promise<{ success: boolean; filesModified: number }> {
    const container = docker.getContainer(containerId);
    let filesModified = 0;

    for (const file of files) {
      try {
        const escapedSearch = searchQuery.replace(/"/g, '\\"');
        const escapedReplace = replaceText.replace(/"/g, '\\"');
        const cmd = `sed -i 's/${escapedSearch}/${escapedReplace}/g' ${file}`;
        await this.execCommand(container, cmd);
        filesModified++;
      } catch (error) {
        console.error(`[Search] Replace failed for ${file}:`, error);
      }
    }

    return { success: true, filesModified };
  }

  /**
   * Parse ripgrep JSON output
   */
  private parseRipgrepOutput(output: string): SearchResult[] {
    const results: SearchResult[] = [];
    
    for (const line of output.split('\n')) {
      if (!line.trim()) continue;
      
      try {
        const data = JSON.parse(line);
        
        if (data.type === 'match') {
          const match = data.data;
          results.push({
            file: match.path.text.replace('/workspace/', ''),
            line: match.line_number,
            column: match.submatches[0]?.start || 0,
            text: match.lines.text.trim(),
            matchStart: match.submatches[0]?.start || 0,
            matchEnd: match.submatches[0]?.end || 0,
          });
        }
      } catch {
        // Skip non-JSON lines
      }
    }
    
    return results;
  }

  private async execCommand(container: Docker.Container, command: string): Promise<string> {
    const exec = await container.exec({
      Cmd: ['/bin/bash', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({});
    
    return new Promise((resolve, reject) => {
      let output = '';
      stream.on('data', (chunk: Buffer) => {
        output += chunk.slice(8).toString();
      });
      stream.on('end', () => resolve(output.trim()));
      stream.on('error', reject);
    });
  }
}

export const searchService = new SearchService();
