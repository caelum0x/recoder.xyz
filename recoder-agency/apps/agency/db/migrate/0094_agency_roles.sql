BEGIN;

UPDATE "public"."team_memberships"
SET "role" = 'member'
WHERE "role" NOT IN ('admin', 'member', 'ops', 'pm', 'client');

UPDATE "public"."invitations"
SET "role" = 'member'
WHERE "role" NOT IN ('admin', 'member', 'ops', 'pm', 'client');

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'team_memberships_role_allowed_check'
	) THEN
		ALTER TABLE "public"."team_memberships"
		ADD CONSTRAINT "team_memberships_role_allowed_check"
		CHECK ("role" IN ('admin', 'member', 'ops', 'pm', 'client'));
	END IF;
END $$;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'invitations_role_allowed_check'
	) THEN
		ALTER TABLE "public"."invitations"
		ADD CONSTRAINT "invitations_role_allowed_check"
		CHECK ("role" IN ('admin', 'member', 'ops', 'pm', 'client'));
	END IF;
END $$;

CREATE INDEX IF NOT EXISTS "team_memberships_team_role_idx"
	ON "public"."team_memberships" ("team_db_id", "role");

CREATE INDEX IF NOT EXISTS "invitations_team_role_idx"
	ON "public"."invitations" ("team_db_id", "role");

COMMIT;
