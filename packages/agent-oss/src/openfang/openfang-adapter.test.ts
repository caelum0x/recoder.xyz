import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { test } from 'node:test';

import type { RunEvent } from '@recoder/agent-os';
import type { OssAdapterRunInput } from '../adapter-boundary';
import {
  OpenFangAdapter,
  mapOpenFangTask,
  openFangAdapterProfile,
} from './openfang-adapter';
import type { OpenFangBinaryResolution } from './resolve-binary';

function makeInput(intent: OssAdapterRunInput['task']['intent'] = 'research'): OssAdapterRunInput {
  return {
    task: {
      taskId: 'task-1',
      title: 'Investigate flaky test',
      intent,
      goal: 'Find and document the root cause.',
      spaceId: 'space-1',
      targetPaths: [],
      forbiddenPaths: [],
      acceptanceCriteria: ['root cause documented'],
      verification: { commands: ['pnpm test'] },
      approvalRequired: [],
      artifactRequired: [],
    },
    policy: {} as OssAdapterRunInput['policy'],
  };
}

function fakeChild() {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const child = new EventEmitter() as EventEmitter & {
    stdout: Readable;
    stderr: Readable;
    exitCode: number | null;
    kill: (signal: string) => boolean;
  };
  child.stdout = stdout;
  child.stderr = stderr;
  child.exitCode = null;
  child.kill = () => true;
  return child;
}

async function collect(iter: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const out: RunEvent[] = [];
  for await (const ev of iter) {
    out.push(ev);
  }
  return out;
}

test('profile is non-owning agent_framework engine for openfang', () => {
  assert.equal(openFangAdapterProfile.provider, 'openfang');
  assert.equal(openFangAdapterProfile.kind, 'agent_framework');
  assert.equal(openFangAdapterProfile.ownsCanonicalState, false);
  assert.equal(openFangAdapterProfile.emitsRunEvents, true);
});

test('mapTask honors the adapter boundary and rejects unsupported intents', () => {
  const mapping = mapOpenFangTask(makeInput('research'));
  assert.equal(mapping.adapterId, 'openfang');
  assert.equal(mapping.taskId, 'task-1');
  assert.equal(mapping.recoderStateRefs.taskSpecId, 'task-1');

  assert.throws(() => mapOpenFangTask(makeInput('bugfix')), /does not support/);
});

test('run() degrades safely when the openfang binary is absent', async () => {
  const resolve = (): OpenFangBinaryResolution => ({
    available: false,
    reason: 'not installed',
    searched: ['/usr/bin/openfang'],
  });
  const adapter = new OpenFangAdapter({
    resolve,
    spawnImpl: () => {
      throw new Error('spawn must not be called when binary is unavailable');
    },
  });

  const events = await collect(adapter.run(makeInput()));
  assert.equal(events.length, 1);
  assert.equal(events[0]?.type, 'failed');
  assert.equal(events[0]?.state, 'failed');
  assert.equal(events[0]?.data?.['degraded'], true);
});

test('run() spawns openfang and surfaces stdout as events on success', async () => {
  const child = fakeChild();
  const adapter = new OpenFangAdapter({
    resolve: () => ({ available: true, binaryPath: '/opt/openfang', source: 'env' }),
    spawnImpl: (command, args) => {
      assert.equal(command, '/opt/openfang');
      assert.deepEqual([...args].slice(0, 1), ['message']);
      assert.ok(args.includes('--json'));
      setTimeout(() => {
        child.stdout.push('hello from agent\n');
        setTimeout(() => {
          child.stdout.push(null);
          child.stderr.push(null);
          child.exitCode = 0;
          child.emit('close', 0);
        }, 5);
      }, 5);
      return child as never;
    },
  });

  const events = await collect(adapter.run(makeInput()));
  const types = events.map((e) => e.type);
  assert.deepEqual(types, ['started', 'log', 'completed']);
  assert.equal(events[1]?.message, 'hello from agent');
  assert.equal(events[2]?.state, 'completed');
});

test('run() emits failed on non-zero exit', async () => {
  const child = fakeChild();
  const adapter = new OpenFangAdapter({
    resolve: () => ({ available: true, binaryPath: '/opt/openfang', source: 'path' }),
    spawnImpl: () => {
      setTimeout(() => {
        child.stderr.push('boom\n');
        setTimeout(() => {
          child.stdout.push(null);
          child.stderr.push(null);
          child.exitCode = 2;
          child.emit('close', 2);
        }, 5);
      }, 5);
      return child as never;
    },
  });

  const events = await collect(adapter.run(makeInput()));
  const last = events[events.length - 1];
  assert.equal(last?.type, 'failed');
  assert.equal(last?.data?.['exitCode'], 2);
});
