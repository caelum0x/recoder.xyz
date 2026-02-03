/**
 * Node Factory
 *
 * Factory functions for creating workflow nodes, inspired by giselle node-registry
 */

import {
  type NodeId,
  type InputId,
  type OutputId,
  type WorkflowNode,
  type OperationNode,
  type VariableNode,
  type TextGenerationContent,
  type ImageGenerationContent,
  type ContentGenerationContent,
  type CodeExecutionContent,
  type TriggerContent,
  type ActionContent,
  type QueryContent,
  type DataQueryContent,
  type AppEntryContent,
  type EndContent,
  type TextVariableContent,
  type FileVariableContent,
  type GitHubVariableContent,
  type VectorStoreContent,
  type DataStoreContent,
  type WebPageContent,
  type NodeInput,
  type NodeOutput,
  NodeIdGenerator,
  InputIdGenerator,
  OutputIdGenerator,
  isTextGenerationNode,
  isImageGenerationNode,
  isTriggerNode,
  isActionNode,
  isQueryNode,
  isEndNode,
  isTextNode,
  isFileNode,
  isVectorStoreNode,
} from './types';

// ============================================
// Default Values
// ============================================

export const DEFAULT_MAX_RESULTS = 5;
export const DEFAULT_SIMILARITY_THRESHOLD = 0.7;

// ============================================
// Output Factories
// ============================================

function createOutput(label: string, accessor: string): NodeOutput {
  return {
    id: OutputIdGenerator.generate(),
    label,
    accessor,
  };
}

function createInput(label: string, accessor: string, isRequired = false): NodeInput {
  return {
    id: InputIdGenerator.generate(),
    label,
    accessor,
    isRequired,
  };
}

// ============================================
// Operation Node Factories
// ============================================

/**
 * Create a text generation node
 */
export function createTextGenerationNode(llm: TextGenerationContent['llm']): OperationNode {
  return {
    id: NodeIdGenerator.generate(),
    type: 'operation',
    content: {
      type: 'textGeneration',
      llm,
    },
    inputs: [],
    outputs: [createOutput('Output', 'generated-text')],
  };
}

/**
 * Create an image generation node
 */
export function createImageGenerationNode(llm: ImageGenerationContent['llm']): OperationNode {
  return {
    id: NodeIdGenerator.generate(),
    type: 'operation',
    content: {
      type: 'imageGeneration',
      llm,
    },
    inputs: [],
    outputs: [createOutput('Output', 'generated-image')],
  };
}

/**
 * Create a content generation node (unified generation)
 */
export function createContentGenerationNode(languageModel: ContentGenerationContent['languageModel']): OperationNode {
  return {
    id: NodeIdGenerator.generate(),
    type: 'operation',
    content: {
      type: 'contentGeneration',
      version: 'v1',
      prompt: '',
      languageModel,
      tools: [],
    },
    inputs: [],
    outputs: [createOutput('Output', 'generated-text')],
  };
}

/**
 * Create a code execution node
 */
export function createCodeExecutionNode(language: CodeExecutionContent['language'] = 'javascript'): OperationNode {
  return {
    id: NodeIdGenerator.generate(),
    type: 'operation',
    name: 'Code Execution',
    content: {
      type: 'codeExecution',
      code: '',
      language,
    },
    inputs: [createInput('Input', 'input')],
    outputs: [createOutput('Output', 'result')],
  };
}

/**
 * Create a trigger node
 */
export function createTriggerNode(provider: TriggerContent['provider']): OperationNode {
  const name = getTriggerNodeName(provider);
  return {
    id: NodeIdGenerator.generate(),
    type: 'operation',
    name,
    content: {
      type: 'trigger',
      provider,
      state: {
        status: 'unconfigured',
      },
    },
    inputs: [],
    outputs: [],
  };
}

function getTriggerNodeName(provider: TriggerContent['provider']): string {
  switch (provider) {
    case 'github':
      return 'GitHub Trigger';
    case 'manual':
      return 'Manual Trigger';
    case 'webhook':
      return 'Webhook Trigger';
    case 'schedule':
      return 'Scheduled Trigger';
    default:
      return 'Trigger';
  }
}

