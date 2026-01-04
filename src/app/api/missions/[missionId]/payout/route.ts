import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { missions, campaigns } from "@/lib/db/schema";
import { assertTransition, MissionState } from "@/lib/state/mission";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

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
        { status: 402 } // Payment Required
      );
    }

    // Check mission is VERIFIED
    if (mission.state !== "VERIFIED") {
      return NextResponse.json(
        { error: `Mission is not VERIFIED. Current state: ${mission.state}` },
        { status: 400 }
      );
    }

    // Validate transition
    assertTransition(mission.state as MissionState, MissionState.PAID);

    // Update mission state to PAID
    const [updatedMission] = await db
      .update(missions)
      .set({
        state: "PAID",
        updated_at: new Date(),
      })
      .where(eq(missions.id, missionId))
      .returning();

    // Note: Actual Stripe payout would require creator's Stripe Connect account ID
    // For now, we just mark the mission as PAID
    // In production, you would:
    // 1. Look up creator's Stripe Connect account from a creators table
    // 2. Call payoutCreator({ connectedAccountId, amount: mission.payout_cents, currency: campaign.currency })

    return NextResponse.json({
      mission: updatedMission,
      payout: {
        amount_cents: mission.payout_cents,
        currency: campaign.currency,
        status: "completed",
        note: "Mission marked as paid. Stripe Connect integration required for actual transfers.",
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
