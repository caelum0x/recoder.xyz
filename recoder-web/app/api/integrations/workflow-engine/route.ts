import { NextResponse } from 'next/server';
import crypto from 'crypto';

// 🔧 WORKFLOW ENGINE - VISUAL INTEGRATION AUTOMATION
// Drag-and-drop workflow builder for API integrations with real-time execution

interface WorkflowNode {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'delay' | 'transform' | 'split' | 'merge';
  provider: string;
  operation: string;
  config: any;
  position: { x: number; y: number };
  connections: string[];
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: string;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'paused' | 'error';
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  triggers: string[];
  variables: Record<string, any>;
  created_at: string;
  updated_at: string;
  last_run?: string;
  run_count: number;
  error_count: number;
}

interface WorkflowExecution {
  id: string;
  workflow_id: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  started_at: string;
  completed_at?: string;
  current_node?: string;
  variables: Record<string, any>;
  execution_log: ExecutionLogEntry[];
  error?: string;
}

interface ExecutionLogEntry {
  timestamp: string;
  node_id: string;
  node_type: string;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  input: any;
  output?: any;
  error?: string;
  duration_ms?: number;
}

interface WorkflowAction {
  action: 'create_workflow' | 'update_workflow' | 'delete_workflow' | 'get_workflow' | 'list_workflows' | 'execute_workflow' | 'pause_workflow' | 'resume_workflow' | 'get_execution' | 'list_executions' | 'cancel_execution' | 'get_templates' | 'validate_workflow';
  data?: any;
  workflow_id?: string;
  execution_id?: string;
}

// In-memory storage (use database in production)
const workflows = new Map<string, Workflow>();
const executions = new Map<string, WorkflowExecution>();

export async function POST(request: Request) {
  try {
    const body: WorkflowAction = await request.json();
    const { action, data, workflow_id, execution_id } = body;

    let result;

    switch (action) {
      case 'create_workflow':
        result = await createWorkflow(data);
        break;
        
      case 'update_workflow':
        result = await updateWorkflow(workflow_id!, data);
        break;
        
      case 'delete_workflow':
        result = await deleteWorkflow(workflow_id!);
        break;
        
      case 'get_workflow':
        result = await getWorkflow(workflow_id!);
        break;
        
      case 'list_workflows':
        result = await listWorkflows(data);
        break;
        
      case 'execute_workflow':
        result = await executeWorkflow(workflow_id!, data);
        break;
        
      case 'pause_workflow':
        result = await pauseWorkflow(workflow_id!);
        break;
        
      case 'resume_workflow':
        result = await resumeWorkflow(workflow_id!);
        break;
        
      case 'get_execution':
        result = await getExecution(execution_id!);
        break;
        
      case 'list_executions':
        result = await listExecutions(workflow_id, data);
        break;
        
      case 'cancel_execution':
        result = await cancelExecution(execution_id!);
        break;
        
      case 'get_templates':
        result = await getWorkflowTemplates();
        break;
        
      case 'validate_workflow':
        result = await validateWorkflow(data);
        break;
        
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Workflow Engine Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Workflow operation failed' 
      },
      { status: 500 }
    );
  }
}

