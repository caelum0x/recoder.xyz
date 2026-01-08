# Terminal System Fix - Detailed Implementation Plan

## 🎯 Goal
Fix broken terminal system to match Rork.ai's reliability with independent sessions, background dev servers, and proper state management.

---

## 📋 Phase 1: Terminal Session Management (Day 1-2)

### Task 1.1: Independent Terminal Sessions
**File**: `docker-backend/src/terminal.ts`

**Current Problem**: All terminals share same PTY session

**Implementation**:
```typescript
// Create terminal session manager
class TerminalSessionManager {
  private sessions = new Map<string, pty.IPty>();
  
  createSession(terminalId: string, projectId: string): pty.IPty {
    const session = pty.spawn('bash', [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: `/workspace/${projectId}`,
      env: {
        ...process.env,
        TERM_SESSION_ID: terminalId,
        PS1: '\\[\\033[32m\\]\\[\\033[1m\\]\\w$\\[\\033[0m\\]\\[\\033[0m\\] '
      }
    });
    
    this.sessions.set(terminalId, session);
    return session;
  }
  
  getSession(terminalId: string): pty.IPty | undefined {
    return this.sessions.get(terminalId);
  }
  
  destroySession(terminalId: string) {
    const session = this.sessions.get(terminalId);
    if (session) {
      session.kill();
      this.sessions.delete(terminalId);
    }
  }
}
```

**API Changes**:
```typescript
// POST /api/terminal/create
app.post('/api/terminal/create', (req, res) => {
  const { projectId } = req.body;
  const terminalId = generateId();
  const session = terminalManager.createSession(terminalId, projectId);
  
  res.json({ terminalId, ready: true });
});

// DELETE /api/terminal/:terminalId
app.delete('/api/terminal/:terminalId', (req, res) => {
  terminalManager.destroySession(req.params.terminalId);
  res.json({ success: true });
});
```

**Frontend Changes**:
```typescript
// recoder-web/app/components/workbench/Terminal.tsx
async function createNewTerminal() {
  const { terminalId } = await fetch('/api/terminal/create', {
    method: 'POST',
    body: JSON.stringify({ projectId })
  }).then(r => r.json());
  
  const terminal = new Terminal();
  const ws = new WebSocket(`ws://docker.recoder.xyz/terminal/${terminalId}`);
  
  terminals.set(terminalId, { terminal, ws });
  setActiveTerminal(terminalId);
}
```

**Testing**:
- [ ] Open 3 terminals - each should have independent bash session
- [ ] Run `pwd` in each - should show same directory
- [ ] Run `cd /tmp` in terminal 1 - should not affect terminal 2
- [ ] Close terminal 2 - should not affect terminal 1 or 3

---

### Task 1.2: Command Completion Markers
**File**: `docker-backend/src/terminal.ts`

**Implementation**:
```typescript
// Wrap all commands with completion marker
function wrapCommand(command: string): string {
  return `${command}; echo "###COMMAND_DONE###"`;
}

// Parse terminal output
session.onData((data) => {
  ws.send(data);
  
  if (data.includes('###COMMAND_DONE###')) {
    ws.send(JSON.stringify({
      type: 'command-complete',
      timestamp: Date.now()
    }));
  }
});
```

**Frontend**:
```typescript
// recoder-web/app/components/workbench/Terminal.tsx
ws.onmessage = (event) => {
  try {
    const msg = JSON.parse(event.data);
    if (msg.type === 'command-complete') {
      setCommandRunning(false);
      onCommandComplete?.();
    }
  } catch {
    terminal.write(event.data);
  }
};
```

**Testing**:
- [ ] Run `npm install` - loading spinner should show
- [ ] When complete, spinner should disappear
- [ ] Run `ls` - should complete instantly
- [ ] Run long command - should track completion

---

## 📋 Phase 2: Background Dev Server (Day 2-3)

### Task 2.1: Detached Dev Server Process
**File**: `docker-backend/src/dev-server.ts`

**Implementation**:
```typescript
class DevServerManager {
  private processes = new Map<string, ChildProcess>();
  
  async start(projectId: string, framework: string) {
    const cwd = `/workspace/${projectId}`;
    const command = this.getStartCommand(framework);
    
    // Start in background with nohup
    const process = spawn('bash', ['-c', 
      `nohup ${command} > /tmp/${projectId}-dev.log 2>&1 &`
    ], { 
      cwd,
      detached: true,
      stdio: 'ignore'
    });
    
    process.unref(); // Don't wait for it
    
    this.processes.set(projectId, process);
    
    // Wait for server to be ready
    await this.waitForReady(projectId);
    
    return {
      pid: process.pid,
      port: await this.detectPort(projectId)
    };
  }
  
