-- Fix OAuth tables schema for production database
-- This script will drop and recreate the OAuth tables with correct types

-- Drop foreign key constraints first
ALTER TABLE "Account" DROP CONSTRAINT IF EXISTS "Account_userId_User_id_fk";
ALTER TABLE "Session" DROP CONSTRAINT IF EXISTS "Session_userId_User_id_fk";

-- Drop OAuth tables
DROP TABLE IF EXISTS "Account" CASCADE;
DROP TABLE IF EXISTS "Session" CASCADE;
DROP TABLE IF EXISTS "VerificationToken" CASCADE;

-- Create Account table with correct schema
CREATE TABLE "Account" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "type" text NOT NULL,
  "provider" text NOT NULL,
  "providerAccountId" text NOT NULL,
  "refresh_token" text,
  "access_token" text,
  "expires_at" integer,
  "token_type" text,
  "scope" text,
  "id_token" text,
  "session_state" text,
  CONSTRAINT "Account_provider_providerAccountId_unique" UNIQUE("provider","providerAccountId")
);

-- Create Session table with correct schema
CREATE TABLE "Session" (
  "id" text PRIMARY KEY NOT NULL,
  "sessionToken" text NOT NULL UNIQUE,
  "userId" text NOT NULL,
  "expires" timestamp NOT NULL
);

-- Create VerificationToken table with correct schema
CREATE TABLE "VerificationToken" (
  "identifier" text NOT NULL,
  "token" text NOT NULL UNIQUE,
  "expires" timestamp NOT NULL,
  CONSTRAINT "VerificationToken_identifier_token_unique" UNIQUE("identifier","token")
);

-- Add foreign key constraints
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_User_id_fk" 
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_User_id_fk" 
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;

-- Ensure User table has correct id type (if needed)
-- This will only work if there are no dependencies
-- ALTER TABLE "User" ALTER COLUMN "id" TYPE text USING "id"::text;
