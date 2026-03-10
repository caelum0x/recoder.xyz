-- Showcase Favorites (per-user, per-team)
CREATE TABLE IF NOT EXISTS "showcase_favorites" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"user_db_id" integer NOT NULL REFERENCES "users"("db_id") ON DELETE cascade,
	"team_db_id" integer NOT NULL REFERENCES "teams"("db_id") ON DELETE cascade,
	"item_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "showcase_favorites_user_team_item_uidx" ON "showcase_favorites" ("user_db_id", "team_db_id", "item_id");
CREATE INDEX IF NOT EXISTS "showcase_favorites_user_team_idx" ON "showcase_favorites" ("user_db_id", "team_db_id");
