-- Showcase Playlists
CREATE TABLE IF NOT EXISTS "showcase_playlists" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"id" text NOT NULL UNIQUE,
	"team_db_id" integer NOT NULL REFERENCES "teams"("db_id") ON DELETE cascade,
	"creator_user_db_id" integer NOT NULL REFERENCES "users"("db_id") ON DELETE cascade,
	"title" text NOT NULL,
	"description" text NOT NULL DEFAULT '',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "showcase_playlists_team_db_id_idx" ON "showcase_playlists" ("team_db_id");
CREATE INDEX IF NOT EXISTS "showcase_playlists_creator_user_db_id_idx" ON "showcase_playlists" ("creator_user_db_id");

-- Showcase Playlist Apps (junction table)
CREATE TABLE IF NOT EXISTS "showcase_playlist_apps" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"playlist_db_id" integer NOT NULL REFERENCES "showcase_playlists"("db_id") ON DELETE cascade,
	"flow_trigger_db_id" integer NOT NULL REFERENCES "flow_triggers"("db_id") ON DELETE cascade,
	"sort_order" integer NOT NULL DEFAULT 0,
	"added_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "showcase_playlist_apps_playlist_db_id_idx" ON "showcase_playlist_apps" ("playlist_db_id");
CREATE UNIQUE INDEX IF NOT EXISTS "showcase_playlist_apps_playlist_trigger_uidx" ON "showcase_playlist_apps" ("playlist_db_id", "flow_trigger_db_id");
