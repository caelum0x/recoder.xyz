// PTY Server - runs inside Docker container
// Provides real terminal via WebSocket

const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');

const PORT = process.env.PTY_PORT || 9999;

const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
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

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'resize' && data.cols && data.rows) {
        shell.resize(data.cols, data.rows);
        return;
      }
    } catch {}
    shell.write(msg.toString());
  });

  ws.on('close', () => shell.kill());
  shell.onExit(() => ws.close());
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`PTY server on port ${PORT}`);
});
