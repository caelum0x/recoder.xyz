import pytest
import asyncio
from core.workflows.workflow_engine import WorkflowEngine, NodeExecutor, ExecutionContext

class MockNodeExecutor(NodeExecutor):
    async def execute_node(self, node_type: str, config: dict, input_data: dict, ctx: ExecutionContext) -> dict:
        if node_type == "agent":
            return {"result": f"agent ran: {config.get('prompt', '')}"}
        if node_type == "condition":
            val = input_data.get("value", 0)
            return {"branch": "true" if val > 5 else "false"}
        if node_type == "delay":
            return {"delayed": True}
        if node_type == "output":
            return input_data
        return {}

@pytest.mark.asyncio
async def test_simple_linear_workflow():
    engine = WorkflowEngine(executor=MockNodeExecutor())
    nodes = [
        {"id": "n1", "node_type": "agent", "config": {"prompt": "hello"}},
        {"id": "n2", "node_type": "output", "config": {}},
    ]
    edges = [{"source_node_id": "n1", "target_node_id": "n2"}]
    result = await engine.execute(nodes, edges, trigger_data={})
    assert result["status"] == "completed"
    assert len(result["node_results"]) == 2

@pytest.mark.asyncio
async def test_condition_branching():
    engine = WorkflowEngine(executor=MockNodeExecutor())
    nodes = [
        {"id": "n1", "node_type": "condition", "config": {}},
        {"id": "n2", "node_type": "agent", "config": {"prompt": "true path"}},
        {"id": "n3", "node_type": "agent", "config": {"prompt": "false path"}},
    ]
    edges = [
        {"source_node_id": "n1", "target_node_id": "n2", "condition": {"branch": "true"}},
        {"source_node_id": "n1", "target_node_id": "n3", "condition": {"branch": "false"}},
    ]
    result = await engine.execute(nodes, edges, trigger_data={"value": 10})
    assert result["status"] == "completed"
    executed_ids = [nr["node_id"] for nr in result["node_results"]]
    assert "n2" in executed_ids
    assert "n3" not in executed_ids

@pytest.mark.asyncio
async def test_engine_handles_node_failure():
    class FailingExecutor(NodeExecutor):
        async def execute_node(self, node_type, config, input_data, ctx):
            raise ValueError("intentional failure")

    engine = WorkflowEngine(executor=FailingExecutor())
    nodes = [{"id": "n1", "node_type": "agent", "config": {}}]
    edges = []
    result = await engine.execute(nodes, edges, trigger_data={})
    assert result["status"] == "failed"
    assert result["node_results"][0]["error"] is not None
