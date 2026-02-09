-- Workflow stability: enforce valid statuses and transition metadata integrity.
-- Also add metadata indexes for source/forced filtering at scale.

-- Normalize any stray status values defensively before constraints.
UPDATE "projects"
SET "status" = 'queued'
WHERE "status" NOT IN ('queued', 'in_progress', 'qa', 'client_review', 'done', 'blocked');

UPDATE "project_status_transitions"
SET "from_status" = 'queued'
WHERE "from_status" NOT IN ('queued', 'in_progress', 'qa', 'client_review', 'done', 'blocked');

UPDATE "project_status_transitions"
SET "to_status" = 'queued'
WHERE "to_status" NOT IN ('queued', 'in_progress', 'qa', 'client_review', 'done', 'blocked');

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'projects_status_delivery_check'
	) THEN
		ALTER TABLE "projects"
		ADD CONSTRAINT "projects_status_delivery_check"
		CHECK (
			"status" IN ('queued', 'in_progress', 'qa', 'client_review', 'done', 'blocked')
		);
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'project_status_transitions_from_status_check'
	) THEN
		ALTER TABLE "project_status_transitions"
		ADD CONSTRAINT "project_status_transitions_from_status_check"
		CHECK (
			"from_status" IN ('queued', 'in_progress', 'qa', 'client_review', 'done', 'blocked')
		);
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'project_status_transitions_to_status_check'
	) THEN
		ALTER TABLE "project_status_transitions"
		ADD CONSTRAINT "project_status_transitions_to_status_check"
		CHECK (
			"to_status" IN ('queued', 'in_progress', 'qa', 'client_review', 'done', 'blocked')
		);
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'project_status_transitions_status_change_check'
	) THEN
		ALTER TABLE "project_status_transitions"
		ADD CONSTRAINT "project_status_transitions_status_change_check"
		CHECK ("from_status" <> "to_status");
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'project_status_transitions_metadata_object_check'
	) THEN
		ALTER TABLE "project_status_transitions"
		ADD CONSTRAINT "project_status_transitions_metadata_object_check"
		CHECK (
			"metadata" IS NULL OR jsonb_typeof("metadata") = 'object'
		);
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'project_status_transitions_forced_reason_check'
	) THEN
		ALTER TABLE "project_status_transitions"
		ADD CONSTRAINT "project_status_transitions_forced_reason_check"
		CHECK (
			(
				"metadata" IS NULL
				OR ("metadata"->>'forced') IS NULL
				OR ("metadata"->>'forced') = 'false'
			)
			OR (
				("metadata"->>'forced') = 'true'
				AND "reason" IS NOT NULL
				AND btrim("reason") <> ''
			)
		);
	END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "project_status_transitions_source_idx"
ON "project_status_transitions" (("metadata"->>'source'));

CREATE INDEX IF NOT EXISTS "project_status_transitions_forced_bool_idx"
ON "project_status_transitions" (
	(
		CASE
			WHEN "metadata" IS NULL THEN false
			WHEN ("metadata"->>'forced') = 'true' THEN true
			ELSE false
		END
	)
);

CREATE INDEX IF NOT EXISTS "project_status_transitions_source_forced_created_at_idx"
ON "project_status_transitions" (
	("metadata"->>'source'),
	(
		CASE
			WHEN "metadata" IS NULL THEN false
			WHEN ("metadata"->>'forced') = 'true' THEN true
			ELSE false
		END
	),
	"created_at" DESC
);
