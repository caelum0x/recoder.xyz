-- Sprint 59 Phase 4: Enhanced Agent Dependency Graph
-- Extends agent dependency tracking with new dependency types and
-- additional columns for richer graph analysis (impact, circular detection).
-- Access control enforced at application layer (WHERE user_id = :user_id)

-- Add new dependency types to existing table if the CHECK constraint allows it.
-- The existing table has types: calls, chains_to, shares_kb, shares_tools, cloned_from
-- We need to add: triggers, shares_data, requires, extends
-- Since ALTER CHECK is complex, we use a migration-safe approach:
-- drop old constraint and add new one covering all types.

DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'agent_dependencies_dependency_type_check'
  ) THEN
    ALTER TABLE agent_dependencies
      DROP CONSTRAINT agent_dependencies_dependency_type_check;
  END IF;
END $$;

ALTER TABLE agent_dependencies
  ADD CONSTRAINT agent_dependencies_dependency_type_check
  CHECK (dependency_type IN (
    'calls', 'chains_to', 'shares_kb', 'shares_tools', 'cloned_from',
    'triggers', 'shares_data', 'requires', 'extends'
  ));

-- Add is_active column if not present (for soft-delete / toggling)
ALTER TABLE agent_dependencies ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