/**
 * Create an action node
 */
export function createActionNode(provider: ActionContent['command']['provider']): OperationNode {
  return {
    id: NodeIdGenerator.generate(),
    type: 'operation',
    name: 'GitHub Action',
    content: {
      type: 'action',
      command: {
        provider,
        state: {
          status: 'unconfigured',
        },
      },
    },
    inputs: [],
    outputs: [],
  };
}

/**
 * Create a query node (for RAG)
 */
export function createQueryNode(): OperationNode {
  return {
    id: NodeIdGenerator.generate(),
    type: 'operation',
    name: 'Query',
    content: {
      type: 'query',
      query: '',
      maxResults: DEFAULT_MAX_RESULTS,
      similarityThreshold: DEFAULT_SIMILARITY_THRESHOLD,
    },
    inputs: [],
    outputs: [createOutput('Output', 'result')],
  };
}

/**
 * Create a data query node
 */
export function createDataQueryNode(): OperationNode {
  return {
    id: NodeIdGenerator.generate(),
    type: 'operation',
    name: 'Data Query',
    content: {
      type: 'dataQuery',
      query: '',
    },
    inputs: [],
    outputs: [createOutput('Output', 'result')],
  };
}

/**
 * Create an app entry node
 */
export function createAppEntryNode(): OperationNode {
  const defaultParameters = [
    {
      id: `param_${Date.now()}_1`,
      name: 'Input (Text)',
      type: 'multiline-text' as const,
      required: true,
    },
    {
      id: `param_${Date.now()}_2`,
      name: 'Input (File)',
      type: 'files' as const,
      required: false,
    },
  ];

  return {
    id: NodeIdGenerator.generate(),
    type: 'operation',
    name: 'Start',
    content: {
      type: 'appEntry',
      status: 'unconfigured',
      draftApp: {
        name: 'Start',
        description: '',
        iconName: 'cable',
        parameters: defaultParameters,
      },
    },
    inputs: [],
    outputs: defaultParameters.map((param) => createOutput(param.name, param.id)),
  };
}

/**
 * Create an end node
 */
export function createEndNode(): OperationNode {
  return {
    id: NodeIdGenerator.generate(),
    type: 'operation',
    name: 'End',
    content: {
      type: 'end',
    },
    inputs: [],
    outputs: [],
  };
}

// ============================================
// Variable Node Factories
// ============================================

/**
 * Create a text variable node
 */
export function createTextNode(): VariableNode {
  return {
    id: NodeIdGenerator.generate(),
    type: 'variable',
    name: 'Text',
    content: {
      type: 'text',
      text: '',
    },
    inputs: [],
    outputs: [createOutput('Output', 'text')],
  };
}

/**
 * Create a file variable node
 */
export function createFileNode(category: FileVariableContent['category'] = 'document'): VariableNode {
  return {
    id: NodeIdGenerator.generate(),
    type: 'variable',
    name: 'File',
    content: {
      type: 'file',
      category,
      files: [],
    },
    inputs: [],
    outputs: [createOutput('Output', 'text')],
  };
}

/**
 * Create a GitHub variable node
 */
export function createGitHubNode(): VariableNode {
  return {
    id: NodeIdGenerator.generate(),
    type: 'variable',
    name: 'GitHub',
    content: {
      type: 'github',
      objectReferences: [],
    },
    inputs: [],
    outputs: [createOutput('Output', 'text')],
  };
}

/**
 * Create a vector store variable node
 */
export function createVectorStoreNode(provider: VectorStoreContent['source']['provider']): VariableNode {
  return {
    id: NodeIdGenerator.generate(),
    type: 'variable',
    name: provider === 'github' ? 'GitHub Repository' : 'Document Store',
    content: {
      type: 'vectorStore',
      source: {
        provider,
        state: {
          status: 'unconfigured',
        },
      },
    },
    inputs: [],
    outputs: [createOutput('Output', 'source')],
  };
}

