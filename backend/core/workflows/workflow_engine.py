import time
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class ExecutionContext:
    execution_id: str = ""
    trigger_data: dict = field(default_factory=dict)
    node_outputs: dict[str, dict] = field(default_factory=dict)


class NodeExecutor(ABC):
    @abstractmethod
    async def execute_node(
        self, node_type: str, config: dict, input_data: dict, ctx: ExecutionContext
    ) -> dict:
        ...


class WorkflowEngine:
    def __init__(self, executor: NodeExecutor):
        self.executor = executor

    async def execute(
        self,
        nodes: list[dict],
        edges: list[dict],
        trigger_data: dict,
        execution_id: str = "",
    ) -> dict:
        ctx = ExecutionContext(execution_id=execution_id, trigger_data=trigger_data)
        node_map = {n["id"]: n for n in nodes}
        adjacency: dict[str, list[dict]] = {n["id"]: [] for n in nodes}
        in_degree: dict[str, int] = {n["id"]: 0 for n in nodes}

        for edge in edges:
            adjacency[edge["source_node_id"]].append(edge)
            in_degree[edge["target_node_id"]] = (
                in_degree.get(edge["target_node_id"], 0) + 1
            )

        ready = [nid for nid, deg in in_degree.items() if deg == 0]
        results: list[dict] = []
        executed: set[str] = set()
        status = "completed"

        while ready:
            node_id = ready.pop(0)
            if node_id in executed:
                continue
            executed.add(node_id)

            node = node_map[node_id]
            input_data = dict(ctx.trigger_data)
            # Merge outputs from upstream nodes into input_data
            for edge in edges:
                if (
                    edge["target_node_id"] == node_id
                    and edge["source_node_id"] in ctx.node_outputs
                ):
                    input_data.update(ctx.node_outputs[edge["source_node_id"]])

            start = time.monotonic()
            try:
                output = await self.executor.execute_node(
                    node["node_type"],
                    node.get("config", {}),
                    input_data,
                    ctx,
                )
                duration_ms = int((time.monotonic() - start) * 1000)
                ctx.node_outputs[node_id] = output
                results.append(
                    {
                        "node_id": node_id,
                        "status": "completed",
                        "output": output,
                        "error": None,
                        "duration_ms": duration_ms,
                    }
                )
            except Exception as e:
                duration_ms = int((time.monotonic() - start) * 1000)
                logger.error(f"Node {node_id} failed: {e}")
                results.append(
                    {
                        "node_id": node_id,
                        "status": "failed",
                        "output": {},
                        "error": str(e),
                        "duration_ms": duration_ms,
                    }
                )
                status = "failed"
                break

            # Propagate to downstream nodes, respecting conditions
            for edge in adjacency.get(node_id, []):
                target = edge["target_node_id"]
                condition = edge.get("condition")
                if condition:
                    match = all(output.get(k) == v for k, v in condition.items())
                    if not match:
                        continue
                in_degree[target] -= 1
                if in_degree[target] <= 0 and target not in executed:
                    ready.append(target)

        return {"status": status, "node_results": results}