  async getLogs(projectId: string, tail: number = 100) {
    const logFile = `/tmp/${projectId}-dev.log`;
    const logs = await exec(`tail -n ${tail} ${logFile}`);
    return logs;
  }
  
  async stop(projectId: string) {
    const process = this.processes.get(projectId);
    if (process?.pid) {
      await exec(`kill -9 ${process.pid}`);
      this.processes.delete(projectId);
    }
  }
  
  private getStartCommand(framework: string): string {
    const commands = {
      vite: 'npm run dev',
      next: 'npm run dev',
      react: 'npm start',
      vue: 'npm run serve'
    };
    return commands[framework] || 'npm run dev';
  }
  
  private async waitForReady(projectId: string, timeout = 60000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const logs = await this.getLogs(projectId, 10);
      if (logs.includes('ready') || logs.includes('Local:')) {
        return;
      }
      await sleep(1000);
    }
    throw new Error('Dev server failed to start');
  }
}
```

**API Endpoints**:
```typescript
// POST /api/dev-server/start
app.post('/api/dev-server/start', async (req, res) => {
  const { projectId, framework } = req.body;
  const result = await devServerManager.start(projectId, framework);
  res.json(result);
});

// GET /api/dev-server/logs/:projectId
app.get('/api/dev-server/logs/:projectId', async (req, res) => {
  const logs = await devServerManager.getLogs(req.params.projectId);
  res.json({ logs });
});

// POST /api/dev-server/stop
app.post('/api/dev-server/stop', async (req, res) => {
  await devServerManager.stop(req.body.projectId);
  res.json({ success: true });
});
```

**Testing**:
- [ ] Start dev server - should run in background
- [ ] Open terminal - should be clean, no dev server output
- [ ] Check logs endpoint - should show dev server output
- [ ] Kill dev server - terminal should remain functional

---

### Task 2.2: Logs Panel UI
**File**: `recoder-web/app/components/workbench/LogsPanel.tsx`

**Implementation**:
```typescript
export function LogsPanel({ projectId }: { projectId: string }) {
  const [logs, setLogs] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const logsRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const interval = setInterval(async () => {
      const response = await fetch(`/api/dev-server/logs/${projectId}`);
      const { logs } = await response.json();
      setLogs(logs);
      
      if (autoScroll && logsRef.current) {
        logsRef.current.scrollTop = logsRef.current.scrollHeight;
      }
    }, 2000);
    
    return () => clearInterval(interval);
  }, [projectId, autoScroll]);
  
  return (
    <div className="logs-panel">
      <div className="logs-header">
        <span>Dev Server Logs</span>
        <button onClick={() => setAutoScroll(!autoScroll)}>
          {autoScroll ? '📌 Auto-scroll' : '📌 Paused'}
        </button>
      </div>
      <pre ref={logsRef} className="logs-content">
        {logs}
      </pre>
    </div>
  );
}
```

**Testing**:
- [ ] Logs panel shows dev server output
- [ ] Auto-scrolls to bottom as new logs arrive
- [ ] Can pause auto-scroll to read errors
- [ ] Terminal remains clean

---

## 📋 Phase 3: WebSocket RPC Pattern (Day 3-4)

### Task 3.1: RPC Protocol Implementation
**File**: `docker-backend/src/websocket-rpc.ts`

**Implementation**:
```typescript
interface RPCRequest {
  id: number;
  method: string;
  params: any;
}

interface RPCResponse {
  id: number;
  result?: any;
  error?: string;
}

class WebSocketRPC {
  private handlers = new Map<string, Function>();
  private requestId = 0;
  
  constructor(private ws: WebSocket) {
    ws.on('message', (data) => this.handleMessage(data));
  }
  
  register(method: string, handler: Function) {
    this.handlers.set(method, handler);
  }
  
  async request(method: string, params: any): Promise<any> {
    const id = ++this.requestId;
    console.log(`WS [request] ${method}`, params, id);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`RPC timeout: ${method}`));
      }, 30000);
      
      const listener = (data: string) => {
        try {
          const response: RPCResponse = JSON.parse(data);
          if (response.id === id) {
            clearTimeout(timeout);
            this.ws.off('message', listener);
            
            if (response.error) {
              reject(new Error(response.error));
            } else {
              resolve(response.result);
            }
          }
        } catch {}
      };
      
      this.ws.on('message', listener);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  
  private async handleMessage(data: string) {
    try {
      const request: RPCRequest = JSON.parse(data);
      const handler = this.handlers.get(request.method);
      
      if (handler) {
        const result = await handler(request.params);
        this.ws.send(JSON.stringify({
          id: request.id,
          result
        }));
      }
    } catch (error) {
      console.error('RPC error:', error);
    }
  }
}
```

**Register Handlers**:
```typescript
// docker-backend/src/terminal.ts
const rpc = new WebSocketRPC(ws);