/**
 * Create a data store variable node
 */
export function createDataStoreNode(): VariableNode {
  return {
    id: NodeIdGenerator.generate(),
    type: 'variable',
    name: 'Data Store',
    content: {
      type: 'dataStore',
      state: {
        status: 'unconfigured',
      },
    },
    inputs: [],
    outputs: [
      createOutput('Schema', 'schema'),
      createOutput('Source', 'source'),
    ],
  };
}

/**
 * Create a web page variable node
 */
export function createWebPageNode(): VariableNode {
  return {
    id: NodeIdGenerator.generate(),
    type: 'variable',
    name: 'Web Page',
    content: {
      type: 'webPage',
      webpages: [],
    },
    inputs: [],
    outputs: [createOutput('Output', 'web-page')],
  };
}

// ============================================
// Node Cloning
// ============================================

interface CloneResult {
  node: WorkflowNode;
  inputIdMap: Map<InputId, InputId>;
  outputIdMap: Map<OutputId, OutputId>;
}

function cloneInputs(inputs: NodeInput[]): { newInputs: NodeInput[]; idMap: Map<InputId, InputId> } {
  const idMap = new Map<InputId, InputId>();
  const newInputs = inputs.map((input) => {
    const newId = InputIdGenerator.generate();
    idMap.set(input.id, newId);
    return { ...input, id: newId };
  });
  return { newInputs, idMap };
}

function cloneOutputs(outputs: NodeOutput[]): { newOutputs: NodeOutput[]; idMap: Map<OutputId, OutputId> } {
  const idMap = new Map<OutputId, OutputId>();
  const newOutputs = outputs.map((output) => {
    const newId = OutputIdGenerator.generate();
    idMap.set(output.id, newId);
    return { ...output, id: newId };
  });
  return { newOutputs, idMap };
}

/**
 * Clone a workflow node
 */
export function cloneNode(node: WorkflowNode): CloneResult {
  const { newInputs, idMap: inputIdMap } = cloneInputs(node.inputs);
  const { newOutputs, idMap: outputIdMap } = cloneOutputs(node.outputs);

  const clonedContent = JSON.parse(JSON.stringify(node.content));

  // Reset state for certain node types
  if (node.content.type === 'trigger') {
    (clonedContent as TriggerContent).state = { status: 'unconfigured' };
  } else if (node.content.type === 'action') {
    (clonedContent as ActionContent).command.state = { status: 'unconfigured' };
  } else if (node.content.type === 'vectorStore') {
    (clonedContent as VectorStoreContent).source.state = { status: 'unconfigured' };
  } else if (node.content.type === 'dataStore') {
    (clonedContent as DataStoreContent).state = { status: 'unconfigured' };
  }

  const clonedNode: WorkflowNode = {
    ...node,
    id: NodeIdGenerator.generate(),
    name: node.name ? `Copy of ${node.name}` : undefined,
    content: clonedContent,
    inputs: newInputs,
    outputs: newOutputs,
  } as WorkflowNode;

  return {
    node: clonedNode,
    inputIdMap,
    outputIdMap,
  };
}

// ============================================
// Node Registry
// ============================================

/** Available node type entries for the toolbar */
export interface NodeTypeEntry {
  type: string;
  label: string;
  category: 'operation' | 'variable' | 'trigger' | 'integration';
  icon: string;
  description: string;
  create: () => WorkflowNode;
}

