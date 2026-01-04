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

    // Load mission with campaign to verify ownership
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

    // Check mission is SUBMITTED
    if (mission.state !== "SUBMITTED") {
      return NextResponse.json(
        { error: `Mission is not SUBMITTED. Current state: ${mission.state}` },
        { status: 400 }
      );
    }

    // Validate transition
    assertTransition(mission.state as MissionState, MissionState.VERIFIED);

    // Update mission
    const [updatedMission] = await db
      .update(missions)
      .set({
        state: "VERIFIED",
        updated_at: new Date(),
      })
      .where(eq(missions.id, missionId))
      .returning();

    return NextResponse.json(updatedMission, { status: 200 });
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

    console.error("Error verifying mission:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
