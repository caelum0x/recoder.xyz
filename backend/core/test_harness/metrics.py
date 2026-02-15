"""
Metrics Collection and Storage for E2E Benchmark Testing

Handles:
- Creating benchmark run records
- Recording individual prompt results
- Calculating aggregated statistics
- Finalizing runs with summary data
"""

import uuid
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict
from core.services.db import Table
from core.utils.logger import logger


@dataclass
class BenchmarkResult:
    """Result of a single test prompt execution"""
    prompt_id: str
    prompt_text: str
    thread_id: Optional[str]
    agent_run_id: Optional[str]
    started_at: datetime
    completed_at: Optional[datetime]
    cold_start_time_ms: Optional[int]
    total_duration_ms: Optional[int]
    tool_calls_count: int
    tool_calls: List[Dict[str, Any]]
    tool_call_breakdown: Dict[str, int]  # Count of each tool called
    expected_tools_present: bool  # Were all expected tools called?
    missing_tools: List[str]  # List of expected tools that weren't called
    avg_tool_call_time_ms: Optional[float]
    slowest_tool_call: Optional[Dict[str, Any]]
    stream_chunk_count: int
    avg_chunk_interval_ms: Optional[float]
    status: str  # 'completed', 'failed', 'timeout', 'error'
    error_message: Optional[str]
    metadata: Dict[str, Any]


