/**
 * Search Service - Uses ripgrep for fast file search
 *
 * Supports both Docker containers and Daytona sandboxes.
 * Daytona sandboxes are routed through daytonaExec instead of Docker exec.
 */

import Docker from 'dockerode';
import { daytonaExec } from './daytona-file-ops.js';

const docker = new Docker();

/** Workspace path inside Daytona sandboxes */
const DAYTONA_WORKSPACE = '/home/daytona';

/** Check whether a containerId refers to a Daytona sandbox */
function isDaytonaSandbox(containerId: string): boolean {
  return !!global.__daytonaSandboxIds?.has(containerId);
}

declare global {
  // eslint-disable-next-line no-var
  var __daytonaSandboxIds: Set<string> | undefined;
}

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

    const useDaytona = isDaytonaSandbox(containerId);
    const workspacePath = useDaytona ? DAYTONA_WORKSPACE : '/workspace';

    // Build ripgrep command
    let cmd = 'rg --json --line-number --column';

    if (!options.caseSensitive) cmd += ' -i';
    if (options.wholeWord) cmd += ' -w';
    if (options.regex) cmd += ' -e';
    if (options.include) cmd += ` -g "${options.include.replace(/["\\`$]/g, '\\$&')}"`;
    if (options.exclude) cmd += ` -g "!${options.exclude.replace(/["\\`$]/g, '\\$&')}"`;

    const maxResults = options.maxResults || 1000;
    cmd += ` -m ${maxResults}`;

    // Escape query for shell (double-quote context)
    const escapedQuery = query.replace(/["\\`$]/g, '\\$&');
    cmd += ` "${escapedQuery}" ${workspacePath} 2>/dev/null || true`;

    try {
      let output: string;
      if (useDaytona) {
        const result = await daytonaExec(containerId, cmd, { timeoutSecs: 30 });
        output = result.output;
      } else {
        const container = docker.getContainer(containerId);
        output = await this.execCommand(container, cmd);
      }
      return this.parseRipgrepOutput(output, workspacePath);
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
    const useDaytona = isDaytonaSandbox(containerId);
    let filesModified = 0;

    for (const file of files) {
      try {
        // Escape for sed: backslash-escape the delimiter and special sed chars
        const escapedSearch = searchQuery.replace(/[/\\&\n]/g, '\\$&');
        const escapedReplace = replaceText.replace(/[/\\&\n]/g, '\\$&');
        // Quote the file path to prevent shell injection
        const safeFile = file.replace(/'/g, "'\\''");
        const cmd = `sed -i 's/${escapedSearch}/${escapedReplace}/g' '${safeFile}'`;

        if (useDaytona) {
          await daytonaExec(containerId, cmd, { timeoutSecs: 30 });
        } else {
          const container = docker.getContainer(containerId);
          await this.execCommand(container, cmd);
        }
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
  private parseRipgrepOutput(output: string, workspacePath: string = '/workspace'): SearchResult[] {
    const results: SearchResult[] = [];
    const pathPrefix = workspacePath.endsWith('/') ? workspacePath : workspacePath + '/';

    for (const line of output.split('\n')) {
      if (!line.trim()) continue;

      try {
        const data = JSON.parse(line);

        if (data.type === 'match') {
          const match = data.data;
          results.push({
            file: match.path.text.replace(pathPrefix, ''),
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
