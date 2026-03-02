ALTER TABLE IF EXISTS "supabase_user_mappings"
	RENAME TO "auth_user_mappings";

ALTER TABLE IF EXISTS "auth_user_mappings"
	RENAME COLUMN "supabase_user_id" TO "auth_user_id";

ALTER TABLE IF EXISTS "auth_user_mappings"
	RENAME CONSTRAINT "supabase_user_mappings_user_db_id_unique" TO "auth_user_mappings_user_db_id_unique";

ALTER TABLE IF EXISTS "auth_user_mappings"
	RENAME CONSTRAINT "supabase_user_mappings_supabase_user_id_unique" TO "auth_user_mappings_auth_user_id_unique";

ALTER TABLE IF EXISTS "auth_user_mappings"
	RENAME CONSTRAINT "supabase_user_mappings_user_db_id_users_db_id_fk" TO "auth_user_mappings_user_db_id_users_db_id_fk";
