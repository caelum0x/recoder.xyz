import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { createTerminalApprovalPrompt } from '../../src/commands/terminal-approval-prompt';

function fakeInput(answer: string): Readable {
  return Readable.from([`${answer}\n`]);
}

function captureOutput(): { stream: Writable; text: () => string } {
  let buf = '';
  const stream = new Writable({
    write(chunk, _enc, cb) {
      buf += chunk.toString();
      cb();
    },
  });
  return { stream, text: () => buf };
}

describe('createTerminalApprovalPrompt', () => {
  it('renders the command, tier, and reason, and resolves "approved" on y', async () => {
    const out = captureOutput();
    const prompt = createTerminalApprovalPrompt({ input: fakeInput('y'), output: out.stream });

    const decision = await prompt({
      command: 'rm -rf /tmp/x',
      tier: 'high',
      reason: 'destructive rm',
      requestId: 'req-1',
    });

    assert.equal(decision, 'approved');
    assert.match(out.text(), /rm -rf \/tmp\/x/);
    assert.match(out.text(), /tier: high/);
    assert.match(out.text(), /destructive rm/);
    assert.match(out.text(), /Approved\./);
  });

  it('resolves "rejected" on any non-y answer, including empty input (default-deny)', async () => {
    const out = captureOutput();
    const prompt = createTerminalApprovalPrompt({ input: fakeInput(''), output: out.stream });

    const decision = await prompt({
      command: 'git push --force',
      tier: 'high',
      reason: 'force push',
      requestId: 'req-2',
    });

    assert.equal(decision, 'rejected');
    assert.match(out.text(), /Rejected\./);
  });
});
