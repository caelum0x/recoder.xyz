"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.devServerManager = exports.DevServerManager = void 0;
exports.setExpoPublicHostname = setExpoPublicHostname;
exports.detectFrameworkFromContainer = detectFrameworkFromContainer;
exports.getInstallCommand = getInstallCommand;
exports.getDevCommand = getDevCommand;
exports.getExpectedPorts = getExpectedPorts;
const dockerode_1 = __importDefault(require("dockerode"));
const http_1 = __importDefault(require("http"));
const auto_restore_js_1 = require("./auto-restore.js");
const daytona_file_ops_js_1 = require("./daytona-file-ops.js");
const daytona_client_js_1 = require("./daytona-client.js");
const docker = new dockerode_1.default();
// ── Expo public hostname (set by server.ts at startup) ──────────────
let expoPublicHostname = process.env.PUBLIC_HOSTNAME || 'localhost';
/**
 * Set the public hostname used for Expo's REACT_NATIVE_PACKAGER_HOSTNAME.
 * Called from server.ts after detecting the external IP.
 */
function setExpoPublicHostname(hostname) {
    expoPublicHostname = hostname;
    console.log(`[DevServer] Expo public hostname set to: ${hostname}`);
}
/**
 * Dev Server Manager - handles background dev server processes
 * Keeps dev server logs separate from interactive terminals
 */
