import { pgEnum, pgTable, serial, timestamp, varchar, integer, bigint, uuid, text } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["ARTIST", "CREATOR"]);

// Valid roles for the roles array
export type UserRole = "ARTIST" | "CREATOR";
export const VALID_ROLES: UserRole[] = ["ARTIST", "CREATOR"];

export const paymentStatusEnum = pgEnum("payment_status", [
  "PENDING",
  "FUNDED",
  "REFUNDED",
]);

export const missionStateEnum = pgEnum("mission_state", [
  "OPEN",
  "ACCEPTED",
  "SUBMITTED",
  "VERIFIED",
  "PAID",
  "REJECTED",
]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  auth_user_id: varchar("auth_user_id").unique(), // Supabase auth user ID
  role: userRoleEnum("role"), // Deprecated: use roles array instead
  roles: text("roles").array().notNull().default([]), // Array of roles: ["ARTIST"], ["CREATOR"], or ["ARTIST", "CREATOR"]
  stripe_account_id: varchar("stripe_account_id"), // Stripe Connect account ID for creators
  stripe_onboarding_complete: timestamp("stripe_onboarding_complete"), // When onboarding was completed
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  artist_id: integer("artist_id").references(() => users.id).notNull(),
  title: varchar("title").notNull(),
  description: text("description"),
  budget_cents: bigint("budget_cents", { mode: "number" }).notNull(),
  currency: varchar("currency").notNull(),
  payment_intent_id: varchar("payment_intent_id"),
  payment_status: paymentStatusEnum("payment_status").notNull().default("PENDING"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const missions = pgTable("missions", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaign_id: integer("campaign_id").references(() => campaigns.id).notNull(),
  creator_id: varchar("creator_id"),
  title: varchar("title").notNull(),
  brief: text("brief"),
  state: missionStateEnum("state").notNull().default("OPEN"),
  payout_cents: integer("payout_cents").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const mission_submissions = pgTable("mission_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  mission_id: uuid("mission_id").references(() => missions.id).notNull().unique(),
  tiktok_url: text("tiktok_url").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

