-- Rename Stripe fields to Polar on Organization table
ALTER TABLE "Organization" RENAME COLUMN "stripeCustomerId" TO "polarCustomerId";
ALTER TABLE "Organization" RENAME COLUMN "stripeSubscriptionId" TO "polarSubscriptionId";
