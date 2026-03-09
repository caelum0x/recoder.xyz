import { backendApi } from '../api-client';
import { handleApiError } from '../error-handler';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Workflow {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  version: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowNode {
  id: string;
  workflow_id: string;
  node_type:
    | 'agent'
    | 'tool'
    | 'condition'
    | 'loop'
    | 'parallel'
    | 'delay'
    | 'approval'
    | 'input'
    | 'output';
  label: string;
  config: Record<string, unknown>;
  position_x: number;
  position_y: number;
}

export interface WorkflowEdge {
  id: string;
  workflow_id: string;
  source_node_id: string;
  target_node_id: string;
  condition?: Record<string, unknown>;
}

export interface WorkflowDetail extends Workflow {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  started_at: string;
  completed_at?: string;
  duration_seconds?: number;
  total_cost?: number;
}

export interface ApprovalGate {
  id: string;
  execution_id: string;
  node_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  context: Record<string, unknown>;
  node_label?: string;
  workflow_name?: string;
  requested_at: string;
}

export interface CreateWorkflowRequest {
  agent_id: string;
  name: string;
  description?: string;
}

export interface AddNodeRequest {
  node_type: WorkflowNode['node_type'];
  label: string;
  config?: Record<string, unknown>;
  position_x?: number;
  position_y?: number;
}

export interface AddEdgeRequest {
  source_node_id: string;
  target_node_id: string;
  condition?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

async function listWorkflows(agentId: string): Promise<Workflow[]> {
  try {
    const response = await backendApi.get<Workflow[]>(
      `/workflows/agent/${agentId}`,
      { showErrors: false },
    );

    if (response.error) {
      throw new Error(
        `Error listing workflows: ${response.error.message} (${response.error.status})`,
      );
    }

    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'list workflows', resource: 'workflows' });
    throw error;
  }
}

async function getWorkflow(id: string): Promise<WorkflowDetail> {
  try {
    const response = await backendApi.get<WorkflowDetail>(
      `/workflows/${id}`,
      { showErrors: false },
    );

    if (response.error) {
      throw new Error(
        `Error fetching workflow: ${response.error.message} (${response.error.status})`,
      );
    }

    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get workflow', resource: 'workflow' });
    throw error;
  }
}

async function createWorkflow(data: CreateWorkflowRequest): Promise<Workflow> {
  try {
    const response = await backendApi.post<Workflow>(
      '/workflows',
      data,
      { showErrors: true },
    );

    if (response.error) {
      throw new Error(
        `Error creating workflow: ${response.error.message} (${response.error.status})`,
      );
    }

    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'create workflow', resource: 'workflow' });
    throw error;
  }
}

async function deleteWorkflow(id: string): Promise<void> {
  try {
    const response = await backendApi.delete(
      `/workflows/${id}`,
      { showErrors: true },
    );

    if (response.error) {
      throw new Error(
        `Error deleting workflow: ${response.error.message} (${response.error.status})`,
      );
    }
  } catch (error) {
    handleApiError(error, { operation: 'delete workflow', resource: 'workflow' });
    throw error;
  }
}

async function addNode(workflowId: string, node: AddNodeRequest): Promise<WorkflowNode> {
  try {
    const response = await backendApi.post<WorkflowNode>(
      `/workflows/${workflowId}/nodes`,
      node,
      { showErrors: true },
    );

    if (response.error) {
      throw new Error(
        `Error adding node: ${response.error.message} (${response.error.status})`,
      );
    }

    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'add node', resource: 'workflow node' });
    throw error;
  }
}

async function addEdge(workflowId: string, edge: AddEdgeRequest): Promise<WorkflowEdge> {
  try {
    const response = await backendApi.post<WorkflowEdge>(
      `/workflows/${workflowId}/edges`,
      edge,
      { showErrors: true },
    );

    if (response.error) {
      throw new Error(
        `Error adding edge: ${response.error.message} (${response.error.status})`,
      );
    }

    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'add edge', resource: 'workflow edge' });
    throw error;
  }
}