class DevServerManager {
    servers = new Map();
    /**
     * Start a dev server in background for a project
     */
    async start(containerId, projectId, framework = 'vite', ports, options) {
        const isDaytona = options?.daytona === true;
        const command = this.getStartCommand(framework);
        console.log(`[DevServer] Starting ${framework} for project ${projectId} (${isDaytona ? 'Daytona' : 'Docker'})`);
        const exec = isDaytona
            ? (cmd) => this.daytonaExec(containerId, cmd)
            : (cmd) => this.execCommand(docker.getContainer(containerId), cmd);
        // Kill any existing dev server first
        try {
            if (isDaytona) {
                await (0, daytona_file_ops_js_1.cleanupDaytonaDevServerProcesses)(containerId, projectId);
            }
            else {
                const killPattern = this.getKillPattern(framework);
                await exec(`pkill -f "${killPattern}" || true`);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        catch { }
        // Ensure workspace directory exists
        const workDir = isDaytona ? '/home/daytona' : '/workspace';
        await exec(`mkdir -p ${workDir}`);
        await exec('mkdir -p /tmp && : > /tmp/dev.log');
        // Start the dev server in background
        const startScript = `cd ${workDir} && BROWSER=none nohup ${command} > /tmp/dev.log 2>&1 &`;
        if (isDaytona) {
            await (0, daytona_file_ops_js_1.daytonaExecBackground)(containerId, command, workDir, { skipCleanup: true, projectId });
            console.log('[DevServer] Started via Daytona background exec');
        }
        else {
            const container = docker.getContainer(containerId);
            const dockerExec = await container.exec({
                Cmd: ['/bin/bash', '-c', `cd ${workDir} && BROWSER=none exec setsid ${command} > /tmp/dev.log 2>&1 < /dev/null`],
                AttachStdout: false,
                AttachStderr: false,
                Tty: false,
            });
            await dockerExec.start({ Detach: true });
        }
        this.servers.set(projectId, {
            projectId,
            framework,
            startedAt: Date.now(),
            status: 'starting',
        });
        console.log(`[DevServer] Process started for ${projectId}, waiting for ready...`);
        // Wait for server to be ready
        let healthCheck;
        if (isDaytona && options?.daytonaPreviewUrl) {
            healthCheck = await this.waitForDaytonaReady(options.daytonaPreviewUrl, 30000);
        }
        else {
            healthCheck = await this.waitForReady(ports, 30000);
        }
        if (healthCheck.ready) {
            const info = this.servers.get(projectId);
            if (info) {
                info.status = 'running';
                info.port = healthCheck.port;
            }
            console.log(`[DevServer] ✅ Ready on port ${healthCheck.port || 3000}`);
            return { ready: true, port: healthCheck.port || 3000 };
        }
        // Check if there's an error
        const logs = await this.getLogs(containerId, projectId, 50, undefined, isDaytona);
        console.log(`[DevServer] ⚠️ Not ready yet, logs:\n${logs}`);
        return { ready: false, logs };
    }
    /**
     * Stop the dev server for a project
     */
    async stop(containerId, projectId, isDaytona) {
        const info = this.servers.get(projectId);
        const framework = info?.framework || 'vite';
        try {
            if (isDaytona) {
                await (0, daytona_file_ops_js_1.cleanupDaytonaDevServerProcesses)(containerId, projectId);
            }
            else {
                const killPattern = this.getKillPattern(framework);
                const cmd = `pkill -f "${killPattern}" || true`;
                await this.execCommand(docker.getContainer(containerId), cmd);
            }
            this.servers.delete(projectId);
            console.log(`[DevServer] Stopped for ${projectId}`);
            return true;
        }
        catch (error) {
            console.error(`[DevServer] Failed to stop: ${error.message}`);
            return false;
        }
    }
    /**
     * Restart the dev server
     */
    async restart(containerId, projectId, ports) {
        const info = this.servers.get(projectId);
        const framework = info?.framework || 'vite';
        await this.stop(containerId, projectId);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.start(containerId, projectId, framework, ports);
    }
    /**
     * Register an externally-started server (e.g. Expo started via /api/expo-start)
     * so the manager knows the framework for log routing.
     */
    registerExternalServer(projectId, framework) {
        if (!this.servers.has(projectId)) {
            this.servers.set(projectId, {
                projectId,
                framework,
                startedAt: Date.now(),
                status: 'running',
            });
        }
    }
    /**
     * Get dev server logs
     * @param source - optional hint: 'expo' reads /tmp/expo-dev.log
     */
    async getLogs(containerId, projectId, tail = 100, source, isDaytona) {
        if (isDaytona) {
            try {
                const result = await this.daytonaExec(containerId, `tail -n ${tail} /tmp/dev.log 2>/dev/null || echo "No logs found"`);
                return result;
            }
            catch {
                return 'Failed to read logs (Daytona)';
            }
        }
        const container = docker.getContainer(containerId);
        // Determine the correct log file
        const isExpo = source === 'expo' || this.servers.get(projectId)?.framework === 'expo';
        const logFile = isExpo ? '/tmp/expo-dev.log' : '/tmp/dev.log';
        try {
            const logs = await this.execCommand(container, `tail -n ${tail} ${logFile} 2>/dev/null || echo "No logs found"`);
            // Check for errors and trigger auto-restore if needed
            const { hasError, errors, details } = auto_restore_js_1.autoRestoreManager.detectErrors(logs);
            if (hasError) {
                console.log(`[DevServer] Errors detected in ${projectId}:`, errors);
                if (details.length > 0) {
                    console.log(`[DevServer] Error details:`, details[0]);
                }
                // Store error details for retrieval
                auto_restore_js_1.autoRestoreManager.setLastErrors(projectId, details.length > 0 ? details : errors);
                // Update dev server status to error state
                const info = this.servers.get(projectId);
                if (info) {
                    info.status = 'error';
                }
                const result = await auto_restore_js_1.autoRestoreManager.attemptRestore(containerId, projectId);
                if (result.success) {
                    console.log(`[DevServer] Auto-restored ${projectId} to ${result.restoredTo}`);
                }
                else if (result.error) {
                    console.log(`[DevServer] Auto-restore failed: ${result.error}`);
                }
            }
            else {
                // Reset error count on successful build
                auto_restore_js_1.autoRestoreManager.resetErrors(projectId);
                // Update status to running if server is responding
                const info = this.servers.get(projectId);
                if (info && info.status === 'error') {
                    info.status = 'running';
                }
            }
            return logs;
        }
        catch {
            return 'Failed to read logs';
        }
    }
    /**
     * Get detailed error info for a project
     */
    getErrorInfo(projectId) {
        const state = auto_restore_js_1.autoRestoreManager.getState(projectId);
        return {
            hasErrors: state.lastErrors.length > 0,
            errors: state.lastErrors,
            retryState: {
                errorCount: state.errorCount,
                maxRetries: state.maxRetries,
                canRetry: state.canRetry,
                nextRetryIn: state.nextRetryIn,
            },
        };
    }
    /**
     * Force retry after max retries reached
     */
    async forceRetry(containerId, projectId, ports) {
        console.log(`[DevServer] Force retry requested for ${projectId}`);
        auto_restore_js_1.autoRestoreManager.forceReset(projectId);
        return this.restart(containerId, projectId, ports);
    }
    /**
     * Notify that user made a file change (gives more retry attempts)
     */
    onFileChange(projectId) {
        auto_restore_js_1.autoRestoreManager.resetOnFileChange(projectId);
    }
    /**
     * Stream logs via WebSocket
     */
    async streamLogs(containerId, projectId, onData) {
        const container = docker.getContainer(containerId);
        let running = true;
        let lastPosition = 0;
        const isExpo = this.servers.get(projectId)?.framework === 'expo';
        const logFile = isExpo ? '/tmp/expo-dev.log' : '/tmp/dev.log';
        const poll = async () => {
            while (running) {
                try {
                    const logs = await this.execCommand(container, `tail -c +${lastPosition + 1} ${logFile} 2>/dev/null || true`);
                    if (logs.length > 0) {
                        lastPosition += logs.length;
                        onData(logs);
                    }
                }
                catch { }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        };
        poll();
        return () => { running = false; };
    }
    /**
     * Get status of dev server
     */
    getStatus(projectId) {
        return this.servers.get(projectId);
    }
    /**
     * Check if dev server is running
     */
    isRunning(projectId) {
        const info = this.servers.get(projectId);
        return info?.status === 'running';
    }
    getStartCommand(framework) {
        const commands = {
            // Node.js frameworks — use npm (bun not available in Daytona sandbox)
            vite: 'npm run dev -- --host 0.0.0.0',
            next: 'npm run dev -- --hostname 0.0.0.0',
            react: 'npm start',
            vue: 'npm run serve',
            bun: 'npm run dev',
            static: 'python3 -m http.server 5173 --bind 0.0.0.0 2>/dev/null || python -m http.server 5173 --bind 0.0.0.0 2>/dev/null || npx serve -l 5173',
            // REACT_NATIVE_PACKAGER_HOSTNAME: hostname for QR codes/connection URLs (container IP is unreachable from phones)
            // EXPO_DEVTOOLS_LISTEN_ADDRESS: allow connections from outside the container
            // BROWSER=none: don't try to open a browser inside the container
            // CI=1: prevent interactive prompts that would hang in a container
            // Supports both web and native (Expo Go) — no --web flag so Metro serves both
            expo: `REACT_NATIVE_PACKAGER_HOSTNAME=${expoPublicHostname} EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0 BROWSER=none CI=1 npx expo start --host 0.0.0.0 --port 8081`,
            // Python frameworks
            flask: 'python -m flask run --host=0.0.0.0 --port=5173',
            django: 'python manage.py runserver 0.0.0.0:5173',
            fastapi: 'uvicorn main:app --host 0.0.0.0 --port 5173 --reload',
            python: 'python main.py',
            // Rust
            rust: 'cargo run',
            // Go
            go: 'go run .',
            // Java
            'java-spring': 'mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=8080',
            java: 'mvn exec:java',
        };
        return commands[framework] || 'npm run dev -- --host 0.0.0.0';
    }
    /**
     * Get the kill pattern for a framework's dev server process
     */
    getKillPattern(framework) {
        const patterns = {
            // Node.js
            vite: 'npm run dev|vite',
            next: 'next dev',
            react: 'react-scripts start',
            vue: 'vue-cli-service serve',
            static: 'python3 -m http.server 5173|python -m http.server 5173|serve -l 5173',
            expo: 'expo start|metro',
            // Python
            flask: 'flask run|python.*flask',
            django: 'manage.py runserver',
            fastapi: 'uvicorn',
            python: 'python main.py',
            // Rust
            rust: 'cargo run|target/debug',
            // Go
            go: 'go run',
            // Java
            'java-spring': 'spring-boot:run|java.*-jar',
            java: 'mvn exec:java|java.*-jar',
        };
        return patterns[framework] || 'npm run dev|vite|next dev';
    }
    async waitForReady(ports, maxWaitMs = 60000) {
        const startTime = Date.now();
        const checkInterval = 1000;
        console.log(`[DevServer] Waiting for ready on ports: ${ports.join(', ')}`);
        while (Date.now() - startTime < maxWaitMs) {
            for (const port of ports) {
                try {
                    const isReady = await new Promise((resolve) => {
                        const req = http_1.default.get(`http://127.0.0.1:${port}`, { timeout: 2000 }, (res) => {
                            resolve(res.statusCode !== undefined && res.statusCode < 500);
                        });
                        req.on('error', () => resolve(false));
                        req.on('timeout', () => { req.destroy(); resolve(false); });
                    });
                    if (isReady) {
                        return { ready: true, port };
                    }
                }
                catch { }
            }
            const elapsed = Date.now() - startTime;
            if (elapsed % 5000 < checkInterval) {
                console.log(`[DevServer] Still waiting... (${Math.round(elapsed / 1000)}s elapsed)`);
            }
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        return { ready: false };
    }
    async daytonaExec(sandboxId, cmd) {
        const dc = (0, daytona_client_js_1.getDaytonaClient)();
        const result = await dc.execCommand(sandboxId, cmd, { timeoutSecs: 30 });
        return result.output;
    }
    async waitForDaytonaReady(previewUrl, maxWaitMs = 30000) {
        const startTime = Date.now();
        const checkInterval = 2000;
        // Extract sandboxId from previewUrl pattern: https://{port}-{sandboxId}.sandbox.recoder.xyz
        const urlMatch = previewUrl.match(/^https?:\/\/\d+-([^.]+)\./);
        const sandboxId = urlMatch?.[1];
        if (!sandboxId) {
            console.log(`[DevServer] Cannot extract sandboxId from preview URL: ${previewUrl}`);
            return { ready: false };
        }
        console.log(`[DevServer] Waiting for Daytona preview ready (sandbox: ${sandboxId.slice(0, 12)})`);
        while (Date.now() - startTime < maxWaitMs) {
            try {
                // Use internal curl inside the sandbox to check if dev server is responding
                // This avoids the OIDC redirect that happens via the external daytona-proxy
                const dc = (0, daytona_client_js_1.getDaytonaClient)();
                const curlResult = await dc.execCommand(sandboxId, 'for p in 5173 5174 5175 5176 5177 5178 5179 5180 3000 3001 4173 4174 8080 8081; do curl -sf http://localhost:$p > /dev/null 2>&1 && echo "PORT$p" && exit 0; done; echo "NOTREADY"', { timeoutSecs: 8 });
                const output = curlResult.output.trim();
                const portMatch = output.match(/PORT(\d+)/);
                if (portMatch) {
                    const port = parseInt(portMatch[1], 10);
                    console.log(`[DevServer] Daytona dev server responding on port ${port}`);
                    return { ready: true, port };
                }
            }
            catch { }
            const elapsed = Date.now() - startTime;
            if (elapsed % 5000 < checkInterval) {
                console.log(`[DevServer] Daytona preview not ready yet... (${Math.round(elapsed / 1000)}s)`);
            }
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }
        return { ready: false };
    }
    async execCommand(container, cmd) {
        const exec = await container.exec({
            Cmd: ['/bin/bash', '-c', cmd],
            AttachStdout: true,
            AttachStderr: true,
        });
        const stream = await exec.start({});
        const output = await new Promise((resolve, reject) => {
            let out = '';
            stream.on('data', (chunk) => {
                out += chunk.slice(8).toString();
            });
            stream.on('end', () => resolve(out.trim()));
            stream.on('error', reject);
        });
        return output;
    }
}
exports.DevServerManager = DevServerManager;
// Export singleton instance
exports.devServerManager = new DevServerManager();
/**
 * Auto-detect framework from project files in a container
 * Returns the detected framework name or 'unknown'
 */
async function detectFrameworkFromContainer(containerId) {
    const docker = new dockerode_1.default();
    const container = docker.getContainer(containerId);
    const execCommand = async (cmd) => {
        try {
            const exec = await container.exec({
                Cmd: ['/bin/bash', '-c', cmd],
                AttachStdout: true,
                AttachStderr: true,
            });
            const stream = await exec.start({});
            return new Promise((resolve) => {
                let out = '';
                stream.on('data', (chunk) => { out += chunk.slice(8).toString(); });
                stream.on('end', () => resolve(out.trim()));
                stream.on('error', () => resolve(''));
            });
        }
        catch {
            return '';
        }
    };
    // Check for package.json (Node.js projects)
    const packageJson = await execCommand('cat /workspace/package.json 2>/dev/null');
    if (packageJson) {
        try {
            const pkg = JSON.parse(packageJson);
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            // Framework detection order matters - more specific first
            if (deps['next'])
                return 'next';
            if (deps['expo'] || deps['react-native'])
                return 'expo';
            if (deps['nuxt'])
                return 'nuxt';
            if (deps['@sveltejs/kit'])
                return 'sveltekit';
            if (deps['svelte'])
                return 'svelte';
            if (deps['@angular/core'])
                return 'angular';
            if (deps['vue'])
                return 'vue';
            if (deps['vite'])
                return 'vite';
            if (deps['react'])
                return 'react';
            if (deps['express'] || deps['fastify'] || deps['koa'])
                return 'node-server';
            return 'node';
        }
        catch { }
    }
    // Check for Python projects
    const requirements = await execCommand('cat /workspace/requirements.txt 2>/dev/null');
    const pyproject = await execCommand('cat /workspace/pyproject.toml 2>/dev/null');
    const pipfile = await execCommand('cat /workspace/Pipfile 2>/dev/null');
    if (requirements || pyproject || pipfile) {
        const pythonDeps = (requirements + pyproject + pipfile).toLowerCase();
        if (pythonDeps.includes('django'))
            return 'django';
        if (pythonDeps.includes('flask'))
            return 'flask';
        if (pythonDeps.includes('fastapi'))
            return 'fastapi';
        if (pythonDeps.includes('streamlit'))
            return 'streamlit';
        if (pythonDeps.includes('gradio'))
            return 'gradio';
        return 'python';
    }
    // Check for Rust projects
    const cargoToml = await execCommand('cat /workspace/Cargo.toml 2>/dev/null');
    if (cargoToml) {
        if (cargoToml.includes('actix') || cargoToml.includes('rocket') || cargoToml.includes('axum')) {
            return 'rust-web';
        }
        return 'rust';
    }
    // Check for Go projects
    const goMod = await execCommand('cat /workspace/go.mod 2>/dev/null');
    if (goMod) {
        if (goMod.includes('gin') || goMod.includes('echo') || goMod.includes('fiber')) {
            return 'go-web';
        }
        return 'go';
    }
    // Check for Java projects
    const pomXml = await execCommand('cat /workspace/pom.xml 2>/dev/null');
    const buildGradle = await execCommand('cat /workspace/build.gradle 2>/dev/null');
    if (pomXml || buildGradle) {
        const javaConfig = pomXml + buildGradle;
        if (javaConfig.includes('spring-boot'))
            return 'java-spring';
        return 'java';
    }
    // Check for static HTML
    const indexHtml = await execCommand('ls /workspace/index.html 2>/dev/null');
    if (indexHtml)
        return 'static';
    return 'unknown';
}
/**
 * Get the install command for a detected framework
 */
function getInstallCommand(framework) {
    const commands = {
        // Node.js - use npm (bun not available in Daytona sandbox)
        'node': 'npm install --legacy-peer-deps',
        'vite': 'npm install --legacy-peer-deps',
        'next': 'npm install --legacy-peer-deps',
        'react': 'npm install --legacy-peer-deps',
        'vue': 'npm install --legacy-peer-deps',
        'svelte': 'npm install --legacy-peer-deps',
        'sveltekit': 'npm install --legacy-peer-deps',
        'angular': 'npm install --legacy-peer-deps',
        'nuxt': 'npm install --legacy-peer-deps',
        'expo': 'npm install --legacy-peer-deps',
        'node-server': 'npm install --legacy-peer-deps',
        // Python
        'python': 'pip install -r requirements.txt 2>/dev/null || pip install -e . 2>/dev/null || echo "No deps"',
        'flask': 'pip install -r requirements.txt 2>/dev/null || pip install flask',
        'django': 'pip install -r requirements.txt 2>/dev/null || pip install django',
        'fastapi': 'pip install -r requirements.txt 2>/dev/null || pip install fastapi uvicorn',
        'streamlit': 'pip install -r requirements.txt 2>/dev/null || pip install streamlit',
        'gradio': 'pip install -r requirements.txt 2>/dev/null || pip install gradio',
        // Rust
        'rust': 'cargo build',
        'rust-web': 'cargo build',
        // Go
        'go': 'go mod download',
        'go-web': 'go mod download',
        // Java
        'java': 'mvn dependency:resolve 2>/dev/null || gradle dependencies 2>/dev/null || echo "No deps"',
        'java-spring': 'mvn dependency:resolve 2>/dev/null || gradle dependencies 2>/dev/null || echo "No deps"',
        // Static - no install needed
        'static': 'echo "Static site, no install needed"',
    };
    return commands[framework] || commands['node'];
}
/**
 * Get the dev server start command for a detected framework
 */
function getDevCommand(framework) {
    const commands = {
        // Node.js frameworks
        'node': 'npm run dev -- --host 0.0.0.0',
        'vite': 'npm run dev -- --host 0.0.0.0',
        'next': 'npm run dev',
        'react': 'npm start',
        'vue': 'npm run serve',
        'svelte': 'npm run dev -- --host 0.0.0.0',
        'sveltekit': 'npm run dev -- --host 0.0.0.0',
        'angular': 'npm start -- --host 0.0.0.0',
        'nuxt': 'npm run dev',
        'expo': `REACT_NATIVE_PACKAGER_HOSTNAME=${expoPublicHostname} EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0 BROWSER=none CI=1 npx expo start --host 0.0.0.0 --port 8081`,
        'node-server': 'npm start || node index.js || node server.js',
        // Python frameworks
        'python': 'python main.py 2>/dev/null || python app.py 2>/dev/null || python server.py',
        'flask': 'flask run --host=0.0.0.0 --port=5173 2>/dev/null || python -m flask run --host=0.0.0.0 --port=5173',
        'django': 'python manage.py runserver 0.0.0.0:5173',
        'fastapi': 'uvicorn main:app --host 0.0.0.0 --port 5173 --reload 2>/dev/null || uvicorn app:app --host 0.0.0.0 --port 5173 --reload',
        'streamlit': 'streamlit run app.py --server.address 0.0.0.0 --server.port 5173',
        'gradio': 'python app.py',
        // Rust
        'rust': 'cargo run',
        'rust-web': 'cargo run',
        // Go
        'go': 'go run .',
        'go-web': 'go run .',
        // Java
        'java': 'mvn exec:java 2>/dev/null || gradle run 2>/dev/null || java -jar target/*.jar',
        'java-spring': 'mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=8080 2>/dev/null || gradle bootRun',
        // Static - use simple HTTP server
        'static': 'python3 -m http.server 5173 --bind 0.0.0.0 2>/dev/null || python -m http.server 5173 --bind 0.0.0.0 2>/dev/null || npx serve -l 5173',
    };
    return commands[framework] || commands['vite'];
}
/**
 * Get expected ports for a framework
 */
function getExpectedPorts(framework, basePorts) {
    // Some frameworks have specific default ports
    const defaultPorts = {
        'next': [3000],
        'react': [3000],
        'angular': [4200],
        'expo': [8081, 19000, 19001],
        'django': [5173, 8000],
        'flask': [5173, 5000],
        'fastapi': [5173, 8000],
        'streamlit': [5173, 8501],
        'java-spring': [8080],
    };
    const frameworkPorts = defaultPorts[framework] || [];
    return [...new Set([...basePorts, ...frameworkPorts])];
}
