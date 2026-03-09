-- AlterTable
ALTER TABLE "contradiction" ADD COLUMN "status" VARCHAR(50) NOT NULL DEFAULT 'active';
ALTER TABLE "contradiction" ADD COLUMN "snoozedUntil" TIMESTAMPTZ(6);
ALTER TABLE "contradiction" ADD COLUMN "resolvedAt" TIMESTAMPTZ(6);