rpc.register('terminal.resize', async ({ cols, rows }) => {
  session.resize(cols, rows);
  return { success: true };
});

rpc.register('terminal.clear', async () => {
  session.write('\x1bc'); // Clear screen
  return { success: true };
});

rpc.register('terminal.kill', async () => {
  session.kill();
  return { success: true };
});

rpc.register('resetTimer', async () => {
  keepAlive();
  return { success: true };
});
```

**Frontend Usage**:
```typescript
// recoder-web/app/lib/terminal-rpc.ts
class TerminalRPC {
  private requestId = 0;
  private pending = new Map();
  
  constructor(private ws: WebSocket) {
    ws.onmessage = (event) => {
      const response = JSON.parse(event.data);
      const resolve = this.pending.get(response.id);
      if (resolve) {
        resolve(response.result);
        this.pending.delete(response.id);
      }
    };
  }
  
  async request(method: string, params: any) {
    const id = ++this.requestId;
    console.log(`WS [request] ${method}`, params, id);
    
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  
  async resize(cols: number, rows: number) {
    return this.request('terminal.resize', { cols, rows });
  }
  
  async clear() {
    return this.request('terminal.clear', {});
  }
  
  async kill() {
    return this.request('terminal.kill', {});
  }
}
```

**Testing**:
- [ ] Resize terminal - should work via RPC
- [ ] Clear terminal - should clear screen
- [ ] Kill process - should terminate cleanly
- [ ] All commands logged with IDs

---

## 📋 Phase 4: Terminal Persistence (Day 4-5)

### Task 4.1: Terminal State Sync
**File**: `recoder-web/app/lib/terminal-sync.ts`

**Implementation**:
```typescript
interface TerminalState {
  terminalId: string;
  output: string;
  cwd: string;
  history: string[];
  scrollPosition: number;
}

class TerminalSync {
  async save(terminalId: string, terminal: Terminal) {
    const state: TerminalState = {
      terminalId,
      output: terminal.buffer.active.getLine(0)?.translateToString() || '',
      cwd: await this.getCwd(terminalId),
      history: this.getHistory(terminalId),
      scrollPosition: terminal.buffer.active.viewportY
    };
    
    localStorage.setItem(`terminal-${terminalId}`, JSON.stringify(state));
  }
  
  async restore(terminalId: string, terminal: Terminal) {
    const data = localStorage.getItem(`terminal-${terminalId}`);
    if (!data) return;
    
    const state: TerminalState = JSON.parse(data);
    
    // Restore output
    terminal.write(state.output);
    
    // Restore working directory
    await rpc.request('terminal.exec', { 
      command: `cd ${state.cwd}` 
    });
    
    // Restore scroll position
    terminal.scrollToLine(state.scrollPosition);
  }
  
  private async getCwd(terminalId: string): Promise<string> {
    const result = await rpc.request('terminal.exec', { 
      command: 'pwd' 
    });
    return result.output.trim();
  }
}
```

**Auto-save on Changes**:
```typescript
// Save every 5 seconds
useEffect(() => {
  const interval = setInterval(() => {
    terminals.forEach((term, id) => {
      terminalSync.save(id, term.terminal);
    });
  }, 5000);
  
  return () => clearInterval(interval);
}, [terminals]);

// Restore on mount
useEffect(() => {
  const terminalId = getTerminalIdFromUrl();
  if (terminalId) {
    terminalSync.restore(terminalId, terminal);
  }
}, []);
```

**Testing**:
- [ ] Run commands in terminal
- [ ] Refresh page - terminal state should restore
- [ ] Working directory should be preserved
- [ ] Scroll position should be preserved

---

## 📋 Phase 5: Container Lifecycle (Day 5)

### Task 5.1: Keep-Alive System
**File**: `docker-backend/src/container-lifecycle.ts`

**Implementation**:
```typescript
class ContainerLifecycle {
  private timers = new Map<string, NodeJS.Timeout>();
  private readonly IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  
  keepAlive(projectId: string) {
    console.log(`[${projectId}] Reset idle timer`);
    
    // Clear existing timer
    const existing = this.timers.get(projectId);
    if (existing) {
      clearTimeout(existing);
    }
    
    // Set new timer
    const timer = setTimeout(() => {
      console.log(`[${projectId}] Container idle - cleaning up`);
      this.cleanup(projectId);
    }, this.IDLE_TIMEOUT);
    
    this.timers.set(projectId, timer);
  }
  
