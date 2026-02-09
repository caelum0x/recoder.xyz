BEGIN;

CREATE OR REPLACE FUNCTION "public"."guard_project_status_update_with_audit"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.status IS DISTINCT FROM OLD.status THEN
		IF current_setting('app.allow_project_status_update', true) IS DISTINCT FROM 'on' THEN
			RAISE EXCEPTION
				'Direct projects.status update is blocked. Use audited transition flow.'
				USING ERRCODE = '42501';
		END IF;
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "projects_status_audit_guard_trg" ON "public"."projects";

CREATE TRIGGER "projects_status_audit_guard_trg"
BEFORE UPDATE OF "status" ON "public"."projects"
FOR EACH ROW
EXECUTE FUNCTION "public"."guard_project_status_update_with_audit"();

COMMIT;
