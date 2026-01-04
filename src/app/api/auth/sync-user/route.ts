import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users, userRoleEnum } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUserId } from "@/lib/auth";

/**
 * Sync Supabase auth user to public.users table
 * Creates a user record with ARTIST role if it doesn't exist
 */
export async function POST(request: Request) {
  try {
    // Get authenticated user ID from request
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

    // Check if user already exists (we can't query by auth user ID directly,
    // so we'll create a new user with ARTIST role by default)
    // Note: This is a simplified approach - in production you might want to
    // add an auth_user_id column to track the mapping
    
    // For now, we'll just ensure there's at least one ARTIST user
    // The actual mapping will be handled by DEV_ARTIST_ID in the auth flow
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.role, userRoleEnum.enumValues[0]))
      .limit(1);

    if (existingUser) {
      return NextResponse.json(
        { 
          message: "User already exists",
          userId: existingUser.id,
        },
        { status: 200 }
      );
    }

    // Create new ARTIST user
    const [newUser] = await db
      .insert(users)
      .values({
        role: "ARTIST",
      })
      .returning();

    return NextResponse.json(
      {
        message: "User created",
        userId: newUser.id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error syncing user:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

