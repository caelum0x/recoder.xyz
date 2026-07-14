import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existsSync: vi.fn(() => true),
  createReadStream: vi.fn(() => ({
    pipe: (res: any) => {
      res.write('openapi: 3.1.0\ninfo:\n  title: A2A API\n');
      res.end();
      return res;
    },
  })),
}));

vi.mock('node:fs', () => ({
  existsSync: (...args: any[]) => mocks.existsSync(...args),
  createReadStream: (...args: any[]) => mocks.createReadStream(...args),
}));

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }),
}));

import { a2aOpenApiRouter } from '../openapi.routes';

function makeRes() {
  const state = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '' as string,
    jsonData: null as any,
    ended: false,
  };

  const res: any = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    setHeader(key: string, value: string) {
      state.headers[key.toLowerCase()] = value;
    },
    write(chunk: string) {
      state.body += chunk;
      return true;
    },
    send(content: string) {
      state.body += content;
      state.ended = true;
      return res;
    },
    json(data: any) {
      state.jsonData = data;
      state.ended = true;
      return res;
    },
    end() {
      state.ended = true;
      return res;
    },
  };

  return { res, state };
}

async function run(path: string, method: 'get', req: any, res: any) {
  const routeLayer = a2aOpenApiRouter.stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!routeLayer) throw new Error(`missing route ${method.toUpperCase()} ${path}`);
  const handler = routeLayer.route.stack[0].handle;
  await handler(req, res);
}

describe('a2aOpenApiRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serves docs html at GET /docs', async () => {
    const { res, state } = makeRes();
    await run('/docs', 'get', {}, res);

    expect(state.statusCode).toBe(200);
    expect(state.headers['content-type']).toContain('text/html');
    expect(state.body).toContain('SwaggerUIBundle');
    expect(state.body).toContain('/api/a2a/openapi.yaml');
  });

  it('streams yaml at GET /openapi.yaml', async () => {
    const { res, state } = makeRes();
    await run('/openapi.yaml', 'get', {}, res);

    expect(mocks.existsSync).toHaveBeenCalledTimes(1);
    expect(mocks.createReadStream).toHaveBeenCalledTimes(1);
    expect(state.statusCode).toBe(200);
    expect(state.headers['content-type']).toContain('application/yaml');
    expect(state.body).toContain('openapi: 3.1.0');
  });

  it('returns 404 when yaml file is missing', async () => {
    mocks.existsSync.mockReturnValueOnce(false);
    const { res, state } = makeRes();
    await run('/openapi.yaml', 'get', {}, res);

    expect(state.statusCode).toBe(404);
    expect(state.jsonData.success).toBe(false);
    expect(state.jsonData.error.message).toMatch(/not found/i);
  });
});

