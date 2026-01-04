import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

/**
 * Get Supabase auth user ID from request headers
 * Returns the authenticated user's Supabase auth ID (UUID string) or null
 */
export async function getAuthUserId(request: NextRequest | Request): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase environment variables not configured");
    return null;
  }

  // Extract Authorization header
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7); // Remove "Bearer " prefix

  try {
    // Create Supabase client for server-side auth verification
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Verify the JWT token
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error("Auth verification error:", error?.message);
      return null;
    }

    return user.id;
  } catch (error) {
    console.error("Error verifying auth token:", error);
    return null;
  }
}

/**
 * Get app user record from public.users table by auth_user_id
 * Returns the user if found, or null if not found
 */
export async function getAppUser(
  authUserId: string,
  requiredRole?: "ARTIST" | "CREATOR"
): Promise<{ id: number; role: "ARTIST" | "CREATOR" } | null> {
  const { getDb } = await import("@/lib/db");
  const { users } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const db = getDb();

  // Look up user by auth_user_id
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.auth_user_id, authUserId))
    .limit(1);

  if (!user) {
    return null;
  }

  // If a required role is specified, verify it matches
  if (requiredRole && user.role !== requiredRole) {
    return null;
  }

  return { id: user.id, role: user.role };
}

/**
 * Require authentication and return auth user ID or throw 401
 */
export async function requireAuth(request: NextRequest | Request): Promise<string> {
  const userId = await getAuthUserId(request);
  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }
  return userId;
}

/**
 * Require specific role and return app user or throw 403
 */
export async function requireRole(
  request: NextRequest | Request,
  requiredRole: "ARTIST" | "CREATOR"
): Promise<{ authUserId: string; appUser: { id: number; role: "ARTIST" | "CREATOR" } }> {
  const authUserId = await requireAuth(request);
  const appUser = await getAppUser(authUserId, requiredRole);

  if (!appUser || appUser.role !== requiredRole) {
    throw new Error("FORBIDDEN");
  }

  return { authUserId, appUser };
}

