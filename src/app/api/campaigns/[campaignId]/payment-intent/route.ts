import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import Stripe from "stripe";

/**
 * GET /api/campaigns/[campaignId]/payment-intent
 * Returns the PaymentIntent client_secret for frontend checkout
 */
export async function GET(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: "DATABASE_URL environment variable is not set" },
        { status: 500 }
      );
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "STRIPE_SECRET_KEY environment variable is not set" },
        { status: 500 }
      );
    }

    const campaignId = parseInt(params.campaignId, 10);
    if (isNaN(campaignId)) {
      return NextResponse.json(
        { error: "Invalid campaign ID" },
        { status: 400 }
      );
    }

    // Require ARTIST role
    const { appUser } = await requireRole(request, "ARTIST");
    const artistId = appUser.id;

    const db = getDb();

    // Load campaign
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Verify artist owns this campaign
    if (campaign.artist_id !== artistId) {
      return NextResponse.json(
        { error: "Forbidden: You do not own this campaign" },
        { status: 403 }
      );
    }

    // Check if already funded
    if (campaign.payment_status === "FUNDED") {
      return NextResponse.json(
        { error: "Campaign is already funded" },
        { status: 400 }
      );
    }

    // Check if payment_intent_id exists
    if (!campaign.payment_intent_id) {
      return NextResponse.json(
        { error: "No PaymentIntent associated with this campaign" },
        { status: 400 }
      );
    }

    // Get PaymentIntent from Stripe
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const paymentIntent = await stripe.paymentIntents.retrieve(
      campaign.payment_intent_id
    );

    // If payment already succeeded, mark campaign as funded
    if (paymentIntent.status === "succeeded") {
      await db
        .update(campaigns)
        .set({ payment_status: "FUNDED" })
        .where(eq(campaigns.id, campaignId));

      return NextResponse.json(
        { error: "Payment already completed. Campaign is now funded." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
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

    console.error("Error fetching payment intent:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
