import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const serverSource = readFileSync(resolve(__dirname, '../../server.ts'), 'utf8');

describe('A2A authenticated mounts', () => {
  it('allows product services to use the shared authenticateRequest middleware through INTERNAL_SERVICE_KEY', () => {
    expect(serverSource).toContain('resolveInternalServiceSession(req, INTERNAL_SERVICE_KEY)');
  });

  it('protects legacy task/orchestration mutations while leaving read/discovery routes compatible', () => {
    expect(serverSource).toContain('function authenticateMutatingRequest(');
    expect(serverSource).toContain("app.use('/api/a2a', authenticateMutatingRequest, a2aRouter);");
    expect(serverSource).toContain("app.use('/api/a2a/tasks', authenticateMutatingRequest, taskLifecycleRouter);");
    expect(serverSource).toContain("if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS')");
  });

  it.each([
    ['/api/a2a/code-search', 'codeSearchRouter'],
    ['/api/a2a/search', 'searchRouter'],
    ['/api/a2a/scratchpad', 'scratchpadRouter'],
    ['/api/a2a/workflows', 'workflowTriggerRouter'],
    ['/api/a2a/data', 'duckdbRouter'],
    ['/api/a2a/patterns', 'patternRouter'],
    ['/api/a2a/orchestration', 'orchestrationRouter'],
    ['/api/a2a/workflows', 'crossAppWorkflowRouter'],
    ['/api/a2a/admin', 'adminRouter'],
    ['/api/a2a/activity', 'activityFeedRouter'],
    ['/api/a2a/dashboard', 'dashboardRouter'],
  ])('requires authenticateRequest before %s reaches %s', (mount, router) => {
    expect(serverSource).toContain(`app.use('${mount}', authenticateRequest, ${router});`);
  });

  it('protects connector health routes without making every later /api/a2a route private', () => {
    expect(serverSource).toContain("app.use('/api/a2a/connectors', authenticateRequest);");
    expect(serverSource).toContain("app.use('/api/a2a', connectorHealthRouter);");
    expect(serverSource).not.toContain("app.use('/api/a2a', authenticateRequest, connectorHealthRouter);");
  });

  it('protects workflow messaging subpaths without making every later /api/a2a route private', () => {
    expect(serverSource).toContain(
      "app.use(['/api/a2a/messages', '/api/a2a/delegations', '/api/a2a/handoffs'], authenticateRequest);",
    );
    expect(serverSource).toContain("app.use('/api/a2a', workflowMessagingRouter);");
    expect(serverSource).not.toContain("app.use('/api/a2a', authenticateRequest, workflowMessagingRouter);");
  });
});
