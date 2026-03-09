# Workflows

Workflows connect multiple agents, tools, and logic nodes into automated pipelines. They are defined as directed graphs of nodes and edges.

## Creating a Workflow

**Python:**

```python
workflow = client.workflows.create(
    agent_id="agent_abc123",
    name="PR Review Pipeline",
    description="Lint, review, and summarise pull requests",
)
print(f"Workflow {workflow.id} created (status={workflow.status})")
```

**TypeScript:**

```typescript
const workflow = await sdk.workflows.create({
  agentId: "agent_abc123",
  name: "PR Review Pipeline",
  description: "Lint, review, and summarise pull requests",
});
console.log(`Workflow ${workflow.id} created (status=${workflow.status})`);
```

## Adding Nodes

Each node has a type, label, optional config, and a canvas position.

**Python:**

```python
input_node = client.workflows.add_node(
    workflow_id=workflow.id,
    node_type="input",
    label="PR Diff Input",
    config={"source": "github_webhook"},
    position_x=100,
    position_y=100,
)

agent_node = client.workflows.add_node(
    workflow_id=workflow.id,
    node_type="agent",
    label="Code Reviewer",
    config={"agent_id": "agent_abc123", "model": "claude-sonnet-4-20250514"},
    position_x=400,
    position_y=100,
)
```

**TypeScript:**

```typescript
const inputNode = await sdk.workflows.addNode({
  workflowId: workflow.id,
  nodeType: "input",
  label: "PR Diff Input",
  config: { source: "github_webhook" },
  positionX: 100,
  positionY: 100,
});

const agentNode = await sdk.workflows.addNode({
  workflowId: workflow.id,
  nodeType: "agent",
  label: "Code Reviewer",
  config: { agent_id: "agent_abc123", model: "claude-sonnet-4-20250514" },
  positionX: 400,
  positionY: 100,
});
```

## Node Types Reference

| Type        | Description                                                  |
| ----------- | ------------------------------------------------------------ |
| `input`     | Entry point that receives data from a trigger or manual run  |
| `output`    | Terminal node that emits the final result                     |
| `agent`     | Runs an agent with a prompt built from upstream data         |
| `tool`      | Calls a single tool (web search, file read, API call, etc.)  |
| `condition` | Branches execution based on a boolean expression             |
| `loop`      | Iterates over a collection, running child nodes per item     |
| `parallel`  | Fans out to multiple branches and waits for all to complete  |
| `delay`     | Pauses execution for a configured duration                   |
| `approval`  | Halts execution until a human approves or rejects            |

## Adding Edges

Edges connect a source node to a target node. Optional conditions control branching.

**Python:**

```python
edge = client.workflows.add_edge(
    workflow_id=workflow.id,
    source_node_id=input_node.id,
    target_node_id=agent_node.id,
)
```

**TypeScript:**

```typescript
const edge = await sdk.workflows.addEdge({
  workflowId: workflow.id,
  sourceNodeId: inputNode.id,
  targetNodeId: agentNode.id,
});
```

### Conditional Edges

```python
client.workflows.add_edge(
    workflow_id=workflow.id,
    source_node_id=condition_node.id,
    target_node_id=approve_node.id,
    condition={"field": "severity", "operator": "gte", "value": 3},
)
```

## Executing a Workflow

**Python:**

```python
execution = client.workflows.execute(
    workflow_id=workflow.id,
    trigger_data={"pr_url": "https://github.com/org/repo/pull/42"},
)
print(f"Execution {execution.id}  status={execution.status}")
```

**TypeScript:**

```typescript
const execution = await sdk.workflows.execute({
  workflowId: workflow.id,
  triggerData: { pr_url: "https://github.com/org/repo/pull/42" },
});
console.log(`Execution ${execution.id}  status=${execution.status}`);
```

### Execution Statuses

`pending` -> `running` -> `completed` | `failed` | `cancelled`

Workflows may also enter `paused` status when an approval gate is reached.

## Monitoring Executions

**Python:**

```python
executions = client.workflows.list_executions(workflow_id=workflow.id)
for ex in executions:
    print(f"{ex.id}  {ex.status}  cost=${ex.total_cost or 0:.4f}")

# Get a single execution
detail = client.workflows.get_execution(execution_id="exec_001")
```

**TypeScript:**

```typescript
const executions = await sdk.workflows.listExecutions({ workflowId: workflow.id });
executions.forEach((ex) => console.log(ex.id, ex.status, ex.total_cost));

const detail = await sdk.workflows.getExecution({ executionId: "exec_001" });
```

## Approval Gates

When execution reaches an `approval` node it pauses and creates a gate.

**Python:**

```python
# List pending approvals
gates = client.workflows.pending_approvals()
for gate in gates:
    print(f"{gate.id}  workflow={gate.workflow_name}  node={gate.node_label}")

# Approve
client.workflows.approve(gate_id=gates[0].id)

# Reject
client.workflows.reject(gate_id=gates[1].id)
```

**TypeScript:**

```typescript
const gates = await sdk.workflows.pendingApprovals();
gates.forEach((g) => console.log(g.id, g.workflow_name, g.node_label));

await sdk.workflows.approve({ gateId: gates[0].id });
await sdk.workflows.reject({ gateId: gates[1].id });
```

## Deleting Nodes, Edges, and Workflows

**Python:**

```python
client.workflows.delete_node(node_id="node_xyz")
client.workflows.delete_edge(edge_id="edge_xyz")
client.workflows.delete(workflow_id=workflow.id)
```

**TypeScript:**

```typescript
await sdk.workflows.deleteNode({ nodeId: "node_xyz" });
await sdk.workflows.deleteEdge({ edgeId: "edge_xyz" });
await sdk.workflows.delete({ workflowId: workflow.id });
```

## Next Steps

- [Triggers](./triggers.md) — automate workflow execution
- [Streaming](./streaming.md) — stream execution output in real time
