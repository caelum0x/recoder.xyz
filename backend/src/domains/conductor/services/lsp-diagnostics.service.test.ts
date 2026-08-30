import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Workspace } from '@recoder/agent-os';
import { LspDiagnosticsService } from './lsp-diagnostics.service.js';

const logger = { debug() {}, info() {}, warn() {}, error() {} } as never;

describe('LspDiagnosticsService', () => {
  it('reports diagnostics introduced between the base buffer and head buffer', async () => {
    const root = mkdtempSync(join(tmpdir(), 'recoder-lsp-'));
    try {
      execFileSync('git', ['init', '-b', 'main'], { cwd: root });
      execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: root });
      writeFileSync(join(root, 'index.ts'), 'const good = 1;\n');
      execFileSync('git', ['add', 'index.ts'], { cwd: root });
      execFileSync('git', ['commit', '-m', 'base'], { cwd: root });
      writeFileSync(join(root, 'index.ts'), 'const BAD = 1;\n');

      const serverPath = join(root, 'fake-lsp.cjs');
      writeFileSync(serverPath, `
let buffer = Buffer.alloc(0); let text = '';
function send(value) { const body = JSON.stringify({ jsonrpc: '2.0', ...value }); process.stdout.write('Content-Length: ' + Buffer.byteLength(body) + '\\r\\n\\r\\n' + body); }
function drain() { while (true) { const end = buffer.indexOf('\\r\\n\\r\\n'); if (end < 0) return; const h = buffer.subarray(0,end).toString(); const m = h.match(/content-length:\\s*(\\d+)/i); if (!m) return; const n=Number(m[1]); if(buffer.length<end+4+n)return; const msg=JSON.parse(buffer.subarray(end+4,end+4+n)); buffer=buffer.subarray(end+4+n); if(msg.method==='initialize')send({id:msg.id,result:{capabilities:{diagnosticProvider:{}}}}); else if(msg.method==='textDocument/didOpen')text=msg.params.textDocument.text; else if(msg.method==='textDocument/diagnostic')send({id:msg.id,result:{items:text.includes('BAD')?[{range:{start:{line:0,character:6},end:{line:0,character:9}},severity:1,code:'bad-name',source:'fixture',message:'BAD is not allowed'}]:[]}}); else if(msg.method==='shutdown')send({id:msg.id,result:null}); }}
process.stdin.on('data', chunk => { buffer=Buffer.concat([buffer,chunk]); drain(); });
`);
      mkdirSync(join(root, '.recoder'));
      writeFileSync(join(root, '.recoder', 'lsp.json'), JSON.stringify({
        version: 1,
        servers: [{ id: 'fixture', command: process.execPath, args: [serverPath], extensions: ['.ts'] }],
      }));
      const workspace = {
        workspaceId: 'ws-lsp', spaceId: 'space', projectId: 'project', taskId: 'task',
        runtimeId: 'codex', substrate: 'tmux_worktree', branch: 'feature', baseRef: 'HEAD',
        worktreePath: root, state: 'awaiting_review', createdBy: 'user',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      } satisfies Workspace;
      const result = await new LspDiagnosticsService(logger).compare(workspace);
      expect(result).toMatchObject({ available: true, baseCount: 0, headCount: 1, unchanged: 0 });
      expect(result.introduced[0]).toMatchObject({ path: 'index.ts', code: 'bad-name', message: 'BAD is not allowed' });
      expect(result.resolved).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
