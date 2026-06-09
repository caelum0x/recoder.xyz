'use client';

import { useMutation } from '@tanstack/react-query';
import { getSessionAccessToken } from '@/lib/auth/session-token';

export type StepType = 'llm' | 'http' | 'code' | 'branch' | 'trigger' | 'squad' | 'parallel' | 'conditional';

export interface WorkflowStepInput {
  type: StepType;
  name: string;
  config: Record<string, unknown>;
}

export interface StepResult {
  step: string;
  type: string;
  output: unknown;
  durationMs: number;
}

export interface RunStepsResult {
  success: boolean;
  results: StepResult[];
  context: Record<string, unknown>;
}

async function dx<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getSessionAccessToken().catch(() => null);
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (init?.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`/dx${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const json = await res.json();
  return (json?.data ?? json) as T;
}

export function useRunSteps() {
  return useMutation({
    mutationFn: (steps: WorkflowStepInput[]) =>
      dx<RunStepsResult>('/workflows/run-steps', { method: 'POST', body: JSON.stringify({ steps }) }),
  });
}

/** Sensible default config skeleton per step type, for the composer UI. */
export function defaultConfigFor(type: StepType): string {
  switch (type) {
    case 'llm':
      return JSON.stringify({ prompt: 'Summarize: {{_lastOutput}}', model: 'anthropic/claude-3-5-sonnet' }, null, 2);
    case 'http':
      return JSON.stringify({ method: 'GET', url: 'https://api.example.com/data' }, null, 2);
    case 'code':
      return JSON.stringify({ language: 'python', code: "print('hello')" }, null, 2);
    case 'branch':
      return JSON.stringify({ condition: '{{_lastOutput}}.length > 0', then: 'continue' }, null, 2);
    case 'trigger':
      return JSON.stringify({ workflowId: '' }, null, 2);
    case 'squad':
      return JSON.stringify({ squadId: '', task: '{{_lastOutput}}', strategy: 'all' }, null, 2);
    case 'parallel':
      return JSON.stringify({ steps: [{ type: 'llm', name: 'a', config: { prompt: 'Task A' } }, { type: 'llm', name: 'b', config: { prompt: 'Task B' } }] }, null, 2);
    case 'conditional':
      return JSON.stringify({ condition: "context.score > 0.5", then: [{ type: 'llm', name: 'pass', config: { prompt: 'Looks good' } }], else: [{ type: 'llm', name: 'fail', config: { prompt: 'Needs work' } }] }, null, 2);
    default:
      return '{}';
  }
}
