"""
Query utilities for handling large datasets.

Migrated from PostgREST batching to SQLAlchemy execute_read().
The batch_query_in helper still accepts a legacy `client` parameter for
backward-compatibility but ignores it — all queries go through db.py.
"""
from typing import List, Any, Dict, Optional
from core.utils.logger import logger
from core.services.db import execute_read


async def batch_query_in(
    client=None,
    table_name: str = "",
    select_fields: str = "*",
    in_field: str = "",
    in_values: List[Any] = None,
    batch_size: int = 5000,
    additional_filters: Optional[Dict[str, Any]] = None,
    schema: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Execute a query with IN filtering, automatically batching large arrays.

    With SQLAlchemy there is no URI-length limit, but we still batch to
    avoid generating huge parameter lists that could be slow to plan.

    Args:
        client: **Ignored** — kept for backward compatibility.
        table_name: Name of the table to query.
        select_fields: Columns to select (e.g. '*' or 'id, name').
        in_field: Column name for the IN filter.
        in_values: Values to filter by.
        batch_size: Max values per query (default 5000).
        additional_filters: Extra equality / gte filters.
        schema: Optional schema prefix (e.g. 'basejump').

    Returns:
        List of matching rows (dicts).
    """
    if not in_values:
        return []

    qualified_table = f"{schema}.{table_name}" if schema else table_name

    def _build_where(params: Dict[str, Any]) -> str:
        """Build additional WHERE clauses from filters dict."""
        if not additional_filters:
            return ""
        parts: List[str] = []
        for key, value in additional_filters.items():
            if key.endswith("_gte"):
                col = key[:-4]
                param_name = f"f_{col}_gte"
                parts.append(f'"{col}" >= :{param_name}')
                params[param_name] = value
            elif key.endswith("_eq"):
                col = key[:-3]
                param_name = f"f_{col}"
                parts.append(f'"{col}" = :{param_name}')
                params[param_name] = value
            else:
                param_name = f"f_{key}"
                parts.append(f'"{key}" = :{param_name}')
                params[param_name] = value
        return " AND " + " AND ".join(parts) if parts else ""

    all_results: List[Dict[str, Any]] = []

    for i in range(0, len(in_values), batch_size):
        batch = in_values[i:i + batch_size]
        params: Dict[str, Any] = {"batch_vals": batch}
        extra_where = _build_where(params)

        sql = (
            f'SELECT {select_fields} FROM {qualified_table} '
            f'WHERE "{in_field}" = ANY(:batch_vals){extra_where}'
        )

        rows = await execute_read(sql, params)
        if rows:
            all_results.extend(rows)

    if len(in_values) > batch_size:
        logger.debug(f"Batched query returned {len(all_results)} total results from {len(in_values)} {in_field} values")

    return all_results
