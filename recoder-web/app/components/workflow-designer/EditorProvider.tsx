'use client';

import { type ReactNode, useMemo } from 'react';
import { createEditorStore, EditorStoreContext } from './store';
import type { Workflow, WorkflowId, NodeId, createNodeId, createInputId, createOutputId, createConnectionId, createWorkflowId } from './types';

export interface EditorProviderProps {
  children: ReactNode;
  workflow: Workflow;
}

export function EditorStoreProvider({ children, workflow }: EditorProviderProps) {
  // Create store only once when workflow changes (or on mount)
  const store = useMemo(() => createEditorStore({ workflow }), [workflow]);

  return (
    <EditorStoreContext.Provider value={store}>
      {children}
    </EditorStoreContext.Provider>
  );
}

// Create a default empty workflow
export function createEmptyWorkflow(id?: string): Workflow {
  const workflowId = `wf_${id || Date.now().toString(36)}` as WorkflowId;
  return {
    id: workflowId,
    name: 'New Workflow',
    nodes: [],
    connections: [],
    ui: {
      nodeState: {},
      inspectedNodeId: undefined,
    },
  };
}

// Create a sample workflow for testing
export function createSampleWorkflow(): Workflow {
  const workflowId = 'wf_sample' as WorkflowId;
  const triggerNodeId = 'nd_trigger1' as NodeId;
  const promptNodeId = 'nd_prompt1' as NodeId;
  const genNodeId = 'nd_gen1' as NodeId;
  const outputNodeId = 'nd_output1' as NodeId;

  return {
    id: workflowId,
    name: 'Sample Workflow',
    nodes: [
      {
        id: triggerNodeId,
        name: 'Start',
        type: 'operation',
        content: { type: 'trigger' },
        inputs: [],
        outputs: [{ id: 'otp_trigger1' as any, label: 'Output' }],
      },
      {
        id: promptNodeId,
        name: 'User Prompt',
        type: 'variable',
        content: { type: 'prompt', prompt: 'Write a poem about...' },
        inputs: [{ id: 'inp_prompt1' as any, label: 'Input' }],
        outputs: [{ id: 'otp_prompt1' as any, label: 'Text' }],
      },
      {
        id: genNodeId,
        name: 'Generate',
        type: 'operation',
        content: {
          type: 'textGeneration',
          provider: 'openai',
          model: 'gpt-4',
          prompt: '{{input}}',
        },
        inputs: [{ id: 'inp_gen1' as any, label: 'Prompt', isRequired: true }],
        outputs: [{ id: 'otp_gen1' as any, label: 'Response' }],
      },
      {
        id: outputNodeId,
        name: 'Result',
        type: 'operation',
        content: { type: 'output' },
        inputs: [{ id: 'inp_output1' as any, label: 'Input' }],
        outputs: [],
      },
    ],
    connections: [
      {
        id: 'con_1' as any,
        outputNode: { id: triggerNodeId },
        outputId: 'otp_trigger1' as any,
        inputNode: { id: promptNodeId },
        inputId: 'inp_prompt1' as any,
      },
      {
        id: 'con_2' as any,
        outputNode: { id: promptNodeId },
        outputId: 'otp_prompt1' as any,
        inputNode: { id: genNodeId },
        inputId: 'inp_gen1' as any,
      },
      {
        id: 'con_3' as any,
        outputNode: { id: genNodeId },
        outputId: 'otp_gen1' as any,
        inputNode: { id: outputNodeId },
        inputId: 'inp_output1' as any,
      },
    ],
    ui: {
      nodeState: {
        [triggerNodeId]: { position: { x: 100, y: 200 }, selected: false },
        [promptNodeId]: { position: { x: 350, y: 200 }, selected: false },
        [genNodeId]: { position: { x: 600, y: 200 }, selected: false },
        [outputNodeId]: { position: { x: 850, y: 200 }, selected: false },
      },
      inspectedNodeId: undefined,
    },
  };
}