  private async cleanup(projectId: string) {
    // Stop dev server
    await devServerManager.stop(projectId);
    
    // Close all terminals
    terminalManager.destroyAllSessions(projectId);
    
    // Stop container
    await docker.stopContainer(projectId);
    
    this.timers.delete(projectId);
  }
}
```

**Hook into Activity**:
```typescript
// Call on every user action
terminal.onData(() => lifecycle.keepAlive(projectId));
fileWatcher.onChange(() => lifecycle.keepAlive(projectId));
ws.on('message', () => lifecycle.keepAlive(projectId));
```

**Testing**:
- [ ] Container stays alive during activity
- [ ] Container stops after 30 min idle
- [ ] Timer resets on terminal input
- [ ] Timer resets on file changes

---

## 📋 Phase 6: UI Improvements (Day 6)

### Task 6.1: Terminal Controls
**File**: `recoder-web/app/components/workbench/TerminalControls.tsx`

**Implementation**:
```typescript
export function TerminalControls({ terminalId, rpc }: Props) {
  return (
    <div className="terminal-controls">
      <button onClick={() => rpc.clear()}>
        🗑️ Clear
      </button>
      <button onClick={() => rpc.kill()}>
        ⛔ Kill Process
      </button>
      <button onClick={() => createNewTerminal()}>
        ➕ New Terminal
      </button>
      <button onClick={() => closeTerminal(terminalId)}>
        ❌ Close
      </button>
    </div>
  );
}
```

**Testing**:
- [ ] Clear button clears terminal
- [ ] Kill button stops running process
- [ ] New terminal opens fresh session
- [ ] Close button removes terminal tab

---

## ✅ Testing Checklist

### Terminal Sessions
- [ ] Can open 3+ independent terminals
- [ ] Each terminal has separate bash session
- [ ] Closing one terminal doesn't affect others
- [ ] Terminal state persists across page reloads

### Dev Server
- [ ] Dev server runs in background
- [ ] Terminal is clean (no dev server output)
- [ ] Logs panel shows dev server output
- [ ] Can stop/restart dev server

### WebSocket RPC
- [ ] All commands use RPC pattern
- [ ] Request/response IDs logged
- [ ] Timeout handling works
- [ ] Error messages clear

### Container Lifecycle
- [ ] Container stays alive during activity
- [ ] Container stops after idle timeout
- [ ] Timer resets on user actions
- [ ] Cleanup is graceful

### UI/UX
- [ ] Clear button works
- [ ] Kill process button works
- [ ] New terminal button works
- [ ] Close terminal button works
- [ ] Loading states accurate

---

## 📊 Success Metrics

- **Terminal Reliability**: 0 disconnects during normal use
- **Session Independence**: 100% isolated sessions
- **State Persistence**: 100% restore rate on reload
- **Dev Server Separation**: 0 dev logs in terminal
- **Container Efficiency**: Auto-cleanup after 30min idle

---

## 🚀 Deployment Plan

1. **Day 1-2**: Implement Phase 1 & 2 (sessions + dev server)
2. **Day 3-4**: Implement Phase 3 & 4 (RPC + persistence)
3. **Day 5**: Implement Phase 5 (lifecycle)
4. **Day 6**: Implement Phase 6 (UI) + testing
5. **Day 7**: Deploy to staging, monitor logs
6. **Day 8**: Deploy to production

---

## 📝 Files to Modify

### Backend
- `docker-backend/src/terminal.ts` - Session management
- `docker-backend/src/dev-server.ts` - Background processes
- `docker-backend/src/websocket-rpc.ts` - RPC protocol
- `docker-backend/src/container-lifecycle.ts` - Keep-alive system

### Frontend
- `recoder-web/app/components/workbench/Terminal.tsx` - Terminal UI
- `recoder-web/app/components/workbench/LogsPanel.tsx` - Logs UI
- `recoder-web/app/components/workbench/TerminalControls.tsx` - Controls
- `recoder-web/app/lib/terminal-rpc.ts` - RPC client
- `recoder-web/app/lib/terminal-sync.ts` - State persistence

### Total: ~10 files, ~1500 lines of code