class MetricsCollector:
    """Collects and stores benchmark metrics in the database"""

    def __init__(self):
        self._runs_table = Table("benchmark_runs").json_columns("metadata")
        self._results_table = Table("benchmark_results").json_columns(
            "tool_calls", "tool_call_breakdown", "missing_tools",
            "slowest_tool_call", "metadata"
        )

    async def start_run(
        self,
        run_type: str,
        model_name: str,
        concurrency_level: int,
        total_prompts: int,
        metadata: Optional[Dict[str, Any]] = None,
        created_by: Optional[str] = None
    ) -> str:
        """
        Create a new benchmark run record

        Args:
            run_type: 'core_test' or 'stress_test'
            model_name: Model being tested (e.g., 'recoder/basic')
            concurrency_level: Number of concurrent requests
            total_prompts: Total number of prompts to execute
            metadata: Additional metadata (git commit, branch, etc.)
            created_by: User ID who initiated the test

        Returns:
            run_id: UUID of the created benchmark run
        """
        run_id = str(uuid.uuid4())

        record = {
            'id': run_id,
            'run_type': run_type,
            'model_name': model_name,
            'concurrency_level': concurrency_level,
            'total_prompts': total_prompts,
            'started_at': datetime.now(timezone.utc).isoformat(),
            'status': 'running',
            'metadata': metadata or {},
        }

        if created_by:
            record['created_by'] = created_by

        result = await self._runs_table.insert(record)

        if not result:
            raise Exception("Failed to create benchmark run record")

        logger.info(f"Created benchmark run: {run_id} (type: {run_type}, model: {model_name}, concurrency: {concurrency_level})")

        return run_id

    async def record_prompt_result(
        self,
        run_id: str,
        result: BenchmarkResult
    ):
        """
        Record the result of a single prompt execution

        Args:
            run_id: UUID of the benchmark run
            result: BenchmarkResult object with metrics
        """
        record = {
            'id': str(uuid.uuid4()),
            'run_id': run_id,
            'prompt_id': result.prompt_id,
            'prompt_text': result.prompt_text,
            'thread_id': result.thread_id,
            'agent_run_id': result.agent_run_id,
            'started_at': result.started_at.isoformat(),
            'completed_at': result.completed_at.isoformat() if result.completed_at else None,
            'cold_start_time_ms': result.cold_start_time_ms,
            'total_duration_ms': result.total_duration_ms,
            'tool_calls_count': result.tool_calls_count,
            'tool_calls': result.tool_calls,
            'tool_call_breakdown': result.tool_call_breakdown,
            'expected_tools_present': result.expected_tools_present,
            'missing_tools': result.missing_tools,
            'avg_tool_call_time_ms': result.avg_tool_call_time_ms,
            'slowest_tool_call': result.slowest_tool_call,
            'stream_chunk_count': result.stream_chunk_count,
            'avg_chunk_interval_ms': result.avg_chunk_interval_ms,
            'status': result.status,
            'error_message': result.error_message,
            'metadata': result.metadata,
        }

        await self._results_table.insert(record)

        logger.debug(f"Recorded result for prompt {result.prompt_id} in run {run_id}: {result.status}")

    async def finalize_run(
        self,
        run_id: str,
        status: str = 'completed'
    ):
        """
        Finalize a benchmark run and calculate summary statistics

        Args:
            run_id: UUID of the benchmark run
            status: Final status ('completed', 'failed', 'cancelled')
        """
        # Get run start time
        run_row = await self._runs_table.get("id", run_id, cols="started_at")

        if not run_row:
            raise Exception(f"Benchmark run {run_id} not found")

        started_at = datetime.fromisoformat(str(run_row['started_at']).replace('Z', '+00:00'))
        completed_at = datetime.now(timezone.utc)
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)

        # Update run record
        await self._runs_table.update("id", run_id, {
            'completed_at': completed_at.isoformat(),
            'duration_ms': duration_ms,
            'status': status,
        })

        logger.info(f"Finalized benchmark run {run_id}: {status} (duration: {duration_ms}ms)")

    async def get_run_summary(self, run_id: str) -> Dict[str, Any]:
        """
        Get summary statistics for a benchmark run

        Args:
            run_id: UUID of the benchmark run

        Returns:
            Dictionary with run metadata and aggregated statistics
        """
        # Get run metadata
        run_data = await self._runs_table.get("id", run_id)

        if not run_data:
            raise Exception(f"Benchmark run {run_id} not found")

        # Get all results for this run
        results_data = await self._results_table.list(
            filters={"run_id": run_id},
            limit=1000
        )

        if not results_data:
            return {
                'run_id': run_id,
                'status': run_data['status'],
                'run_type': run_data['run_type'],
                'model_name': run_data['model_name'],
                'concurrency_level': run_data['concurrency_level'],
                'total_prompts': run_data['total_prompts'],
                'started_at': run_data['started_at'],
                'completed_at': run_data.get('completed_at'),
                'duration_ms': run_data.get('duration_ms'),
                'metadata': run_data.get('metadata', {}),
                'summary': {
                    'total_prompts': 0,
                    'successful': 0,
                    'failed': 0,
                },
                'results': []
            }

        # Calculate aggregate statistics
        completed_results = [r for r in results_data if r['status'] == 'completed']
        failed_results = [r for r in results_data if r['status'] in ['failed', 'timeout', 'error']]

        total_prompts = len(results_data)
        successful = len(completed_results)
        failed = len(failed_results)

        # Calculate averages from completed results
        avg_duration_ms = None
        avg_cold_start_ms = None
        avg_tool_call_time_ms = None
        total_tool_calls = 0
        tool_call_breakdown = {}
        slowest_tool_calls = []
        slowest_prompt = None

        if completed_results:
            durations = [r['total_duration_ms'] for r in completed_results if r.get('total_duration_ms')]
            cold_starts = [r['cold_start_time_ms'] for r in completed_results if r.get('cold_start_time_ms')]
            tool_call_times = [r['avg_tool_call_time_ms'] for r in completed_results if r.get('avg_tool_call_time_ms')]

            if durations:
                avg_duration_ms = int(sum(durations) / len(durations))
                slowest_result = max(completed_results, key=lambda r: r.get('total_duration_ms', 0))
                slowest_prompt = {
                    'id': slowest_result['prompt_id'],
                    'duration_ms': slowest_result['total_duration_ms']
                }

            if cold_starts:
                avg_cold_start_ms = int(sum(cold_starts) / len(cold_starts))

            if tool_call_times:
                avg_tool_call_time_ms = sum(tool_call_times) / len(tool_call_times)

            # Count tool usage
            for result in completed_results:
                total_tool_calls += result.get('tool_calls_count', 0)

                # Breakdown by tool name
                for tool_call in result.get('tool_calls', []):
                    tool_name = tool_call.get('tool_name', 'unknown')
                    tool_call_breakdown[tool_name] = tool_call_breakdown.get(tool_name, 0) + 1

                # Track slowest tool calls
                slowest = result.get('slowest_tool_call')
                if slowest:
                    slowest_tool_calls.append(slowest)

            # Get top 5 slowest tool calls
            slowest_tool_calls.sort(key=lambda x: x.get('duration_ms', 0), reverse=True)
            slowest_tool_calls = slowest_tool_calls[:5]

        summary = {
            'run_id': run_id,
            'status': run_data['status'],
            'run_type': run_data['run_type'],
            'model_name': run_data['model_name'],
            'concurrency_level': run_data['concurrency_level'],
            'total_prompts': run_data['total_prompts'],
            'started_at': run_data['started_at'],
            'completed_at': run_data.get('completed_at'),
            'duration_ms': run_data.get('duration_ms'),
            'metadata': run_data.get('metadata', {}),
            'summary': {
                'total_prompts': total_prompts,
                'successful': successful,
                'failed': failed,
                'avg_duration_ms': avg_duration_ms,
                'avg_cold_start_ms': avg_cold_start_ms,
                'avg_tool_call_time_ms': avg_tool_call_time_ms,
                'total_tool_calls': total_tool_calls,
                'tool_call_breakdown': tool_call_breakdown,
                'slowest_tool_calls': slowest_tool_calls,
                'slowest_prompt': slowest_prompt,
            },
            'results': [
                {
                    'prompt_id': r['prompt_id'],
                    'status': r['status'],
                    'cold_start_ms': r.get('cold_start_time_ms'),
                    'total_duration_ms': r.get('total_duration_ms'),
                    'tool_calls_count': r.get('tool_calls_count', 0),
                    'tool_call_breakdown': r.get('tool_call_breakdown', {}),
                    'tool_call_deviations': self._calculate_tool_deviations(
                        r.get('tool_call_breakdown', {}),
                        r.get('metadata', {}).get('expected_tool_calls', {})
                    ),
                    'expected_tools_present': r.get('expected_tools_present', True),
                    'missing_tools': r.get('missing_tools', []),
                    'avg_tool_call_time_ms': r.get('avg_tool_call_time_ms'),
                    'slowest_tool_call': r.get('slowest_tool_call'),
                    'error_message': r.get('error_message'),
                }
                for r in results_data
            ]
        }

        return summary

    async def list_runs(
        self,
        limit: int = 20,
        run_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        List recent benchmark runs

        Args:
            limit: Maximum number of runs to return
            run_type: Filter by run type ('core_test' or 'stress_test')

        Returns:
            List of benchmark run records
        """
        filters = {}
        if run_type:
            filters['run_type'] = run_type

        return await self._runs_table.list(
            filters=filters if filters else None,
            order_by="created_at DESC",
            limit=limit
        )
    
    def _calculate_tool_deviations(
        self,
        tool_call_breakdown: Dict[str, int],
        expected_tool_calls: Dict[str, int]
    ) -> Dict[str, Dict[str, int]]:
        """
        Calculate deviations between expected and actual tool calls
        
        Args:
            tool_call_breakdown: Actual tool call counts
            expected_tool_calls: Expected tool call counts
        
        Returns:
            Dict with deviation data per tool
        """
        deviations = {}
        for tool_name, expected_count in expected_tool_calls.items():
            actual_count = tool_call_breakdown.get(tool_name, 0)
            deviations[tool_name] = {
                "expected": expected_count,
                "actual": actual_count,
                "deviation": actual_count - expected_count
            }
        return deviations
    
    async def cancel_run(self, run_id: str):
        """
        Cancel a running benchmark test
        
        Args:
            run_id: UUID of the benchmark run
        """
        await self.finalize_run(run_id, status='cancelled')

