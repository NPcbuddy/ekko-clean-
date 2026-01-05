import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import Stripe from "stripe";

/**
 * POST /api/connect/onboard
 * Creates a Stripe Connect account for a creator and returns an onboarding link
 */
export async function POST(request: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "STRIPE_SECRET_KEY environment variable is not set" },
        { status: 500 }
      );
    }

    // Require CREATOR role
    const { appUser } = await requireRole(request, "CREATOR");

    const db = getDb();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Check if user already has a Stripe account
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, appUser.id))
      .limit(1);

    let accountId = user.stripe_account_id;

    // Create a new Connect account if one doesn't exist
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        capabilities: {
          transfers: { requested: true },
        },
        metadata: {
          user_id: appUser.id.toString(),
        },
      });

      accountId = account.id;

      // Save the account ID
      await db
        .update(users)
        .set({ stripe_account_id: accountId })
        .where(eq(users.id, appUser.id));
    }

    // Get the origin from the request for the return URL
    const origin = request.headers.get("origin") || "http://localhost:3000";

    // Create an account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/creator?connect=refresh`,
      return_url: `${origin}/creator?connect=complete`,
      type: "account_onboarding",
    });

    return NextResponse.json({
      url: accountLink.url,
      accountId,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (error.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    console.error("Error creating Connect account:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
