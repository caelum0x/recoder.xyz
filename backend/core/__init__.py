"""
Core module for the agentpress backend.

Domain logic for agents, threads, and related functionality.
All routers are aggregated in api.py.

Database access: Use SQLAlchemy helpers from `core.services.db`:
    from core.services.db import init_db, execute_one, execute_all
    await init_db()
"""
