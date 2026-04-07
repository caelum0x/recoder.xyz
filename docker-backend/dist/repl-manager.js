"use strict";
/**
 * REPL Manager - Manages interactive REPL sessions within Docker containers and Daytona sandboxes
 * Supports Node.js, Python, Ruby, and Go (via gore)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.replManager = exports.REPL_CONFIGS = void 0;
const dockerode_1 = __importDefault(require("dockerode"));
const stream_1 = require("stream");
const daytona_file_ops_js_1 = require("./daytona-file-ops.js");
exports.REPL_CONFIGS = {
    nodejs: {
        name: 'Node.js',
        command: 'node',
        args: ['--interactive'],
        prompt: /^> $/m,
        multilinePrompt: /^\.\.\. $/m,
        exitCommand: '.exit',
        checkCommand: 'node --version',
    },
    python: {
        name: 'Python',
        command: 'python3',
        args: ['-u', '-i'], // -u for unbuffered output
        prompt: /^>>> $/m,
        multilinePrompt: /^\.\.\. $/m,
        exitCommand: 'exit()',
        checkCommand: 'python3 --version',
    },
    ruby: {
        name: 'Ruby',
        command: 'irb',
        args: ['--simple-prompt', '--noverbose'],
        prompt: /^>> $/m,
        multilinePrompt: /^\?> $/m,
        exitCommand: 'exit',
        checkCommand: 'ruby --version',
    },
    go: {
        name: 'Go (gore)',
        command: 'gore',
        args: [],
        prompt: /^gore> $/m,
        multilinePrompt: /^\.\.\.\.\. $/m,
        exitCommand: ':quit',
        checkCommand: 'which gore || go version',
    },
};
class ReplManager {
    docker;
    sessions = new Map();
    cleanupInterval = null;
    SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    constructor() {
        this.docker = new dockerode_1.default();
        this.startCleanupInterval();
    }
    startCleanupInterval() {
        // Clean up idle sessions every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanupIdleSessions();
        }, 5 * 60 * 1000);
    }
    cleanupIdleSessions() {
        const now = Date.now();
        for (const [sessionId, session] of this.sessions) {
            if (now - session.lastActive > this.SESSION_TIMEOUT) {
                console.log(`[REPL] Cleaning up idle session: ${sessionId}`);
                this.stopSession(session.projectId, session.language).catch(console.error);
            }
        }
    }
    getSessionKey(projectId, language) {
        return `${projectId}:${language}`;
    }
    /**
     * Check if a REPL language is available in the container or Daytona sandbox
     */
    async checkLanguageAvailable(containerId, language, isDaytona = false) {
        const config = exports.REPL_CONFIGS[language];
        // Daytona sandbox: use daytonaExec instead of Docker exec
        if (isDaytona) {
            try {
                const result = await (0, daytona_file_ops_js_1.daytonaExec)(containerId, config.checkCommand, { timeoutSecs: 10 });
                return result.exitCode === 0 && result.output.trim().length > 0;
            }
            catch (error) {
                console.error(`[REPL] Error checking ${language} availability in Daytona sandbox:`, error);
                return false;
            }
        }
        // Docker container
        const container = this.docker.getContainer(containerId);
        try {
            const exec = await container.exec({
                Cmd: ['sh', '-c', config.checkCommand],
                AttachStdout: true,
                AttachStderr: true,
            });
            const stream = await exec.start({});
            return new Promise((resolve) => {
                let hasOutput = false;
                stream.on('data', () => {
                    hasOutput = true;
                });
                stream.on('end', () => {
                    resolve(hasOutput);
                });
                stream.on('error', () => {
                    resolve(false);
                });
                // Timeout after 5 seconds
                setTimeout(() => resolve(hasOutput), 5000);
            });
        }
        catch (error) {
            console.error(`[REPL] Error checking ${language} availability:`, error);
            return false;
        }
    }
    /**
     * Start a REPL session
     */
    async startSession(projectId, containerId, language, isDaytona = false) {
        const sessionKey = this.getSessionKey(projectId, language);
        // Check if session already exists
        const existing = this.sessions.get(sessionKey);
        if (existing) {
            existing.lastActive = Date.now();
            return {
                sessionId: existing.id,
                welcomeMessage: `Reconnected to existing ${exports.REPL_CONFIGS[language].name} session`,
            };
        }
        const config = exports.REPL_CONFIGS[language];
        // For Go, check if gore is available, fallback to just running .go files
        if (language === 'go') {
            const goreAvailable = await this.checkLanguageAvailable(containerId, 'go', isDaytona);
            if (!goreAvailable) {
                throw new Error('Go REPL (gore) is not available. Install it with: go install github.com/x-motemen/gore/cmd/gore@latest');
            }
        }
        // Daytona sandbox: use daytonaExec-based polling instead of Docker interactive streams
        if (isDaytona) {
            return this.startDaytonaSession(projectId, containerId, language, config);
        }
        // Docker container: use interactive Docker exec stream
        const container = this.docker.getContainer(containerId);
        // Create exec instance for interactive REPL
        const exec = await container.exec({
            Cmd: [config.command, ...config.args],
            AttachStdin: true,
            AttachStdout: true,
            AttachStderr: true,
            Tty: true,
            WorkingDir: '/workspace',
            Env: [
                'TERM=xterm-256color',
                'PYTHONDONTWRITEBYTECODE=1', // Prevent __pycache__ in Python
                'NODE_NO_WARNINGS=1', // Suppress Node.js warnings
            ],
        });
        const stream = await exec.start({ hijack: true, stdin: true });
        const execInfo = await exec.inspect();
        const sessionId = `repl-${projectId}-${language}-${Date.now()}`;
        const session = {
            id: sessionId,
            projectId,
            language,
            containerId,
            stream,
            execId: execInfo.ID,
            startedAt: Date.now(),
            lastActive: Date.now(),
            outputBuffer: '',
            isWaitingForPrompt: true,
            pendingResolve: null,
            pendingReject: null,
        };
        // Set up stream handlers
        this.setupStreamHandlers(session);
        this.sessions.set(sessionKey, session);
        console.log(`[REPL] Started ${language} session for project ${projectId}`);
        // Wait for initial prompt
        const welcomeMessage = await this.waitForOutput(session, 5000);
        return { sessionId, welcomeMessage };
    }
    /**
     * Start a REPL session in a Daytona sandbox.
     * Daytona does not support interactive streams, so we simulate a REPL by
     * executing each command via daytonaExec. The session object uses a
     * PassThrough stream as a no-op placeholder.
     */
    async startDaytonaSession(projectId, containerId, language, config) {
        const sessionKey = this.getSessionKey(projectId, language);
        const sessionId = `repl-${projectId}-${language}-${Date.now()}`;
        // Use a PassThrough as a placeholder stream (Daytona sessions don't use persistent streams)
        const placeholderStream = new stream_1.PassThrough();
        const session = {
            id: sessionId,
            projectId,
            language,
            containerId,
            stream: placeholderStream,
            execId: `daytona-${sessionId}`,
            startedAt: Date.now(),
            lastActive: Date.now(),
            outputBuffer: '',
            isWaitingForPrompt: false,
            pendingResolve: null,
            pendingReject: null,
            isDaytona: true,
        };
        this.sessions.set(sessionKey, session);
        console.log(`[REPL] Started Daytona ${language} session for project ${projectId}`);
        // Get a welcome message by running the version command
        let welcomeMessage = `${config.name} REPL (Daytona sandbox)`;
        try {
            const result = await (0, daytona_file_ops_js_1.daytonaExec)(containerId, config.checkCommand, { timeoutSecs: 10 });
            if (result.exitCode === 0 && result.output.trim()) {
                welcomeMessage = `${config.name} REPL (Daytona sandbox) - ${result.output.trim()}`;
            }
        }
        catch {
            // Ignore — use default welcome message
        }
        return { sessionId, welcomeMessage };
    }
    setupStreamHandlers(session) {
        const config = exports.REPL_CONFIGS[session.language];
        session.stream.on('data', (data) => {
            const text = data.toString();
            session.outputBuffer += text;
            session.lastActive = Date.now();
            // Check if we have a complete prompt
            if (session.isWaitingForPrompt && session.pendingResolve) {
                // Check for prompt
                if (config.prompt.test(session.outputBuffer) || config.multilinePrompt.test(session.outputBuffer)) {
                    const output = session.outputBuffer;
                    session.outputBuffer = '';
                    session.isWaitingForPrompt = false;
                    session.pendingResolve(output);
                    session.pendingResolve = null;
                    session.pendingReject = null;
                }
            }
        });
        session.stream.on('error', (error) => {
            console.error(`[REPL] Stream error for session ${session.id}:`, error);
            if (session.pendingReject) {
                session.pendingReject(error);
                session.pendingResolve = null;
                session.pendingReject = null;
            }
        });
        session.stream.on('end', () => {
            console.log(`[REPL] Stream ended for session ${session.id}`);
            const sessionKey = this.getSessionKey(session.projectId, session.language);
            this.sessions.delete(sessionKey);
            if (session.pendingReject) {
                session.pendingReject(new Error('REPL session ended'));
                session.pendingResolve = null;
                session.pendingReject = null;
            }
        });
    }
    waitForOutput(session, timeoutMs = 10000) {
        return new Promise((resolve, reject) => {
            session.isWaitingForPrompt = true;
            session.pendingResolve = resolve;
            session.pendingReject = reject;
            // Timeout
            setTimeout(() => {
                if (session.pendingResolve) {
                    // Return whatever we have
                    const output = session.outputBuffer;
                    session.outputBuffer = '';
                    session.isWaitingForPrompt = false;
                    session.pendingResolve(output || '(timeout - no output)');
                    session.pendingResolve = null;
                    session.pendingReject = null;
                }
            }, timeoutMs);
        });
    }
    /**
     * Execute code in a REPL session
     */
    async executeCode(projectId, language, code) {
        const sessionKey = this.getSessionKey(projectId, language);
        const session = this.sessions.get(sessionKey);
        if (!session) {
            throw new Error(`No active ${exports.REPL_CONFIGS[language].name} session. Start one first.`);
        }
        session.lastActive = Date.now();
        // Daytona sandbox: execute via daytonaExec (no persistent stream)
        if (session.isDaytona) {
            return this.executeDaytonaCode(session, language, code);
        }
        session.outputBuffer = '';
        // Write code to REPL
        session.stream.write(code + '\n');
        // Wait for output
        const output = await this.waitForOutput(session, 30000);
        // Clean up the output (remove the echoed command and prompts)
        return this.cleanOutput(output, code, language);
    }
    /**
     * Execute code in a Daytona REPL session by running the code through a one-shot command.
     * For multi-line or expression evaluation, we wrap the code appropriately per language.
     */
    async executeDaytonaCode(session, language, code) {
        let command;
        // Daytona workspace path
        const workDir = '/home/daytona';
        const escaped = this.shellEscape(code);
        switch (language) {
            case 'nodejs':
                // Use node -e for one-shot evaluation
                command = `cd "${workDir}" && node -e ${escaped} 2>&1`;
                break;
            case 'python':
                // Use python3 -c for one-shot evaluation
                command = `cd "${workDir}" && python3 -c ${escaped} 2>&1`;
                break;
            case 'ruby':
                // Use ruby -e for one-shot evaluation
                command = `cd "${workDir}" && ruby -e ${escaped} 2>&1`;
                break;
            case 'go':
                // gore doesn't support -e; pipe code via stdin
                command = `cd "${workDir}" && echo ${escaped} | gore 2>&1`;
                break;
            default:
                // Exhaustive — all known languages handled above; fallback for future additions
                command = `cd "${workDir}" && ${exports.REPL_CONFIGS[language].command} -e ${escaped} 2>&1`;
        }
        try {
            const result = await (0, daytona_file_ops_js_1.daytonaExec)(session.containerId, command, { timeoutSecs: 30 });
            return result.output.trim();
        }
        catch (error) {
            throw new Error(`Daytona REPL exec failed: ${error.message}`);
        }
    }
    /**
     * Shell-escape a string for safe embedding in a shell command.
     */
    shellEscape(s) {
        // Wrap in single quotes and escape any internal single quotes
        return "'" + s.replace(/'/g, "'\\''") + "'";
    }
    cleanOutput(output, input, language) {
        const config = exports.REPL_CONFIGS[language];
        let cleaned = output;
        // Remove echoed input
        const inputLines = input.split('\n');
        for (const line of inputLines) {
            cleaned = cleaned.replace(line + '\r\n', '').replace(line + '\n', '');
        }
        // Remove prompts
        cleaned = cleaned.replace(config.prompt, '');
        cleaned = cleaned.replace(config.multilinePrompt, '');
        // Clean up ANSI codes for cleaner display (optional, keep some for color)
        // cleaned = cleaned.replace(/\x1b\[[0-9;]*m/g, '');
        return cleaned.trim();
    }
    /**
     * Stop a REPL session
     */
    async stopSession(projectId, language) {
        const sessionKey = this.getSessionKey(projectId, language);
        const session = this.sessions.get(sessionKey);
        if (!session) {
            return; // Already stopped
        }
        const config = exports.REPL_CONFIGS[language];
        // Daytona sandbox: no persistent stream to tear down, just clean up the session map
        if (session.isDaytona) {
            try {
                session.stream.end();
            }
            catch {
                // PassThrough cleanup is best-effort
            }
            this.sessions.delete(sessionKey);
            console.log(`[REPL] Stopped Daytona ${language} session for project ${projectId}`);
            return;
        }
        // Docker container: send exit command and close stream
        try {
            // Send exit command gracefully
            session.stream.write(config.exitCommand + '\n');
            // Give it a moment to exit
            await new Promise((resolve) => setTimeout(resolve, 500));
            // End the stream
            session.stream.end();
        }
        catch (error) {
            console.error(`[REPL] Error stopping session ${session.id}:`, error);
        }
        this.sessions.delete(sessionKey);
        console.log(`[REPL] Stopped ${language} session for project ${projectId}`);
    }
    /**
     * Get session status
     */
    getSession(projectId, language) {
        const sessionKey = this.getSessionKey(projectId, language);
        return this.sessions.get(sessionKey);
    }
    /**
     * Get all active sessions for a project
     */
    getProjectSessions(projectId) {
        const sessions = [];
        for (const session of this.sessions.values()) {
            if (session.projectId === projectId) {
                sessions.push(session);
            }
        }
        return sessions;
    }
    /**
     * Stop all sessions for a project
     */
    async stopProjectSessions(projectId) {
        const sessions = this.getProjectSessions(projectId);
        for (const session of sessions) {
            await this.stopSession(projectId, session.language);
        }
    }
    /**
     * Get available languages for a container or Daytona sandbox
     */
    async getAvailableLanguages(containerId, isDaytona = false) {
        const available = [];
        // Check each language in parallel
        const checks = await Promise.all(Object.keys(exports.REPL_CONFIGS).map(async (lang) => {
            const isAvailable = await this.checkLanguageAvailable(containerId, lang, isDaytona);
            return { lang, isAvailable };
        }));
        for (const { lang, isAvailable } of checks) {
            if (isAvailable) {
                available.push(lang);
            }
        }
        return available;
    }
    /**
     * Cleanup on shutdown
     */
    async shutdown() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        // Stop all sessions
        for (const session of this.sessions.values()) {
            await this.stopSession(session.projectId, session.language);
        }
    }
}
// Export singleton instance
exports.replManager = new ReplManager();
