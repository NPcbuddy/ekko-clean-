CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'FUNDED', 'REFUNDED');--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "payment_status" "payment_status" DEFAULT 'PENDING' NOT NULL;