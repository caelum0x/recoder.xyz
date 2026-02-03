// Workflow Designer Types
// Adapted from giselle workflow-designer-ui for recoder-web

export type NodeId = string & { readonly __brand: 'NodeId' };
export type InputId = string & { readonly __brand: 'InputId' };
export type OutputId = string & { readonly __brand: 'OutputId' };
export type ConnectionId = string & { readonly __brand: 'ConnectionId' };
export type WorkflowId = string & { readonly __brand: 'WorkflowId' };

// Node content types
export type NodeContentType =
  | 'text'
  | 'file'
  | 'prompt'
  | 'textGeneration'
  | 'imageGeneration'
  | 'codeExecution'
  | 'apiCall'
  | 'conditional'
  | 'loop'
  | 'variable'
  | 'output'
  | 'trigger'
  | 'action'
  | 'query';

export type NodeType = 'operation' | 'variable';

export interface NodeInput {
  id: InputId;
  label: string;
  isRequired?: boolean;
  type?: 'text' | 'file' | 'any';
}

export interface NodeOutput {
  id: OutputId;
  label: string;
  type?: 'text' | 'file' | 'any';
}

export interface NodeContent {
  type: NodeContentType;
  prompt?: string;
  model?: string;
  provider?: string;
  code?: string;
  url?: string;
  method?: string;
  condition?: string;
  value?: string;
}

export interface WorkflowNode {
  id: NodeId;
  name?: string;
  type: NodeType;
  content: NodeContent;
  inputs?: NodeInput[];
  outputs?: NodeOutput[];
}

export interface NodeUIState {
  position: { x: number; y: number };
  selected?: boolean;
  highlighted?: boolean;
}

export interface Connection {
  id: ConnectionId;
  outputNode: { id: NodeId };
  outputId: OutputId;
  inputNode: { id: NodeId };
  inputId: InputId;
}

export interface WorkflowUI {
  nodeState: Record<NodeId, NodeUIState>;
  inspectedNodeId?: NodeId;
}

export interface Workflow {
  id: WorkflowId;
  name: string;
  nodes: WorkflowNode[];
  connections: Connection[];
  ui: WorkflowUI;
}

// Generation types for output display
export type GenerationStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface GenerationError {
  message: string;
  code?: string;
}

export interface GenerationOutput {
  type: 'text' | 'generated-image' | 'query-result';
  outputId: string;
  content?: string;
  contents?: Array<{ filename: string; pathname: string }>;
}

export interface Generation {
  id: string;
  status: GenerationStatus;
  error?: GenerationError;
  outputs?: GenerationOutput[];
  messages?: Array<{
    id: string;
    role: 'user' | 'assistant';
    parts: Array<{
      type: string;
      text?: string;
      toolCallId?: string;
      state?: string;
      input?: unknown;
      output?: unknown;
    }>;
  }>;
}

// Model picker types
export interface ModelOption {
  id: string;
  label?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}

export interface ModelPickerGroup {
  provider: string;
  label?: string;
  models: ModelOption[];
}

// Utility functions
export function createNodeId(id: string): NodeId {
  return `nd_${id}` as NodeId;
}

export function createInputId(id: string): InputId {
  return `inp_${id}` as InputId;
}

export function createOutputId(id: string): OutputId {
  return `otp_${id}` as OutputId;
}

export function createConnectionId(id: string): ConnectionId {
  return `con_${id}` as ConnectionId;
}

export function createWorkflowId(id: string): WorkflowId {
  return `wf_${id}` as WorkflowId;
}

export function isNodeId(id: string): id is NodeId {
  return id.startsWith('nd_');
}

export function isInputId(id: string): id is InputId {
  return id.startsWith('inp_');
}

export function isOutputId(id: string): id is OutputId {
  return id.startsWith('otp_');
}

export function getDefaultNodeName(node: WorkflowNode): string {
  if (node.name) return node.name;

  switch (node.content.type) {
    case 'text':
      return 'Text';
    case 'file':
      return 'File';
    case 'prompt':
      return 'Prompt';
    case 'textGeneration':
      return 'Text Generation';
    case 'imageGeneration':
      return 'Image Generation';
    case 'codeExecution':
      return 'Code Execution';
    case 'apiCall':
      return 'API Call';
    case 'conditional':
      return 'Condition';
    case 'loop':
      return 'Loop';
    case 'variable':
      return 'Variable';
    case 'output':
      return 'Output';
    case 'trigger':
      return 'Trigger';
    case 'action':
      return 'Action';
    case 'query':
      return 'Query';
    default:
      return 'Node';
  }
}
