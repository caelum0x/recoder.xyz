import { describe, expect, it } from 'vitest';
import { copyWorkspaceGraph, validateWorkspaceGraph } from './graph-copy';

describe('copyWorkspaceGraph', () => {
  it('duplicates nodes and connections with fresh IDs', () => {
    const source = {
      nodes: [
        { id: 'nd_original_1', type: 'operation', position: { x: 0, y: 0 }, data: { label: 'Node 1' } },
        { id: 'nd_original_2', type: 'variable', position: { x: 100, y: 100 }, data: { label: 'Node 2' } },
      ],
      connections: [
        {
          id: 'con_original_1',
          sourceNodeId: 'nd_original_1',
          sourceOutputId: 'out_1',
          targetNodeId: 'nd_original_2',
          targetInputId: 'in_1',
        },
      ],
    };

    const result = copyWorkspaceGraph(source);

    // New IDs must differ from originals
    expect(result.nodes[0].id).not.toBe('nd_original_1');
    expect(result.nodes[1].id).not.toBe('nd_original_2');
    expect(result.connections[0].id).not.toBe('con_original_1');

    // Connection endpoints remapped to new node IDs
    expect(result.connections[0].sourceNodeId).toBe(result.nodes[0].id);
    expect(result.connections[0].targetNodeId).toBe(result.nodes[1].id);

    // ID map records the mapping
    expect(result.idMap.nodeIdMap['nd_original_1']).toBe(result.nodes[0].id);
    expect(result.idMap.nodeIdMap['nd_original_2']).toBe(result.nodes[1].id);
    expect(result.idMap.connectionIdMap['con_original_1']).toBe(result.connections[0].id);
  });

  it('remaps node IDs embedded in node data', () => {
    const source = {
      nodes: [
        { id: 'nd_a', data: { nextNode: 'nd_b', list: ['nd_b', 'other'] } },
        { id: 'nd_b', data: {} },
      ],
      connections: [],
    };

    const result = copyWorkspaceGraph(source);
    const newBId = result.idMap.nodeIdMap['nd_b'];

    // Deep references inside node data should be remapped
    expect((result.nodes[0].data as any).nextNode).toBe(newBId);
    expect((result.nodes[0].data as any).list[0]).toBe(newBId);
    expect((result.nodes[0].data as any).list[1]).toBe('other');
  });

  it('handles source/target naming convention', () => {
    const source = {
      nodes: [
        { id: 'nd_1', data: {} },
        { id: 'nd_2', data: {} },
      ],
      connections: [
        { id: 'con_1', source: 'nd_1', target: 'nd_2' },
      ],
    };

    const result = copyWorkspaceGraph(source);
    expect(result.connections[0].source).toBe(result.idMap.nodeIdMap['nd_1']);
    expect(result.connections[0].target).toBe(result.idMap.nodeIdMap['nd_2']);
  });

  it('copies metadata and marks as copied', () => {
    const source = {
      nodes: [],
      connections: [],
      metadata: { custom: 'value' },
    };

    const result = copyWorkspaceGraph(source);
    expect(result.metadata.custom).toBe('value');
    expect(result.metadata.copiedFromGraph).toBe(true);
    expect(result.metadata.graphCopiedAt).toBeDefined();
  });
});

describe('validateWorkspaceGraph', () => {
  it('returns null for non-object input', () => {
    expect(validateWorkspaceGraph(null)).toBeNull();
    expect(validateWorkspaceGraph(undefined)).toBeNull();
    expect(validateWorkspaceGraph('string')).toBeNull();
    expect(validateWorkspaceGraph(42)).toBeNull();
  });

  it('returns null when nodes/connections are missing', () => {
    expect(validateWorkspaceGraph({})).toBeNull();
    expect(validateWorkspaceGraph({ nodes: [] })).toBeNull();
    expect(validateWorkspaceGraph({ connections: [] })).toBeNull();
  });

  it('returns null when node IDs are not strings', () => {
    expect(validateWorkspaceGraph({
      nodes: [{ id: 42 }],
      connections: [],
    })).toBeNull();
  });

  it('accepts a valid minimal graph', () => {
    const result = validateWorkspaceGraph({
      nodes: [{ id: 'nd_1' }],
      connections: [{ id: 'con_1' }],
    });
    expect(result).not.toBeNull();
    expect(result!.nodes).toHaveLength(1);
    expect(result!.connections).toHaveLength(1);
  });

  it('rejects graphs exceeding size limits', () => {
    const tooManyNodes = Array.from({ length: 501 }, (_, i) => ({ id: `nd_${i}` }));
    expect(validateWorkspaceGraph({
      nodes: tooManyNodes,
      connections: [],
    })).toBeNull();
  });
});
