-- Client Portal Invitations Table
CREATE TABLE IF NOT EXISTS "client_invitations" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL UNIQUE,
	"client_db_id" integer NOT NULL,
	"team_db_id" integer NOT NULL,
	"email" text NOT NULL,
	"inviter_user_db_id" integer NOT NULL,
	"expired_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- Add foreign key constraints
ALTER TABLE "client_invitations" ADD CONSTRAINT "client_invitations_client_db_id_clients_db_id_fk" FOREIGN KEY ("client_db_id") REFERENCES "public"."clients"("db_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "client_invitations" ADD CONSTRAINT "client_invitations_team_db_id_teams_db_id_fk" FOREIGN KEY ("team_db_id") REFERENCES "public"."teams"("db_id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "client_invitations" ADD CONSTRAINT "client_invitations_inviter_user_db_id_users_db_id_fk" FOREIGN KEY ("inviter_user_db_id") REFERENCES "public"."users"("db_id") ON DELETE cascade ON UPDATE no action;

-- Add indexes
CREATE INDEX IF NOT EXISTS "client_invitations_client_db_id_idx" ON "client_invitations" USING btree ("client_db_id");
CREATE INDEX IF NOT EXISTS "client_invitations_team_db_id_idx" ON "client_invitations" USING btree ("team_db_id");
CREATE INDEX IF NOT EXISTS "client_invitations_token_idx" ON "client_invitations" USING btree ("token");
