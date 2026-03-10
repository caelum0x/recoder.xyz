"""Tests for workflow service: data models, DAG validation, topological sort."""

import pytest
from core.workflows.workflow_service import (
    WorkflowCreate,
    NodeCreate,
    validate_dag,
    topological_sort,
)


def test_workflow_create_model():
    wf = WorkflowCreate(name="Test", agent_id="abc-123", description="A test workflow")
    assert wf.name == "Test"
    assert wf.status == "draft"


def test_node_create_model():
    node = NodeCreate(
        node_type="agent", label="Run Agent", config={"agent_id": "x", "prompt": "do thing"}
    )
    assert node.node_type == "agent"
    assert node.config["prompt"] == "do thing"


def test_validate_dag_detects_cycle():
    nodes = ["a", "b", "c"]
    edges = [("a", "b"), ("b", "c"), ("c", "a")]
    assert validate_dag(nodes, edges) is False


def test_validate_dag_accepts_valid():
    nodes = ["a", "b", "c"]
    edges = [("a", "b"), ("a", "c")]
    assert validate_dag(nodes, edges) is True


def test_topological_sort_linear():
    nodes = ["a", "b", "c"]
    edges = [("a", "b"), ("b", "c")]
    result = topological_sort(nodes, edges)
    assert result.index("a") < result.index("b") < result.index("c")


def test_topological_sort_parallel():
    nodes = ["a", "b", "c", "d"]
    edges = [("a", "b"), ("a", "c"), ("b", "d"), ("c", "d")]
    result = topological_sort(nodes, edges)
    assert result.index("a") < result.index("b")
    assert result.index("a") < result.index("c")
    assert result.index("b") < result.index("d")
    assert result.index("c") < result.index("d")