async function deleteNode(nodeId: string): Promise<void> {
  try {
    const response = await backendApi.delete(
      `/workflows/nodes/${nodeId}`,
      { showErrors: true },
    );

    if (response.error) {
      throw new Error(
        `Error deleting node: ${response.error.message} (${response.error.status})`,
      );
    }
  } catch (error) {
    handleApiError(error, { operation: 'delete node', resource: 'workflow node' });
    throw error;
  }
}

async function deleteEdge(edgeId: string): Promise<void> {
  try {
    const response = await backendApi.delete(
      `/workflows/edges/${edgeId}`,
      { showErrors: true },
    );

    if (response.error) {
      throw new Error(
        `Error deleting edge: ${response.error.message} (${response.error.status})`,
      );
    }
  } catch (error) {
    handleApiError(error, { operation: 'delete edge', resource: 'workflow edge' });
    throw error;
  }
}

async function executeWorkflow(
  workflowId: string,
  triggerData?: Record<string, unknown>,
): Promise<WorkflowExecution> {
  try {
    const response = await backendApi.post<WorkflowExecution>(
      `/workflows/${workflowId}/execute`,
      triggerData ? { trigger_data: triggerData } : undefined,
      { showErrors: true },
    );

    if (response.error) {
      throw new Error(
        `Error executing workflow: ${response.error.message} (${response.error.status})`,
      );
    }

    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'execute workflow', resource: 'workflow execution' });
    throw error;
  }
}

async function listExecutions(workflowId: string): Promise<WorkflowExecution[]> {
  try {
    const response = await backendApi.get<WorkflowExecution[]>(
      `/workflows/${workflowId}/executions`,
      { showErrors: false },
    );

    if (response.error) {
      throw new Error(
        `Error listing executions: ${response.error.message} (${response.error.status})`,
      );
    }

    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'list executions', resource: 'workflow executions' });
    throw error;
  }
}

async function getExecution(executionId: string): Promise<WorkflowExecution> {
  try {
    const response = await backendApi.get<WorkflowExecution>(
      `/workflows/executions/${executionId}`,
      { showErrors: false },
    );

    if (response.error) {
      throw new Error(
        `Error fetching execution: ${response.error.message} (${response.error.status})`,
      );
    }

    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'get execution', resource: 'workflow execution' });
    throw error;
  }
}

async function pendingApprovals(): Promise<ApprovalGate[]> {
  try {
    const response = await backendApi.get<ApprovalGate[]>(
      '/workflows/approvals/pending',
      { showErrors: false },
    );

    if (response.error) {
      throw new Error(
        `Error fetching pending approvals: ${response.error.message} (${response.error.status})`,
      );
    }

    return response.data!;
  } catch (error) {
    handleApiError(error, { operation: 'list pending approvals', resource: 'approvals' });
    throw error;
  }
}

async function approveGate(id: string): Promise<void> {
  try {
    const response = await backendApi.post(
      `/workflows/approvals/${id}/approve`,
      {},
      { showErrors: true },
    );

    if (response.error) {
      throw new Error(
        `Error approving gate: ${response.error.message} (${response.error.status})`,
      );
    }
  } catch (error) {
    handleApiError(error, { operation: 'approve gate', resource: 'approval gate' });
    throw error;
  }
}

async function rejectGate(id: string): Promise<void> {
  try {
    const response = await backendApi.post(
      `/workflows/approvals/${id}/reject`,
      {},
      { showErrors: true },
    );

    if (response.error) {
      throw new Error(
        `Error rejecting gate: ${response.error.message} (${response.error.status})`,
      );
    }
  } catch (error) {
    handleApiError(error, { operation: 'reject gate', resource: 'approval gate' });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Exported API object
// ---------------------------------------------------------------------------

export const workflowApi = {
  list: listWorkflows,
  get: getWorkflow,
  create: createWorkflow,
  delete: deleteWorkflow,
  addNode,
  addEdge,
  deleteNode,
  deleteEdge,
  execute: executeWorkflow,
  listExecutions,
  getExecution,
  pendingApprovals,
  approve: approveGate,
  reject: rejectGate,
};
