import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { users, VALID_ROLES, type UserRole } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUserId } from "@/lib/auth";

/**
 * Sync Supabase auth user to public.users table
 * Creates a user record with the specified roles if it doesn't exist
 * Or updates existing user's roles if they already exist
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

    // Parse roles from request body
    let roles: UserRole[] = ["CREATOR"];
    try {
      const body = await request.json();

      // Support both single role (legacy) and roles array
      if (Array.isArray(body.roles)) {
        roles = body.roles.filter((r: string) => VALID_ROLES.includes(r as UserRole)) as UserRole[];
      } else if (body.role === "ARTIST" || body.role === "CREATOR") {
        roles = [body.role];
      }

      // Ensure at least one valid role
      if (roles.length === 0) {
        roles = ["CREATOR"];
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
      // Update existing user's roles if new roles are provided
      const existingRoles = (existingUser.roles || []) as UserRole[];
      const mergedRoles = Array.from(new Set([...existingRoles, ...roles])) as UserRole[];

      if (mergedRoles.length !== existingRoles.length || !mergedRoles.every(r => existingRoles.includes(r))) {
        // Roles changed, update the user
        const [updatedUser] = await db
          .update(users)
          .set({ roles: mergedRoles })
          .where(eq(users.id, existingUser.id))
          .returning();

        return NextResponse.json(
          {
            message: "User roles updated",
            userId: updatedUser.id,
            roles: updatedUser.roles,
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        {
          message: "User already exists",
          userId: existingUser.id,
          roles: existingRoles.length > 0 ? existingRoles : (existingUser.role ? [existingUser.role] : []),
        },
        { status: 200 }
      );
    }

    // Create new user with specified roles and auth_user_id
    const [newUser] = await db
      .insert(users)
      .values({
        auth_user_id: authUserId,
        roles,
        role: roles[0], // Set legacy role field for backwards compatibility
      })
      .returning();

    return NextResponse.json(
      {
        message: "User created",
        userId: newUser.id,
        roles: newUser.roles,
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

