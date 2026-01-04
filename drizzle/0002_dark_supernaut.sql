ALTER TABLE "campaigns" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "title" varchar NOT NULL;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "brief" text;