// Create new workflow
async function createWorkflow(data: any): Promise<Workflow> {
  const workflow: Workflow = {
    id: crypto.randomUUID(),
    name: data.name || 'Untitled Workflow',
    description: data.description,
    status: 'draft',
    nodes: data.nodes || [],
    edges: data.edges || [],
    triggers: data.triggers || [],
    variables: data.variables || {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    run_count: 0,
    error_count: 0
  };

  workflows.set(workflow.id, workflow);
  return workflow;
}

// Update existing workflow
async function updateWorkflow(workflowId: string, data: any): Promise<Workflow> {
  const workflow = workflows.get(workflowId);
  if (!workflow) {
    throw new Error('Workflow not found');
  }

  const updated: Workflow = {
    ...workflow,
    name: data.name || workflow.name,
    description: data.description ?? workflow.description,
    status: data.status || workflow.status,
    nodes: data.nodes || workflow.nodes,
    edges: data.edges || workflow.edges,
    triggers: data.triggers || workflow.triggers,
    variables: { ...workflow.variables, ...data.variables },
    updated_at: new Date().toISOString()
  };

  workflows.set(workflowId, updated);
  return updated;
}

// Delete workflow
async function deleteWorkflow(workflowId: string) {
  const workflow = workflows.get(workflowId);
  if (!workflow) {
    throw new Error('Workflow not found');
  }

  workflows.delete(workflowId);
  
  // Cancel any running executions
  for (const [executionId, execution] of executions.entries()) {
    if (execution.workflow_id === workflowId && execution.status === 'running') {
      await cancelExecution(executionId);
    }
  }

  return {
    deleted: true,
    workflow_id: workflowId,
    deleted_at: new Date().toISOString()
  };
}

// Get workflow by ID
async function getWorkflow(workflowId: string): Promise<Workflow> {
  const workflow = workflows.get(workflowId);
  if (!workflow) {
    throw new Error('Workflow not found');
  }
  return workflow;
}

// List workflows with filtering
async function listWorkflows(params: any = {}) {
  const allWorkflows = Array.from(workflows.values());
  
  let filtered = allWorkflows;
  
  if (params.status) {
    filtered = filtered.filter(w => w.status === params.status);
  }
  
  if (params.search) {
    const search = params.search.toLowerCase();
    filtered = filtered.filter(w => 
      w.name.toLowerCase().includes(search) ||
      w.description?.toLowerCase().includes(search)
    );
  }

  // Sort by created date (newest first)
  filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const limit = params.limit || 10;
  const offset = params.offset || 0;
  
  return {
    workflows: filtered.slice(offset, offset + limit),
    total: filtered.length,
    has_more: offset + limit < filtered.length
  };
}

// Execute workflow
async function executeWorkflow(workflowId: string, data: any = {}): Promise<WorkflowExecution> {
  const workflow = workflows.get(workflowId);
  if (!workflow) {
    throw new Error('Workflow not found');
  }

  if (workflow.status !== 'active') {
    throw new Error('Workflow is not active');
  }

  const execution: WorkflowExecution = {
    id: crypto.randomUUID(),
    workflow_id: workflowId,
    status: 'running',
    started_at: new Date().toISOString(),
    variables: { ...workflow.variables, ...data.input_variables },
    execution_log: []
  };

  executions.set(execution.id, execution);

  // Start execution asynchronously
  executeWorkflowAsync(execution).catch(error => {
    console.error('Workflow execution failed:', error);
    execution.status = 'failed';
    execution.error = error.message;
    execution.completed_at = new Date().toISOString();
    executions.set(execution.id, execution);
  });

  return execution;
}

// Asynchronous workflow execution
async function executeWorkflowAsync(execution: WorkflowExecution) {
  const workflow = workflows.get(execution.workflow_id)!;
  
  try {
    // Find trigger nodes
    const triggerNodes = workflow.nodes.filter(node => node.type === 'trigger');
    
    if (triggerNodes.length === 0) {
      throw new Error('No trigger nodes found in workflow');
    }

    // Execute from each trigger node
    for (const triggerNode of triggerNodes) {
      await executeNode(workflow, execution, triggerNode);
    }

    execution.status = 'completed';
    execution.completed_at = new Date().toISOString();
    
    // Update workflow stats
    workflow.run_count++;
    workflow.last_run = new Date().toISOString();
    workflows.set(workflow.id, workflow);
    
  } catch (error: any) {
    execution.status = 'failed';
    execution.error = error.message;
    execution.completed_at = new Date().toISOString();
    
    // Update workflow error count
    workflow.error_count++;
    workflows.set(workflow.id, workflow);
  }
  
  executions.set(execution.id, execution);
}

// Execute individual node
async function executeNode(workflow: Workflow, execution: WorkflowExecution, node: WorkflowNode): Promise<any> {
  const startTime = Date.now();
  
  const logEntry: ExecutionLogEntry = {
    timestamp: new Date().toISOString(),
    node_id: node.id,
    node_type: node.type,
    status: 'started',
    input: execution.variables
  };
  
  execution.execution_log.push(logEntry);
  execution.current_node = node.id;
  executions.set(execution.id, execution);

  try {
    let result: any;

    switch (node.type) {
      case 'trigger':
        result = await executeTriggerNode(node, execution.variables);
        break;
        
      case 'action':
        result = await executeActionNode(node, execution.variables);
        break;
        
      case 'condition':
        result = await executeConditionNode(node, execution.variables);
        break;
        
      case 'delay':
        result = await executeDelayNode(node, execution.variables);
        break;
        
      case 'transform':
        result = await executeTransformNode(node, execution.variables);
        break;
        
      case 'split':
        result = await executeSplitNode(node, execution.variables);
        break;
        
      case 'merge':
        result = await executeMergeNode(node, execution.variables);
        break;
        
      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }

    // Update variables with result
    if (result && typeof result === 'object') {
      Object.assign(execution.variables, result);
    }

    logEntry.status = 'completed';
    logEntry.output = result;
    logEntry.duration_ms = Date.now() - startTime;

    // Execute connected nodes
    const connectedNodes = getConnectedNodes(workflow, node);
    for (const connectedNode of connectedNodes) {
      await executeNode(workflow, execution, connectedNode);
    }

    return result;

  } catch (error: any) {
    logEntry.status = 'failed';
    logEntry.error = error.message;
    logEntry.duration_ms = Date.now() - startTime;
    
    throw error;
  }
}

// Execute trigger node
async function executeTriggerNode(node: WorkflowNode, variables: any): Promise<any> {
  // Trigger nodes typically just pass through data
  console.log(`Executing trigger: ${node.provider}:${node.operation}`);
  return { triggered_at: new Date().toISOString() };
}

// Execute action node
async function executeActionNode(node: WorkflowNode, variables: any): Promise<any> {
  const { provider, operation, config } = node;
  
  console.log(`Executing action: ${provider}:${operation}`);
  
  // Replace variables in config
  const processedConfig = replaceVariables(config, variables);
  
  // Make API call to the integration
  const integrationResponse = await fetch(`/api/integrations/${provider}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: operation,
      data: processedConfig
    })
  });
  
  if (!integrationResponse.ok) {
    throw new Error(`Integration call failed: ${integrationResponse.status}`);
  }
  
  const result = await integrationResponse.json();
  
  if (!result.success) {
    throw new Error(`Integration error: ${result.error}`);
  }
  
  return result.result;
}

// Execute condition node
async function executeConditionNode(node: WorkflowNode, variables: any): Promise<any> {
  const { config } = node;
  const { condition, true_path, false_path } = config;
  
  console.log(`Executing condition: ${condition}`);
  
  // Simple condition evaluation (extend for complex expressions)
  const result = evaluateCondition(condition, variables);
  
  return {
    condition_result: result,
    next_path: result ? true_path : false_path
  };
}

// Execute delay node
async function executeDelayNode(node: WorkflowNode, variables: any): Promise<any> {
  const { config } = node;
  const delayMs = config.delay_ms || 1000;
  
  console.log(`Executing delay: ${delayMs}ms`);
  
  await new Promise(resolve => setTimeout(resolve, delayMs));
  
  return { delayed_for: delayMs };
}

// Execute transform node
async function executeTransformNode(node: WorkflowNode, variables: any): Promise<any> {
  const { config } = node;
  const { transformations } = config;
  
  console.log(`Executing transform: ${transformations.length} transformations`);
  
  const result: any = {};
  
  for (const transform of transformations) {
    const { source, target, operation } = transform;
    
    switch (operation) {
      case 'copy':
        result[target] = variables[source];
        break;
        
      case 'uppercase':
        result[target] = variables[source]?.toString().toUpperCase();
        break;
        
      case 'lowercase':
        result[target] = variables[source]?.toString().toLowerCase();
        break;
        
      case 'format_date':
        result[target] = new Date(variables[source]).toISOString();
        break;
        
      case 'json_parse':
        result[target] = JSON.parse(variables[source]);
        break;
        
      case 'json_stringify':
        result[target] = JSON.stringify(variables[source]);
        break;
        
      default:
        result[target] = variables[source];
    }
  }
  
  return result;
}

// Execute split node
async function executeSplitNode(node: WorkflowNode, variables: any): Promise<any> {
  const { config } = node;
  const { split_field, split_type } = config;
  
  console.log(`Executing split: ${split_field} (${split_type})`);
  
  const value = variables[split_field];
  
  if (split_type === 'array' && Array.isArray(value)) {
    return { split_items: value, item_count: value.length };
  }
  
  if (split_type === 'string' && typeof value === 'string') {
    const items = value.split(config.delimiter || ',');
    return { split_items: items, item_count: items.length };
  }
  
  return { split_items: [value], item_count: 1 };
}

// Execute merge node
async function executeMergeNode(node: WorkflowNode, variables: any): Promise<any> {
  const { config } = node;
  const { merge_fields, merge_type } = config;
  
  console.log(`Executing merge: ${merge_fields.join(', ')} (${merge_type})`);
  
  if (merge_type === 'concat') {
    const merged = merge_fields.map((field: string) => variables[field] || '').join('');
    return { merged_value: merged };
  }
  
  if (merge_type === 'array') {
    const merged = merge_fields.map((field: string) => variables[field]);
    return { merged_array: merged };
  }
  
  if (merge_type === 'object') {
    const merged: any = {};
    for (const field of merge_fields) {
      merged[field] = variables[field];
    }
    return { merged_object: merged };
  }
  
  return { merged_value: variables[merge_fields[0]] };
}

// Get connected nodes
function getConnectedNodes(workflow: Workflow, node: WorkflowNode): WorkflowNode[] {
  const connectedIds = node.connections || [];
  return workflow.nodes.filter(n => connectedIds.includes(n.id));
}

// Replace variables in config
function replaceVariables(config: any, variables: any): any {
  if (typeof config === 'string') {
    return config.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      return variables[key.trim()] || match;
    });
  }
  
  if (Array.isArray(config)) {
    return config.map(item => replaceVariables(item, variables));
  }
  
  if (typeof config === 'object' && config !== null) {
    const result: any = {};
    for (const [key, value] of Object.entries(config)) {
      result[key] = replaceVariables(value, variables);
    }
    return result;
  }
  
  return config;
}

// Evaluate simple conditions
function evaluateCondition(condition: string, variables: any): boolean {
  try {
    // Simple condition parsing (extend for complex expressions)
    const conditionRegex = /(\w+)\s*(==|!=|>|<|>=|<=)\s*(.+)/;
    const match = condition.match(conditionRegex);
    
    if (!match) return false;
    
    const [, left, operator, right] = match;
    const leftValue = variables[left];
    const rightValue = isNaN(right as any) ? right.replace(/['"]/g, '') : parseFloat(right);
    
    switch (operator) {
      case '==': return leftValue == rightValue;
      case '!=': return leftValue != rightValue;
      case '>': return leftValue > rightValue;
      case '<': return leftValue < rightValue;
      case '>=': return leftValue >= rightValue;
      case '<=': return leftValue <= rightValue;
      default: return false;
    }
  } catch (error) {
    return false;
  }
}

// Pause workflow
async function pauseWorkflow(workflowId: string) {
  const workflow = workflows.get(workflowId);
  if (!workflow) {
    throw new Error('Workflow not found');
  }

  workflow.status = 'paused';
  workflow.updated_at = new Date().toISOString();
  workflows.set(workflowId, workflow);

  return { paused: true, workflow_id: workflowId };
}

// Resume workflow
async function resumeWorkflow(workflowId: string) {
  const workflow = workflows.get(workflowId);
  if (!workflow) {
    throw new Error('Workflow not found');
  }

  workflow.status = 'active';
  workflow.updated_at = new Date().toISOString();
  workflows.set(workflowId, workflow);

  return { resumed: true, workflow_id: workflowId };
}

// Get execution by ID
async function getExecution(executionId: string): Promise<WorkflowExecution> {
  const execution = executions.get(executionId);
  if (!execution) {
    throw new Error('Execution not found');
  }
  return execution;
}

// List executions
async function listExecutions(workflowId?: string, params: any = {}) {
  const allExecutions = Array.from(executions.values());
  
  let filtered = workflowId 
    ? allExecutions.filter(e => e.workflow_id === workflowId)
    : allExecutions;
  
  if (params.status) {
    filtered = filtered.filter(e => e.status === params.status);
  }

  // Sort by start time (newest first)
  filtered.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  const limit = params.limit || 10;
  const offset = params.offset || 0;
  
  return {
    executions: filtered.slice(offset, offset + limit),
    total: filtered.length,
    has_more: offset + limit < filtered.length
  };
}

// Cancel execution
async function cancelExecution(executionId: string) {
  const execution = executions.get(executionId);
  if (!execution) {
    throw new Error('Execution not found');
  }

  if (execution.status !== 'running') {
    throw new Error('Execution is not running');
  }

  execution.status = 'failed';
  execution.error = 'Cancelled by user';
  execution.completed_at = new Date().toISOString();
  executions.set(executionId, execution);

  return { cancelled: true, execution_id: executionId };
}

// Get workflow templates
async function getWorkflowTemplates() {
  return {
    templates: [
      {
        id: 'email-to-slack',
        name: 'Email to Slack Notification',
        description: 'Forward important emails to Slack channels',
        category: 'communication',
        nodes: [
          {
            id: 'trigger-1',
            type: 'trigger',
            provider: 'gmail',
            operation: 'new_email',
            config: { label: 'INBOX' },
            position: { x: 100, y: 100 },
            connections: ['condition-1']
          },
          {
            id: 'condition-1',
            type: 'condition',
            provider: 'workflow',
            operation: 'evaluate',
            config: { condition: 'importance == "high"' },
            position: { x: 300, y: 100 },
            connections: ['action-1']
          },
          {
            id: 'action-1',
            type: 'action',
            provider: 'slack',
            operation: 'send_message',
            config: {
              channel: '#alerts',
              text: 'New important email: {{subject}}'
            },
            position: { x: 500, y: 100 },
            connections: []
          }
        ]
      },
      {
        id: 'stripe-to-crm',
        name: 'Stripe Payment to CRM',
        description: 'Add new customers to CRM when payment succeeds',
        category: 'sales',
        nodes: [
          {
            id: 'trigger-1',
            type: 'trigger',
            provider: 'stripe',
            operation: 'payment_succeeded',
            config: {},
            position: { x: 100, y: 100 },
            connections: ['action-1']
          },
          {
            id: 'action-1',
            type: 'action',
            provider: 'hubspot',
            operation: 'create_contact',
            config: {
              email: '{{customer_email}}',
              name: '{{customer_name}}',
              lifecycle_stage: 'customer'
            },
            position: { x: 300, y: 100 },
            connections: []
          }
        ]
      }
    ]
  };
}

// Validate workflow
async function validateWorkflow(workflow: Workflow) {
  const issues: string[] = [];
  
  // Check for trigger nodes
  const triggerNodes = workflow.nodes.filter(node => node.type === 'trigger');
  if (triggerNodes.length === 0) {
    issues.push('Workflow must have at least one trigger node');
  }
  
  // Check for orphaned nodes
  const connectedNodeIds = new Set<string>();
  workflow.edges.forEach(edge => {
    connectedNodeIds.add(edge.source);
    connectedNodeIds.add(edge.target);
  });
  
  const orphanedNodes = workflow.nodes.filter(node => 
    node.type !== 'trigger' && !connectedNodeIds.has(node.id)
  );
  
  if (orphanedNodes.length > 0) {
    issues.push(`Found ${orphanedNodes.length} orphaned nodes`);
  }
  
  // Check for cycles
  const hasCycles = detectCycles(workflow);
  if (hasCycles) {
    issues.push('Workflow contains cycles');
  }
  
  return {
    valid: issues.length === 0,
    issues,
    node_count: workflow.nodes.length,
    edge_count: workflow.edges.length
  };
}

// Detect cycles in workflow
function detectCycles(workflow: Workflow): boolean {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  
  const hasCycle = (nodeId: string): boolean => {
    if (recursionStack.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    
    visited.add(nodeId);
    recursionStack.add(nodeId);
    
    const node = workflow.nodes.find(n => n.id === nodeId);
    if (node) {
      for (const connectedId of node.connections || []) {
        if (hasCycle(connectedId)) return true;
      }
    }
    
    recursionStack.delete(nodeId);
    return false;
  };
  
  for (const node of workflow.nodes) {
    if (!visited.has(node.id)) {
      if (hasCycle(node.id)) return true;
    }
  }
  
  return false;
}

export async function GET() {
  return NextResponse.json({
    service: 'Workflow Engine',
    status: 'operational',
    features: [
      'Visual Workflow Builder',
      'Drag-and-Drop Interface',
      'Real-time Execution',
      'Conditional Logic',
      'Data Transformation',
      'Error Handling',
      'Workflow Templates',
      'Execution Monitoring'
    ],
    node_types: [
      'trigger',
      'action', 
      'condition',
      'delay',
      'transform',
      'split',
      'merge'
    ],
    supported_providers: [
      'stripe',
      'auth0',
      'sendgrid',
      'twilio',
      'google',
      'microsoft',
      'github',
      'slack',
      'discord'
    ],
    endpoints: {
      workflows: ['create', 'update', 'delete', 'get', 'list'],
      executions: ['execute', 'get', 'list', 'cancel'],
      management: ['pause', 'resume', 'validate'],
      templates: ['get_templates']
    },
    statistics: {
      total_workflows: workflows.size,
      active_workflows: Array.from(workflows.values()).filter(w => w.status === 'active').length,
      total_executions: executions.size,
      running_executions: Array.from(executions.values()).filter(e => e.status === 'running').length
    }
  });
}