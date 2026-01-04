import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUserId } from "@/lib/auth";

/**
 * Get current user's profile including role
 */
export async function GET(request: Request) {
  try {
    const authUserId = await getAuthUserId(request);

    if (!authUserId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: "DATABASE_URL environment variable is not set" },
        { status: 500 }
      );
    }

    const db = getDb();

    // Look up user by auth_user_id
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.auth_user_id, authUserId))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: user.id,
      role: user.role,
      created_at: user.created_at,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
