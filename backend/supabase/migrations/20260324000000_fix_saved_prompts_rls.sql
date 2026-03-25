-- Fix saved_prompts: disable RLS that uses auth.uid() which doesn't work
-- in self-hosted PostgreSQL. Access control enforced at application layer
-- (WHERE user_id = :user_id in all queries).
DROP POLICY IF EXISTS "Users can manage own prompts" ON saved_prompts;
ALTER TABLE saved_prompts DISABLE ROW LEVEL SECURITY;
