"use strict";
/**
 * Search Service - Uses ripgrep for fast file search
 *
 * Supports both Docker containers and Daytona sandboxes.
 * Daytona sandboxes are routed through daytonaExec instead of Docker exec.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchService = exports.SearchService = void 0;
const dockerode_1 = __importDefault(require("dockerode"));
const daytona_file_ops_js_1 = require("./daytona-file-ops.js");
const docker = new dockerode_1.default();
/** Workspace path inside Daytona sandboxes */
const DAYTONA_WORKSPACE = '/home/daytona';
/** Check whether a containerId refers to a Daytona sandbox */
function isDaytonaSandbox(containerId) {
    return !!global.__daytonaSandboxIds?.has(containerId);
}
class SearchService {
    /**
     * Search in files using ripgrep
     */
    async search(containerId, query, options = {}) {
        if (!query.trim())
            return [];
        const useDaytona = isDaytonaSandbox(containerId);
        const workspacePath = useDaytona ? DAYTONA_WORKSPACE : '/workspace';
        // Build ripgrep command
        let cmd = 'rg --json --line-number --column';
        if (!options.caseSensitive)
            cmd += ' -i';
        if (options.wholeWord)
            cmd += ' -w';
        if (options.regex)
            cmd += ' -e';
        if (options.include)
            cmd += ` -g "${options.include.replace(/["\\`$]/g, '\\$&')}"`;
        if (options.exclude)
            cmd += ` -g "!${options.exclude.replace(/["\\`$]/g, '\\$&')}"`;
        const maxResults = options.maxResults || 1000;
        cmd += ` -m ${maxResults}`;
        // Escape query for shell (double-quote context)
        const escapedQuery = query.replace(/["\\`$]/g, '\\$&');
        cmd += ` "${escapedQuery}" ${workspacePath} 2>/dev/null || true`;
        try {
            let output;
            if (useDaytona) {
                const result = await (0, daytona_file_ops_js_1.daytonaExec)(containerId, cmd, { timeoutSecs: 30 });
                output = result.output;
            }
            else {
                const container = docker.getContainer(containerId);
                output = await this.execCommand(container, cmd);
            }
            return this.parseRipgrepOutput(output, workspacePath);
        }
        catch (error) {
            console.error('[Search] Error:', error);
            return [];
        }
    }
    /**
     * Replace in files
     */
    async replace(containerId, searchQuery, replaceText, files) {
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
                    await (0, daytona_file_ops_js_1.daytonaExec)(containerId, cmd, { timeoutSecs: 30 });
                }
                else {
                    const container = docker.getContainer(containerId);
                    await this.execCommand(container, cmd);
                }
                filesModified++;
            }
            catch (error) {
                console.error(`[Search] Replace failed for ${file}:`, error);
            }
        }
        return { success: true, filesModified };
    }
    /**
     * Parse ripgrep JSON output
     */
    parseRipgrepOutput(output, workspacePath = '/workspace') {
        const results = [];
        const pathPrefix = workspacePath.endsWith('/') ? workspacePath : workspacePath + '/';
        for (const line of output.split('\n')) {
            if (!line.trim())
                continue;
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
            }
            catch {
                // Skip non-JSON lines
            }
        }
        return results;
    }
    async execCommand(container, command) {
        const exec = await container.exec({
            Cmd: ['/bin/bash', '-c', command],
            AttachStdout: true,
            AttachStderr: true,
        });
        const stream = await exec.start({});
        return new Promise((resolve, reject) => {
            let output = '';
            stream.on('data', (chunk) => {
                output += chunk.slice(8).toString();
            });
            stream.on('end', () => resolve(output.trim()));
            stream.on('error', reject);
        });
    }
}
exports.SearchService = SearchService;
exports.searchService = new SearchService();
