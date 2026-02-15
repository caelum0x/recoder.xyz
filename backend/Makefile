.PHONY: verify check lint test-imports lint-fix check-dbconnection check-supabase-imports

verify:
	@echo "Running build verification..."
	@uv run python core/utils/scripts/verify_build.py

check: verify check-dbconnection check-supabase-imports

check-dbconnection:
	@echo "Checking for forbidden DBConnection usage..."
	@uv run python core/utils/scripts/check_no_dbconnection_usage.py

check-supabase-imports:
	@echo "Checking for forbidden Supabase imports..."
	@uv run python core/utils/scripts/check_no_supabase_imports.py

lint:
	@echo "Running ruff linter..."
	@uv run ruff check core/

lint-fix:
	@echo "Running ruff linter with auto-fix..."
	@uv run ruff check --fix core/

test-imports:
	@echo "Testing critical imports..."
	@uv run python core/utils/scripts/check_imports.py
