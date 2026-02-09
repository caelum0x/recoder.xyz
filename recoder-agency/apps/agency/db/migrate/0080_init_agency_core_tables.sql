-- Initialize agency-specific core tables on fresh databases.
-- These tables exist in db/schema.ts but were not present in historical SQL migration files.

CREATE TABLE IF NOT EXISTS "clients" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"team_db_id" integer NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"company" text,
	"phone" text,
	"notes" text,
	"status" text NOT NULL DEFAULT 'lead',
	"supabase_user_id" text,
	"stripe_customer_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "clients_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_team_db_id_teams_db_id_fk" FOREIGN KEY ("team_db_id") REFERENCES "public"."teams"("db_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_team_db_id_idx" ON "clients" USING btree ("team_db_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_supabase_user_id_idx" ON "clients" USING btree ("supabase_user_id");

CREATE TABLE IF NOT EXISTS "projects" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"team_db_id" integer NOT NULL,
	"client_db_id" integer NOT NULL,
	"workspace_db_id" integer,
	"name" text NOT NULL,
	"brief" text,
	"status" text NOT NULL DEFAULT 'queued',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_team_db_id_teams_db_id_fk" FOREIGN KEY ("team_db_id") REFERENCES "public"."teams"("db_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_db_id_clients_db_id_fk" FOREIGN KEY ("client_db_id") REFERENCES "public"."clients"("db_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_db_id_workspaces_db_id_fk" FOREIGN KEY ("workspace_db_id") REFERENCES "public"."workspaces"("db_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_team_db_id_idx" ON "projects" USING btree ("team_db_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_client_db_id_idx" ON "projects" USING btree ("client_db_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_workspace_db_id_idx" ON "projects" USING btree ("workspace_db_id");

CREATE TABLE IF NOT EXISTS "deliverables" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"project_db_id" integer NOT NULL,
	"task_id" text,
	"name" text NOT NULL,
	"type" text NOT NULL DEFAULT 'document',
	"content" text,
	"file_key" text,
	"status" text NOT NULL DEFAULT 'draft',
	"client_feedback" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "deliverables_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_project_db_id_projects_db_id_fk" FOREIGN KEY ("project_db_id") REFERENCES "public"."projects"("db_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deliverables_project_db_id_idx" ON "deliverables" USING btree ("project_db_id");

CREATE TABLE IF NOT EXISTS "invoices" (
	"db_id" serial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"team_db_id" integer NOT NULL,
	"project_db_id" integer,
	"client_db_id" integer,
	"amount" integer NOT NULL,
	"currency" text NOT NULL DEFAULT 'usd',
	"status" text NOT NULL DEFAULT 'draft',
	"stripe_invoice_id" text,
	"due_date" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_id_unique" UNIQUE("id")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_team_db_id_teams_db_id_fk" FOREIGN KEY ("team_db_id") REFERENCES "public"."teams"("db_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_db_id_projects_db_id_fk" FOREIGN KEY ("project_db_id") REFERENCES "public"."projects"("db_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_db_id_clients_db_id_fk" FOREIGN KEY ("client_db_id") REFERENCES "public"."clients"("db_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_team_db_id_idx" ON "invoices" USING btree ("team_db_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_project_db_id_idx" ON "invoices" USING btree ("project_db_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_client_db_id_idx" ON "invoices" USING btree ("client_db_id");
