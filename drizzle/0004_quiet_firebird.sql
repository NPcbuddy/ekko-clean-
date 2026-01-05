ALTER TABLE "users" ADD COLUMN "stripe_account_id" varchar;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_onboarding_complete" timestamp;