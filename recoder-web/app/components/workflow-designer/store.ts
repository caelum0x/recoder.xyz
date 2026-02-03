'use client';

import { createContext, useContext } from 'react';
import { createStore, useStore } from 'zustand';
import { combine } from 'zustand/middleware';
import type {
  Workflow,
  WorkflowNode,
  NodeId,
  Connection,
  NodeUIState,
} from './types';

export interface EditorState extends Omit<Workflow, 'id'> {
  workflowId: string;
}

export interface EditorAction {
  updateNode: (id: NodeId, patch: Partial<WorkflowNode>) => void;
  addNode: (node: WorkflowNode, position: { x: number; y: number }) => void;
  removeNode: (id: NodeId) => void;
  addConnection: (connection: Connection) => void;
  removeConnection: (connectionId: string) => void;
  setInspectedNodeId: (id: NodeId | undefined) => void;
  setNodePosition: (id: NodeId, position: { x: number; y: number }) => void;
  setNodeSelected: (id: NodeId, selected: boolean) => void;
  setNodeHighlighted: (id: NodeId, highlighted: boolean) => void;
  clearSelection: () => void;
}

export type EditorStore = ReturnType<typeof createEditorStore>;

export function createEditorStore(initial: { workflow: Workflow }) {
  return createStore(
    combine<EditorState, EditorAction>(
      {
        workflowId: initial.workflow.id,
        name: initial.workflow.name,
        nodes: initial.workflow.nodes,
        connections: initial.workflow.connections,
        ui: initial.workflow.ui,
      },
      (set) => ({
        updateNode: (id, patch) =>
          set((s) => ({
            nodes: s.nodes.map((node) =>
              node.id === id ? ({ ...node, ...patch } as WorkflowNode) : node
            ),
          })),

        addNode: (node, position) =>
          set((s) => ({
            nodes: [...s.nodes, node],
            ui: {
              ...s.ui,
              nodeState: {
                ...s.ui.nodeState,
                [node.id]: { position, selected: false, highlighted: false },
              },
            },
          })),

        removeNode: (id) =>
          set((s) => {
            const nextState = { ...s.ui.nodeState };
            delete nextState[id];
            const nextNodes = s.nodes.filter((n) => n.id !== id);
            const nextConnections = s.connections.filter(
              (c) => c.outputNode.id !== id && c.inputNode.id !== id
            );
            return {
              nodes: nextNodes,
              connections: nextConnections,
              ui: {
                ...s.ui,
                nodeState: nextState,
                inspectedNodeId:
                  s.ui.inspectedNodeId === id ? undefined : s.ui.inspectedNodeId,
              },
            };
          }),

        addConnection: (connection) =>
          set((s) => ({
            connections: [...s.connections, connection],
          })),

        removeConnection: (connectionId) =>
          set((s) => ({
            connections: s.connections.filter((c) => c.id !== connectionId),
          })),

        setInspectedNodeId: (id) =>
          set((s) => ({
            ui: {
              ...s.ui,
              inspectedNodeId: id,
            },
          })),

        setNodePosition: (id, position) =>
          set((s) => {
            const node = s.ui.nodeState[id];
            if (!node) return s;
            return {
              ui: {
                ...s.ui,
                nodeState: {
                  ...s.ui.nodeState,
                  [id]: { ...node, position },
                },
              },
            };
          }),

        setNodeSelected: (id, selected) =>
          set((s) => {
            const node = s.ui.nodeState[id];
            if (!node) return s;
            return {
              ui: {
                ...s.ui,
                nodeState: {
                  ...s.ui.nodeState,
                  [id]: { ...node, selected },
                },
              },
            };
          }),

        setNodeHighlighted: (id, highlighted) =>
          set((s) => {
            const node = s.ui.nodeState[id];
            if (!node) return s;
            return {
              ui: {
                ...s.ui,
                nodeState: {
                  ...s.ui.nodeState,
                  [id]: { ...node, highlighted },
                },
              },
            };
          }),

        clearSelection: () =>
          set((s) => {
            const nextNodeState: Record<NodeId, NodeUIState> = {};
            for (const [id, state] of Object.entries(s.ui.nodeState)) {
              nextNodeState[id as NodeId] = { ...state, selected: false };
            }
            return {
              ui: {
                ...s.ui,
                nodeState: nextNodeState,
                inspectedNodeId: undefined,
              },
            };
          }),
      })
    )
  );
}

// Context and hooks
export const EditorStoreContext = createContext<EditorStore | null>(null);

export function useEditorStore<T>(
  selector: (s: EditorState & EditorAction) => T
): T {
  const store = useContext(EditorStoreContext);
  if (!store) {
    throw new Error('useEditorStore must be used within <EditorStoreProvider/>');
  }
  return useStore(store, selector);
}

export function useEditorStoreWithEqualityFn<T>(
  selector: (s: EditorState & EditorAction) => T,
  equalityFn: (a: T, b: T) => boolean
): T {
  const store = useContext(EditorStoreContext);
  if (!store) {
    throw new Error('useEditorStore must be used within <EditorStoreProvider/>');
  }
  return useStore(store, selector, equalityFn);
}

// Selectors
export function selectNodeIds(s: EditorState & EditorAction) {
  return s.nodes.map((node) => node.id);
}

export function selectNode(nodeId: NodeId) {
  return function selector(s: EditorState & EditorAction) {
    return s.nodes.find((node) => node.id === nodeId);
  };
}

export function selectCanvasData(s: EditorState & EditorAction) {
  const nodeUiData = s.nodes.map((node) => {
    const ui = s.ui.nodeState[node.id];
    return {
      id: node.id,
      position: ui?.position ?? { x: 0, y: 0 },
      selected: ui?.selected ?? false,
    };
  });

  const edges = s.connections.map((c) => ({
    id: c.id,
    source: c.outputNode.id,
    sourceHandle: c.outputId,
    target: c.inputNode.id,
    targetHandle: c.inputId,
  }));

  return { nodeUiData, edges };
}

export function selectNodePanelDataById(id: NodeId) {
  return function selector(s: EditorState & EditorAction) {
    const node = s.nodes.find((n) => n.id === id);

    const connectedInputIds = s.connections
      .filter((c) => c.inputNode.id === id)
      .map((c) => c.inputId);

    const connectedOutputIds = s.connections
      .filter((c) => c.outputNode.id === id)
      .map((c) => c.outputId);

    return {
      node,
      connectedInputIds,
      connectedOutputIds,
      highlighted: s.ui.nodeState[id]?.highlighted ?? false,
      updateNode: s.updateNode,
    };
  };
}
