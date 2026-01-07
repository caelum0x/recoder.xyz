// PTY Server - runs inside Docker container
// Provides real terminal via WebSocket

const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');

const PORT = process.env.PTY_PORT || 9999;

const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  // Respawn safety settings
  const MAX_RESPAWNS = 3;       // max respawns allowed
  const RESPAWN_WINDOW_MS = 30000; // time window to count respawns
  const RESPAWN_BACKOFF_MS = 2000; // backoff before respawn

  let respawnTimestamps = [];
  let currentShell = null;

  function spawnShell() {
    const shell = pty.spawn('/bin/bash', [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: '/workspace',
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    shell.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    shell.onExit(({ exitCode }) => {
      // record respawn time
      const now = Date.now();
      respawnTimestamps.push(now);
      // purge old timestamps outside window
      respawnTimestamps = respawnTimestamps.filter(t => now - t <= RESPAWN_WINDOW_MS);

      if (respawnTimestamps.length > MAX_RESPAWNS) {
        // Too many respawns in window — give up and close ws with message
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(`\nPTY server: too many respawns (>${MAX_RESPAWNS}) — closing connection.\n`);
          }
        } catch {}
        try { ws.close(1011, 'PTY respawn limit exceeded'); } catch {}
        try { shell.kill(); } catch {}
        return;
      }

      // If ws still open, respawn after backoff
      if (ws.readyState === WebSocket.OPEN) {
        console.log(`Shell exited with code ${exitCode}, respawning in ${RESPAWN_BACKOFF_MS}ms`);
        setTimeout(() => {
          // clean up listeners on old shell
          try { shell.kill(); } catch {}
          currentShell = spawnShell();
        }, RESPAWN_BACKOFF_MS);
      } else {
        try { ws.close(); } catch {}
      }
    });

    return shell;
  }

  // Create initial shell
  currentShell = spawnShell();

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'resize' && data.cols && data.rows) {
        try { currentShell.resize(data.cols, data.rows); } catch {}
        return;
      }
    } catch {}
    try { currentShell.write(msg.toString()); } catch {}
  });

  ws.on('close', () => {
    try { if (currentShell) currentShell.kill(); } catch {}
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PTY server on port ${PORT}`);
});
