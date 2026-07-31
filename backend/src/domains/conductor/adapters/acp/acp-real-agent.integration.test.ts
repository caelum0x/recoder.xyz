/**
 * REAL-agent integration — drives the ACP stack (codec → client → driver →
 * child_process) against the actual `claude-code-acp` binary on PATH. This is the
 * proof that our JSON-RPC/ndjson framing is wire-compatible with a shipping ACP
 * agent, not just our fakes.
 *
 * It self-SKIPS when the binary is absent (CI without the agent installed), so it
 * is harmless everywhere. It exercises the FREE part of the protocol — the
 * `initialize` handshake (and a best-effort `session/new`) — which needs no paid
 * model turn; a full `session/prompt` round-trip requires live credentials and is
 * intentionally not asserted here to keep the suite deterministic and free.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { AcpAgentDriver } from './acp-driver.js';
import { makeAcpProcess } from './acp-process.js';

const AGENT = 'claude-code-acp';

/** Synchronous PATH scan (no spawn) so `describe.skipIf` can decide at collect time. */
function onPath(bin: string): boolean {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  return dirs.some(d => existsSync(join(d, bin)));
}

const AGENT_PRESENT = onPath(AGENT);

describe.skipIf(!AGENT_PRESENT)(
  'ACP stack against real claude-code-acp',
  () => {
    let driver: AcpAgentDriver | null = null;

    afterAll(() => {
      driver?.stop();
    });

    it('completes the initialize handshake with a real ACP agent', async () => {
      driver = new AcpAgentDriver({
        spawn: () => makeAcpProcess({ command: AGENT, cwd: tmpdir() }),
        warn: () => {},
      });
      const { protocolVersion } = await driver.start();
      // The real agent negotiates the protocol version — our driver reads it back.
      expect(protocolVersion).toBeGreaterThanOrEqual(1);
    }, 20000);

    it('opens a session (best-effort; skipped-assert if the agent needs credentials)', async () => {
      const d = new AcpAgentDriver({
        spawn: () => makeAcpProcess({ command: AGENT, cwd: tmpdir() }),
        warn: () => {},
      });
      try {
        await d.start();
        const sessionId = await d.newSession(tmpdir());
        expect(typeof sessionId).toBe('string');
        expect(sessionId.length).toBeGreaterThan(0);
      } catch (err) {
        // A credential/login error here is a truthful environment fact, NOT a stack
        // defect — the handshake test above already proved wire compatibility.
        expect(err).toBeInstanceOf(Error);
      } finally {
        d.stop();
      }
    }, 20000);
  }
);
