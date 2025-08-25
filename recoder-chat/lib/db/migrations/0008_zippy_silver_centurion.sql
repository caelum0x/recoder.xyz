ALTER TABLE "Account" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "Account" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Account" ALTER COLUMN "userId" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "Account" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "Account" ALTER COLUMN "provider" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "Account" ALTER COLUMN "providerAccountId" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "Account" ALTER COLUMN "expires_at" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "Account" ALTER COLUMN "token_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "Account" ALTER COLUMN "scope" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "Account" ALTER COLUMN "session_state" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "Session" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "Session" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "Session" ALTER COLUMN "sessionToken" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "Session" ALTER COLUMN "userId" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "User" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "VerificationToken" ALTER COLUMN "identifier" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "VerificationToken" ALTER COLUMN "token" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "Account" DROP COLUMN "createdAt";--> statement-breakpoint
ALTER TABLE "Account" DROP COLUMN "updatedAt";--> statement-breakpoint
ALTER TABLE "Session" DROP COLUMN "createdAt";--> statement-breakpoint
ALTER TABLE "Session" DROP COLUMN "updatedAt";--> statement-breakpoint
ALTER TABLE "Account" ADD CONSTRAINT "Account_provider_providerAccountId_unique" UNIQUE("provider","providerAccountId");--> statement-breakpoint
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_identifier_token_unique" UNIQUE("identifier","token");