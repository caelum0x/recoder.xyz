import { beforeEach, describe, expect, it } from 'vitest';
import type { WorkspaceConnection, WorkspaceNode } from './types';
import { clearWorkspaces, createWorkspace, duplicateWorkspace, updateWorkspace } from './workspace-store';

describe('workspace-store duplicateWorkspace', () => {
  beforeEach(() => {
    clearWorkspaces();
  });

  it('regenerates node/connection ids and remaps node references in data', () => {
    const original = createWorkspace('Original');
    const nodeAId = 'nd_source_a' as any;
    const nodeBId = 'nd_source_b' as any;

    const nodes: WorkspaceNode[] = [
      {
        id: nodeAId,
        type: 'operation',
        position: { x: 0, y: 0 },
        data: {
          label: 'A',
          entryNodeId: nodeAId,
          linkedNodeId: nodeBId,
        },
      },
      {
        id: nodeBId,
        type: 'operation',
        position: { x: 10, y: 10 },
        data: {
          label: 'B',
          refs: [nodeAId],
        },
      },
    ];

    const connections: WorkspaceConnection[] = [
      {
        id: 'conn_source' as any,
        sourceNodeId: nodeAId,
        sourceOutputId: 'out-1',
        targetNodeId: nodeBId,
        targetInputId: 'in-1',
      },
    ];

    updateWorkspace(original.id, { nodes, connections });

    const duplicated = duplicateWorkspace(original.id);
    expect(duplicated).toBeTruthy();
    if (!duplicated) return;

    expect(duplicated.id).not.toBe(original.id);
    expect(duplicated.nodes).toHaveLength(2);
    expect(duplicated.connections).toHaveLength(1);

    const duplicateNodeIds = duplicated.nodes.map((n) => n.id);
    expect(duplicateNodeIds).not.toContain(nodeAId);
    expect(duplicateNodeIds).not.toContain(nodeBId);

    const connection = duplicated.connections[0];
    expect(connection.id).not.toBe('conn_source');
    expect(duplicateNodeIds).toContain(connection.sourceNodeId);
    expect(duplicateNodeIds).toContain(connection.targetNodeId);

    const nodeMap = duplicated.metadata?.nodeIdMap as Record<string, string>;
    expect(nodeMap[nodeAId]).toBeTypeOf('string');
    expect(nodeMap[nodeBId]).toBeTypeOf('string');

    const duplicatedNodeA = duplicated.nodes.find((n) => n.id === nodeMap[nodeAId]);
    const duplicatedNodeB = duplicated.nodes.find((n) => n.id === nodeMap[nodeBId]);
    expect(duplicatedNodeA?.data.entryNodeId).toBe(nodeMap[nodeAId]);
    expect(duplicatedNodeA?.data.linkedNodeId).toBe(nodeMap[nodeBId]);
    expect(duplicatedNodeB?.data.refs).toEqual([nodeMap[nodeAId]]);
  });
});
