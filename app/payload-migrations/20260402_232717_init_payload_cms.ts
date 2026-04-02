import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_blog_posts_category" AS ENUM('Launch', 'Product', 'Engineering');
  CREATE TYPE "public"."enum_blog_posts_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__blog_posts_v_version_category" AS ENUM('Launch', 'Product', 'Engineering');
  CREATE TYPE "public"."enum__blog_posts_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_changelog_entries_changes_type" AS ENUM('feature', 'improvement', 'fix', 'security');
  CREATE TYPE "public"."enum_changelog_entries_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__changelog_entries_v_version_changes_type" AS ENUM('feature', 'improvement', 'fix', 'security');
  CREATE TYPE "public"."enum__changelog_entries_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "cms_users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "cms_users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"display_name" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "blog_posts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"excerpt" varchar,
  	"author" varchar DEFAULT 'Recoder Team',
  	"category" "enum_blog_posts_category" DEFAULT 'Product',
  	"read_time" varchar DEFAULT '5 min read',
  	"published_at" timestamp(3) with time zone,
  	"content" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_blog_posts_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_blog_posts_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_excerpt" varchar,
  	"version_author" varchar DEFAULT 'Recoder Team',
  	"version_category" "enum__blog_posts_v_version_category" DEFAULT 'Product',
  	"version_read_time" varchar DEFAULT '5 min read',
  	"version_published_at" timestamp(3) with time zone,
  	"version_content" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__blog_posts_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "changelog_entries_changes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "enum_changelog_entries_changes_type" DEFAULT 'feature',
  	"text" varchar
  );
  
  CREATE TABLE "changelog_entries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version" varchar,
  	"title" varchar,
  	"summary" varchar,
  	"published_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_changelog_entries_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_changelog_entries_v_version_changes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"type" "enum__changelog_entries_v_version_changes_type" DEFAULT 'feature',
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_changelog_entries_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_version" varchar,
  	"version_title" varchar,
  	"version_summary" varchar,
  	"version_published_at" timestamp(3) with time zone,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__changelog_entries_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"cms_users_id" integer,
  	"blog_posts_id" integer,
  	"changelog_entries_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"cms_users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "cms_users_sessions" ADD CONSTRAINT "cms_users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."cms_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_blog_posts_v" ADD CONSTRAINT "_blog_posts_v_parent_id_blog_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."blog_posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "changelog_entries_changes" ADD CONSTRAINT "changelog_entries_changes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."changelog_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_changelog_entries_v_version_changes" ADD CONSTRAINT "_changelog_entries_v_version_changes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_changelog_entries_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_changelog_entries_v" ADD CONSTRAINT "_changelog_entries_v_parent_id_changelog_entries_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."changelog_entries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_cms_users_fk" FOREIGN KEY ("cms_users_id") REFERENCES "public"."cms_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_blog_posts_fk" FOREIGN KEY ("blog_posts_id") REFERENCES "public"."blog_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_changelog_entries_fk" FOREIGN KEY ("changelog_entries_id") REFERENCES "public"."changelog_entries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_cms_users_fk" FOREIGN KEY ("cms_users_id") REFERENCES "public"."cms_users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "cms_users_sessions_order_idx" ON "cms_users_sessions" USING btree ("_order");
  CREATE INDEX "cms_users_sessions_parent_id_idx" ON "cms_users_sessions" USING btree ("_parent_id");
  CREATE INDEX "cms_users_updated_at_idx" ON "cms_users" USING btree ("updated_at");
  CREATE INDEX "cms_users_created_at_idx" ON "cms_users" USING btree ("created_at");
  CREATE UNIQUE INDEX "cms_users_email_idx" ON "cms_users" USING btree ("email");
  CREATE UNIQUE INDEX "blog_posts_slug_idx" ON "blog_posts" USING btree ("slug");
  CREATE INDEX "blog_posts_updated_at_idx" ON "blog_posts" USING btree ("updated_at");
  CREATE INDEX "blog_posts_created_at_idx" ON "blog_posts" USING btree ("created_at");
  CREATE INDEX "blog_posts__status_idx" ON "blog_posts" USING btree ("_status");
  CREATE INDEX "_blog_posts_v_parent_idx" ON "_blog_posts_v" USING btree ("parent_id");
  CREATE INDEX "_blog_posts_v_version_version_slug_idx" ON "_blog_posts_v" USING btree ("version_slug");
  CREATE INDEX "_blog_posts_v_version_version_updated_at_idx" ON "_blog_posts_v" USING btree ("version_updated_at");
  CREATE INDEX "_blog_posts_v_version_version_created_at_idx" ON "_blog_posts_v" USING btree ("version_created_at");
  CREATE INDEX "_blog_posts_v_version_version__status_idx" ON "_blog_posts_v" USING btree ("version__status");
  CREATE INDEX "_blog_posts_v_created_at_idx" ON "_blog_posts_v" USING btree ("created_at");
  CREATE INDEX "_blog_posts_v_updated_at_idx" ON "_blog_posts_v" USING btree ("updated_at");
  CREATE INDEX "_blog_posts_v_latest_idx" ON "_blog_posts_v" USING btree ("latest");
  CREATE INDEX "changelog_entries_changes_order_idx" ON "changelog_entries_changes" USING btree ("_order");
  CREATE INDEX "changelog_entries_changes_parent_id_idx" ON "changelog_entries_changes" USING btree ("_parent_id");
  CREATE INDEX "changelog_entries_updated_at_idx" ON "changelog_entries" USING btree ("updated_at");
  CREATE INDEX "changelog_entries_created_at_idx" ON "changelog_entries" USING btree ("created_at");
  CREATE INDEX "changelog_entries__status_idx" ON "changelog_entries" USING btree ("_status");
  CREATE INDEX "_changelog_entries_v_version_changes_order_idx" ON "_changelog_entries_v_version_changes" USING btree ("_order");
  CREATE INDEX "_changelog_entries_v_version_changes_parent_id_idx" ON "_changelog_entries_v_version_changes" USING btree ("_parent_id");
  CREATE INDEX "_changelog_entries_v_parent_idx" ON "_changelog_entries_v" USING btree ("parent_id");
  CREATE INDEX "_changelog_entries_v_version_version_updated_at_idx" ON "_changelog_entries_v" USING btree ("version_updated_at");
  CREATE INDEX "_changelog_entries_v_version_version_created_at_idx" ON "_changelog_entries_v" USING btree ("version_created_at");
  CREATE INDEX "_changelog_entries_v_version_version__status_idx" ON "_changelog_entries_v" USING btree ("version__status");
  CREATE INDEX "_changelog_entries_v_created_at_idx" ON "_changelog_entries_v" USING btree ("created_at");
  CREATE INDEX "_changelog_entries_v_updated_at_idx" ON "_changelog_entries_v" USING btree ("updated_at");
  CREATE INDEX "_changelog_entries_v_latest_idx" ON "_changelog_entries_v" USING btree ("latest");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_cms_users_id_idx" ON "payload_locked_documents_rels" USING btree ("cms_users_id");
  CREATE INDEX "payload_locked_documents_rels_blog_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("blog_posts_id");
  CREATE INDEX "payload_locked_documents_rels_changelog_entries_id_idx" ON "payload_locked_documents_rels" USING btree ("changelog_entries_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_cms_users_id_idx" ON "payload_preferences_rels" USING btree ("cms_users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "cms_users_sessions" CASCADE;
  DROP TABLE "cms_users" CASCADE;
  DROP TABLE "blog_posts" CASCADE;
  DROP TABLE "_blog_posts_v" CASCADE;
  DROP TABLE "changelog_entries_changes" CASCADE;
  DROP TABLE "changelog_entries" CASCADE;
  DROP TABLE "_changelog_entries_v_version_changes" CASCADE;
  DROP TABLE "_changelog_entries_v" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_blog_posts_category";
  DROP TYPE "public"."enum_blog_posts_status";
  DROP TYPE "public"."enum__blog_posts_v_version_category";
  DROP TYPE "public"."enum__blog_posts_v_version_status";
  DROP TYPE "public"."enum_changelog_entries_changes_type";
  DROP TYPE "public"."enum_changelog_entries_status";
  DROP TYPE "public"."enum__changelog_entries_v_version_changes_type";
  DROP TYPE "public"."enum__changelog_entries_v_version_status";`)
}
