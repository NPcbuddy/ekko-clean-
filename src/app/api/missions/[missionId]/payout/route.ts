import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { missions, campaigns, users } from "@/lib/db/schema";
import { assertTransition, MissionState } from "@/lib/state/mission";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import Stripe from "stripe";

export async function POST(
  request: Request,
  { params }: { params: { missionId: string } }
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

    const missionId = params.missionId;

    // Require ARTIST role
    const { appUser } = await requireRole(request, "ARTIST");
    const artistId = appUser.id;

    const db = getDb();

    // Load mission
    const [mission] = await db
      .select()
      .from(missions)
      .where(eq(missions.id, missionId))
      .limit(1);

    if (!mission) {
      return NextResponse.json(
        { error: "Mission not found" },
        { status: 404 }
      );
    }

    // Load campaign to verify artist ownership
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, mission.campaign_id))
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

    // Check campaign is funded
    if (campaign.payment_status !== "FUNDED") {
      return NextResponse.json(
        { error: "Campaign is not funded. Please fund the campaign before processing payouts." },
        { status: 402 }
      );
    }

    // Check mission is VERIFIED
    if (mission.state !== "VERIFIED") {
      return NextResponse.json(
        { error: `Mission is not VERIFIED. Current state: ${mission.state}` },
        { status: 400 }
      );
    }

    // Look up the creator's Stripe Connect account
    if (!mission.creator_id) {
      return NextResponse.json(
        { error: "Mission has no creator assigned" },
        { status: 400 }
      );
    }

    // Find creator by auth_user_id
    const [creator] = await db
      .select()
      .from(users)
      .where(eq(users.auth_user_id, mission.creator_id))
      .limit(1);

    if (!creator) {
      return NextResponse.json(
        { error: "Creator not found" },
        { status: 404 }
      );
    }

    if (!creator.stripe_account_id) {
      return NextResponse.json(
        { error: "Creator has not connected their Stripe account. They must complete Stripe onboarding to receive payouts." },
        { status: 400 }
      );
    }

    // Validate transition
    assertTransition(mission.state as MissionState, MissionState.PAID);

    // Create a transfer to the creator's Connect account
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    let transfer: Stripe.Transfer;
    try {
      transfer = await stripe.transfers.create({
        amount: mission.payout_cents,
        currency: campaign.currency,
        destination: creator.stripe_account_id,
        metadata: {
          mission_id: missionId,
          campaign_id: campaign.id.toString(),
          creator_id: creator.id.toString(),
        },
      });
    } catch (stripeError) {
      console.error("Stripe transfer failed:", stripeError);

      if (stripeError instanceof Stripe.errors.StripeError) {
        return NextResponse.json(
          { error: `Payment failed: ${stripeError.message}` },
          { status: 400 }
        );
      }
      throw stripeError;
    }

    // Update mission state to PAID
    const [updatedMission] = await db
      .update(missions)
      .set({
        state: "PAID",
        updated_at: new Date(),
      })
      .where(eq(missions.id, missionId))
      .returning();

    return NextResponse.json({
      mission: updatedMission,
      payout: {
        amount_cents: mission.payout_cents,
        currency: campaign.currency,
        status: "completed",
        transfer_id: transfer.id,
      },
    }, { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (error.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (error.message.includes("Invalid transition")) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    console.error("Error processing payout:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
