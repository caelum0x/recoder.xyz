"""Workflow service: data models, DAG validation, and topological sort."""

from dataclasses import dataclass, field


@dataclass
class WorkflowCreate:
    name: str
    agent_id: str
    description: str = ""
    status: str = "draft"
    definition: dict = field(default_factory=dict)


@dataclass
class NodeCreate:
    node_type: str
    label: str
    config: dict = field(default_factory=dict)
    position_x: float = 0
    position_y: float = 0


def validate_dag(node_ids: list[str], edges: list[tuple[str, str]]) -> bool:
    """Return True if the graph defined by node_ids and edges is a valid DAG (no cycles)."""
    adjacency: dict[str, list[str]] = {n: [] for n in node_ids}
    for src, tgt in edges:
        adjacency.setdefault(src, []).append(tgt)

    visited: set[str] = set()
    in_stack: set[str] = set()

    def dfs(node: str) -> bool:
        if node in in_stack:
            return False
        if node in visited:
            return True
        visited.add(node)
        in_stack.add(node)
        for neighbor in adjacency.get(node, []):
            if not dfs(neighbor):
                return False
        in_stack.discard(node)
        return True

    for n in node_ids:
        if n not in visited:
            if not dfs(n):
                return False
    return True


def topological_sort(node_ids: list[str], edges: list[tuple[str, str]]) -> list[str]:
    """Return a topological ordering of nodes. Assumes the graph is a valid DAG."""
    in_degree: dict[str, int] = {n: 0 for n in node_ids}
    adjacency: dict[str, list[str]] = {n: [] for n in node_ids}
    for src, tgt in edges:
        adjacency[src].append(tgt)
        in_degree[tgt] = in_degree.get(tgt, 0) + 1

    queue = [n for n in node_ids if in_degree[n] == 0]
    result: list[str] = []
    while queue:
        node = queue.pop(0)
        result.append(node)
        for neighbor in adjacency[node]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)
    return result
