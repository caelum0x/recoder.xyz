# Development Scripts

Utility scripts for development, testing, and verification.

Located in `core/utils/scripts/` to keep them organized within the core module structure.

## Scripts

### `verify_build.py`
Comprehensive build verification script that checks:
- All critical imports work
- Python syntax is valid
- No undefined names (via ruff)
- API module can be imported
- Worker module can be imported
- Old import paths are not used

**Usage:**
```bash
uv run python core/utils/scripts/verify_build.py
# or via Makefile:
make verify
```

### `check_imports.py`
Quick check of critical imports to verify they resolve correctly.

**Usage:**
```bash
uv run python core/utils/scripts/check_imports.py
# or via Makefile:
make test-imports
```

### `check_no_dbconnection_usage.py`
Guard that fails if `DBConnection` is imported/constructed outside the compatibility layer.

**Usage:**
```bash
uv run python core/utils/scripts/check_no_dbconnection_usage.py
# or via Makefile:
make check-dbconnection
```

### `check_no_supabase_imports.py`
Guard that fails if runtime backend code introduces raw `supabase` imports.

**Usage:**
```bash
uv run python core/utils/scripts/check_no_supabase_imports.py
# or via Makefile:
make check-supabase-imports
```

### `lint_imports.py`
Lint imports using ruff and direct import testing.

**Usage:**
```bash
uv run python core/utils/scripts/lint_imports.py
```

## Running via Makefile

All scripts can be run via the Makefile from the backend root:

```bash
make verify        # Full build verification
make test-imports  # Quick import check
make check-dbconnection  # Enforce DBConnection allowlist
make check-supabase-imports  # Enforce no runtime raw supabase imports
make lint          # Run ruff linter
make lint-fix      # Run ruff with auto-fix
```
