import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { missions, mission_submissions } from "@/lib/db/schema";
import { assertTransition, MissionState } from "@/lib/state/mission";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/auth";

const submitMissionSchema = z.object({
  tiktokUrl: z.string().url("TikTok URL must be a valid URL"),
});

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

    const body = await request.json();
    const validated = submitMissionSchema.parse(body);

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

    // Check mission is ACCEPTED
    if (mission.state !== "ACCEPTED") {
      return NextResponse.json(
        { error: `Mission is not ACCEPTED. Current state: ${mission.state}` },
        { status: 400 }
      );
    }

    // Check creator_id matches
    if (mission.creator_id !== creatorId) {
      return NextResponse.json(
        { error: "Mission does not belong to this creator" },
        { status: 403 }
      );
    }

    // Validate transition
    assertTransition(mission.state as MissionState, MissionState.SUBMITTED);

    // Upsert submission (prevent multiple submissions)
    const [submission] = await db
      .insert(mission_submissions)
      .values({
        mission_id: missionId,
        tiktok_url: validated.tiktokUrl,
      })
      .onConflictDoUpdate({
        target: mission_submissions.mission_id,
        set: {
          tiktok_url: validated.tiktokUrl,
        },
      })
      .returning();

    // Update mission state to SUBMITTED
    const [updatedMission] = await db
      .update(missions)
      .set({
        state: "SUBMITTED",
        updated_at: new Date(),
      })
      .where(eq(missions.id, missionId))
      .returning();

    return NextResponse.json(
      {
        mission: updatedMission,
        submission,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

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

    console.error("Error submitting mission:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

