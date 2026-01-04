import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { missions, mission_submissions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
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

    // Validate UUID format
    if (!UUID_REGEX.test(missionId)) {
      return NextResponse.json(
        { error: "Invalid mission ID format" },
        { status: 400 }
      );
    }

    const db = getDb();

    // Get mission
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

    // Get submission if it exists
    const [submission] = await db
      .select()
      .from(mission_submissions)
      .where(eq(mission_submissions.mission_id, missionId))
      .limit(1);

    return NextResponse.json(
      {
        ...mission,
        submission: submission || null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching mission:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

