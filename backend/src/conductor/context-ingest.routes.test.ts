import type { Router } from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createBrain,
  createDocumentPreprocessor,
  type BrainMemory,
  type MemoryPort,
} from '@recoder/brain';

import { createConductorRouter } from './conductor.routes';
import { BrainService } from '../agent-os/brain-service';
import { agentOsContainer } from '../agent-os/service-container';

// Drives the REAL conductor Express router (the product surface) against the
// shared service container, proving POST /context/ingest invokes the flag-gated
// Brain.ingestDocument() in-process on a sample doc: it preprocesses the bytes
// through the owned @recoder/document-preprocessor and remembers the clean text
// via the brain's memory port. Same router-stack harness as the agent-os route
// tests — not a stub.

interface MockReq {
  method: string;
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
}

function makeReq(body: Record<string, unknown>): MockReq {
  return { method: 'POST', body, params: {}, query: {}, headers: {} };
}

function makeRes(): { res: any; state: { statusCode: number; jsonData: any } } {
  const state = { statusCode: 200, jsonData: null as any };
  const res: any = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(data: any) {
      state.jsonData = data;
      return res;
    },
  };
  return { res, state };
}

function getRouteStack(router: Router, path: string, method: 'post' | 'get') {
  const routeLayer = router.stack.find(
    (layer: any) => layer.route?.path === path && layer.route?.methods?.[method],
  );
  if (!routeLayer) throw new Error(`No route for ${method.toUpperCase()} ${path}`);
  return (routeLayer as any).route.stack.map((layer: any) => layer.handle);
}

async function runStack(router: Router, path: string, method: 'post' | 'get', req: MockReq, res: any): Promise<void> {
  const handlers = getRouteStack(router, path, method);
  for (const handler of handlers) {
    const result = await new Promise<{ nextCalled: boolean }>((resolve, reject) => {
      let nextCalled = false;
      const next = (err?: unknown) => {
        if (err) return reject(err);
        nextCalled = true;
        resolve({ nextCalled: true });
      };
      try {
        Promise.resolve(handler(req, res, next))
          .then(() => {
            if (!nextCalled) resolve({ nextCalled: false });
          })
          .catch(reject);
      } catch (err) {
        reject(err);
      }
    });
    if (!result.nextCalled) break;
  }
}

/** A capturing memory port so we can assert the preprocessed text was remembered. */
function capturingMemory(sink: { text: string | null; metadata: unknown }): MemoryPort {
  return {
    recall: async (): Promise<BrainMemory[]> => [],
    remember: async (text: string, metadata?: Record<string, unknown>) => {
      sink.text = text;
      sink.metadata = metadata ?? null;
    },
  };
}

describe('POST /api/conductor/context/ingest (RAG/context ingest product path)', () => {
  const originalBrain = agentOsContainer.brain;

  afterEach(() => {
    agentOsContainer.brain = originalBrain;
  });

  it('flag ON -> preprocesses the sample doc and remembers the clean text (in-process)', async () => {
    // A REAL Brain: real document-preprocessor + a capturing memory port. No stub
    // of ingestDocument — the route exercises the genuine fusion seam.
    const sink = { text: null as string | null, metadata: null as unknown };
    const brain = createBrain({
      preprocessor: createDocumentPreprocessor(),
      memory: capturingMemory(sink),
    });
    agentOsContainer.brain = new BrainService({ isEnabled: () => true, brainFactory: () => brain });

    const router = createConductorRouter();
    const { res, state } = makeRes();
    const content = '# Onboarding\n\nThe team standardizes on pnpm --filter for workspace installs.';
    await runStack(router, '/context/ingest', 'post', makeReq({ title: 'ONBOARDING.md', content, format: 'markdown' }), res);

    expect(state.statusCode).toBe(200);
    expect(state.jsonData?.success).toBe(true);
    const data = state.jsonData?.data;
    expect(data?.enabled).toBe(true);
    expect(data?.title).toBe('ONBOARDING.md');
    expect(data?.remembered).toBe(true);
    expect(typeof data?.text).toBe('string');
    expect(data?.text).toContain('pnpm --filter');
    expect(data?.pageCount).toBeGreaterThanOrEqual(1);

    // The brain genuinely remembered the preprocessed text via the memory port.
    expect(sink.text).toContain('pnpm --filter');
    expect((sink.metadata as any)?.kind).toBe('document');
    expect((sink.metadata as any)?.title).toBe('ONBOARDING.md');
  });

  it('flag OFF -> degrades truthfully (enabled:false, not remembered) — never blocks the request', async () => {
    agentOsContainer.brain = new BrainService({ isEnabled: () => false });

    const router = createConductorRouter();
    const { res, state } = makeRes();
    await runStack(router, '/context/ingest', 'post', makeReq({ title: 'doc.txt', content: 'hello world' }), res);

    expect(state.statusCode).toBe(200);
    expect(state.jsonData?.success).toBe(true);
    expect(state.jsonData?.data).toMatchObject({ enabled: false, remembered: false, text: '' });
  });

  it('rejects a request with no title (400) without touching the brain', async () => {
    agentOsContainer.brain = new BrainService({ isEnabled: () => false });

    const router = createConductorRouter();
    const { res, state } = makeRes();
    await runStack(router, '/context/ingest', 'post', makeReq({ content: 'no title here' }), res);

    expect(state.statusCode).toBe(400);
    expect(state.jsonData?.success).toBe(false);
  });
});