export const nodeRegistry: NodeTypeEntry[] = [
  // Operation Nodes
  {
    type: 'textGeneration',
    label: 'Text Generation',
    category: 'operation',
    icon: 'sparkles',
    description: 'Generate text using an AI model',
    create: () => createTextGenerationNode({ id: 'gpt-4o', provider: 'openai' }),
  },
  {
    type: 'imageGeneration',
    label: 'Image Generation',
    category: 'operation',
    icon: 'image',
    description: 'Generate images using an AI model',
    create: () => createImageGenerationNode({ id: 'dall-e-3', provider: 'openai' }),
  },
  {
    type: 'codeExecution',
    label: 'Code Execution',
    category: 'operation',
    icon: 'code',
    description: 'Execute code in a sandboxed environment',
    create: () => createCodeExecutionNode('javascript'),
  },
  {
    type: 'query',
    label: 'RAG Query',
    category: 'operation',
    icon: 'search',
    description: 'Query documents using RAG',
    create: createQueryNode,
  },
  {
    type: 'dataQuery',
    label: 'Data Query',
    category: 'operation',
    icon: 'database',
    description: 'Query structured data',
    create: createDataQueryNode,
  },

  // Trigger Nodes
  {
    type: 'trigger-github',
    label: 'GitHub Trigger',
    category: 'trigger',
    icon: 'github',
    description: 'Trigger workflow from GitHub events',
    create: () => createTriggerNode('github'),
  },
  {
    type: 'trigger-manual',
    label: 'Manual Trigger',
    category: 'trigger',
    icon: 'play',
    description: 'Manually trigger the workflow',
    create: () => createTriggerNode('manual'),
  },
  {
    type: 'trigger-webhook',
    label: 'Webhook Trigger',
    category: 'trigger',
    icon: 'webhook',
    description: 'Trigger workflow from HTTP webhooks',
    create: () => createTriggerNode('webhook'),
  },
  {
    type: 'trigger-schedule',
    label: 'Scheduled Trigger',
    category: 'trigger',
    icon: 'clock',
    description: 'Trigger workflow on a schedule',
    create: () => createTriggerNode('schedule'),
  },

  // Action Nodes
  {
    type: 'action-github',
    label: 'GitHub Action',
    category: 'integration',
    icon: 'github',
    description: 'Perform GitHub actions',
    create: () => createActionNode('github'),
  },

  // Variable Nodes
  {
    type: 'text',
    label: 'Text',
    category: 'variable',
    icon: 'text',
    description: 'Store and reference text content',
    create: createTextNode,
  },
  {
    type: 'file',
    label: 'File',
    category: 'variable',
    icon: 'file',
    description: 'Upload and reference files',
    create: () => createFileNode('document'),
  },
  {
    type: 'github',
    label: 'GitHub Reference',
    category: 'variable',
    icon: 'github',
    description: 'Reference GitHub issues, PRs, etc.',
    create: createGitHubNode,
  },
  {
    type: 'vectorStore-github',
    label: 'GitHub Repository',
    category: 'integration',
    icon: 'database',
    description: 'Index and query a GitHub repository',
    create: () => createVectorStoreNode('github'),
  },
  {
    type: 'vectorStore-document',
    label: 'Document Store',
    category: 'integration',
    icon: 'folder',
    description: 'Index and query documents',
    create: () => createVectorStoreNode('document'),
  },
  {
    type: 'webPage',
    label: 'Web Page',
    category: 'variable',
    icon: 'globe',
    description: 'Fetch and reference web pages',
    create: createWebPageNode,
  },

  // Control Flow
  {
    type: 'appEntry',
    label: 'Start',
    category: 'operation',
    icon: 'play-circle',
    description: 'Entry point for the workflow',
    create: createAppEntryNode,
  },
  {
    type: 'end',
    label: 'End',
    category: 'operation',
    icon: 'stop-circle',
    description: 'End point for the workflow',
    create: createEndNode,
  },
];

/**
 * Get node registry entries by category
 */
export function getNodesByCategory(category: NodeTypeEntry['category']): NodeTypeEntry[] {
  return nodeRegistry.filter((entry) => entry.category === category);
}

/**
 * Get a node registry entry by type
 */
export function getNodeEntry(type: string): NodeTypeEntry | undefined {
  return nodeRegistry.find((entry) => entry.type === type);
}

/**
 * Get default node name based on content type
 */
export function getDefaultNodeName(node: WorkflowNode): string {
  if (node.name) return node.name;

  const entry = nodeRegistry.find(
    (e) => e.type === node.content.type || e.type === `${node.content.type}-${(node.content as any).provider || ''}`
  );

  return entry?.label || node.content.type;
}
