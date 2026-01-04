import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { missions } from "@/lib/db/schema";
import { assertTransition, MissionState } from "@/lib/state/mission";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

export async function POST(
  request: Request,
  { params }: { params: { missionId: string } }
) {
  try {
    // Validate required environment variables
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: "DATABASE_URL environment variable is not set" },
        { status: 500 }
      );
    }

    const missionId = params.missionId;

    // Require CREATOR role
    const { authUserId } = await requireRole(request, "CREATOR");
    const creatorId = authUserId; // Use Supabase auth user ID as creator_id

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

    // Check mission is OPEN
    if (mission.state !== "OPEN") {
      return NextResponse.json(
        { error: `Mission is not OPEN. Current state: ${mission.state}` },
        { status: 400 }
      );
    }

    // Validate transition
    assertTransition(mission.state as MissionState, MissionState.ACCEPTED);

    // Update mission
    const [updatedMission] = await db
      .update(missions)
      .set({
        creator_id: creatorId,
        state: "ACCEPTED",
        updated_at: new Date(),
      })
      .where(eq(missions.id, missionId))
      .returning();

    return NextResponse.json(updatedMission, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Invalid transition")) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // Handle auth errors first
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

    console.error("Error accepting mission:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

