import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import Stripe from "stripe";

/**
 * GET /api/connect/status
 * Returns the creator's Stripe Connect account status
 */
export async function GET(request: Request) {
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

    // Get user's Stripe account info
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, appUser.id))
      .limit(1);

    if (!user.stripe_account_id) {
      return NextResponse.json({
        connected: false,
        accountId: null,
        payoutsEnabled: false,
        onboardingComplete: false,
      });
    }

    // Get account details from Stripe
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const account = await stripe.accounts.retrieve(user.stripe_account_id);

    const onboardingComplete = account.details_submitted && account.payouts_enabled;

    // Update onboarding status if complete and not already recorded
    if (onboardingComplete && !user.stripe_onboarding_complete) {
      await db
        .update(users)
        .set({ stripe_onboarding_complete: new Date() })
        .where(eq(users.id, appUser.id));
    }

    return NextResponse.json({
      connected: true,
      accountId: user.stripe_account_id,
      payoutsEnabled: account.payouts_enabled,
      chargesEnabled: account.charges_enabled,
      detailsSubmitted: account.details_submitted,
      onboardingComplete,
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

    console.error("Error checking Connect status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
