-- Better Auth migration: add auth tables and email_verified column
-- All existing sessions will be invalidated — users must re-login after deployment.

ALTER TABLE "users" ADD COLUMN "email_verified" boolean NOT NULL DEFAULT false;

CREATE TABLE "auth_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" ("user_id");
CREATE INDEX "auth_sessions_token_idx" ON "auth_sessions" ("token");

CREATE TABLE "auth_accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "access_token" text,
  "refresh_token" text,
  "expires_at" timestamp,
  "scope" text,
  "id_token" text,
  "password" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "auth_accounts_provider_account_unique" UNIQUE ("provider_id", "account_id")
);

CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts" ("user_id");

CREATE TABLE "auth_verifications" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" ("identifier");
