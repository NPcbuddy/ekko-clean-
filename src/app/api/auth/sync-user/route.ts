import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUserId } from "@/lib/auth";

/**
 * Sync Supabase auth user to public.users table
 * Creates a user record with the specified role if it doesn't exist
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

    // Parse role from request body
    let role: "ARTIST" | "CREATOR" = "CREATOR";
    try {
      const body = await request.json();
      if (body.role === "ARTIST" || body.role === "CREATOR") {
        role = body.role;
      }
    } catch {
      // If no body or invalid JSON, default to CREATOR
    }

    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: "DATABASE_URL environment variable is not set" },
        { status: 500 }
      );
    }

    const db = getDb();

    // Check if user already exists by auth_user_id
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.auth_user_id, authUserId))
      .limit(1);

    if (existingUser) {
      return NextResponse.json(
        {
          message: "User already exists",
          userId: existingUser.id,
          role: existingUser.role,
        },
        { status: 200 }
      );
    }

    // Create new user with specified role and auth_user_id
    const [newUser] = await db
      .insert(users)
      .values({
        auth_user_id: authUserId,
        role,
      })
      .returning();

    return NextResponse.json(
      {
        message: "User created",
        userId: newUser.id,
        role: newUser.role,
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

