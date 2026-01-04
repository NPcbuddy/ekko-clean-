import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { campaigns, missions } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { requireRole } from "@/lib/auth";
import {
  parsePaginationParams,
  buildOrderBy,
  buildCursorWhere,
  encodeCursor,
} from "@/lib/pagination";

const createMissionSchema = z.object({
  payoutCents: z.number().int().min(100, "Payout must be at least 100 cents"),
});

export async function POST(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  try {
    // Require ARTIST role
    const { appUser } = await requireRole(request, "ARTIST");
    const artistId = appUser.id;

    // Validate required environment variables
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: "DATABASE_URL environment variable is not set" },
        { status: 500 }
      );
    }

    const campaignId = parseInt(params.campaignId, 10);
    if (isNaN(campaignId)) {
      return NextResponse.json(
        { error: "Invalid campaign ID" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const validated = createMissionSchema.parse(body);

    const db = getDb();

    // Verify campaign exists and user owns it
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (campaign.artist_id !== artistId) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Create mission
    const [mission] = await db
      .insert(missions)
      .values({
        campaign_id: campaignId,
        creator_id: null,
        state: "OPEN",
        payout_cents: validated.payoutCents,
      })
      .returning();

    return NextResponse.json(mission, { status: 201 });
  } catch (error) {
    // Handle auth errors first
    if (error instanceof Error) {
      if (error.message === "UNAUTHORIZED") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (error.message === "FORBIDDEN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Error creating mission:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: { campaignId: string } }
) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: "DATABASE_URL environment variable is not set" },
        { status: 500 }
      );
    }

    const campaignId = parseInt(params.campaignId, 10);
    if (isNaN(campaignId)) {
      return NextResponse.json(
        { error: "Invalid campaign ID" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const { params: paginationParams, error: paginationError } =
      parsePaginationParams(searchParams);

    if (paginationError) {
      return NextResponse.json({ error: paginationError }, { status: 400 });
    }

    const db = getDb();

    // Verify campaign exists
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);

    if (!campaign) {
      return NextResponse.json(
        { error: "Campaign not found" },
        { status: 404 }
      );
    }

    // Backward compatibility: if no pagination params, return plain array
    if (!paginationParams) {
      const campaignMissions = await db
        .select()
        .from(missions)
        .where(eq(missions.campaign_id, campaignId))
        .orderBy(desc(missions.created_at));

      return NextResponse.json(campaignMissions, { status: 200 });
    }

    // Pagination mode
    const { limit, cursor, sort } = paginationParams;

    // Build where condition
    let whereCondition = eq(missions.campaign_id, campaignId);
    if (cursor) {
      const cursorWhere = buildCursorWhere(
        sort,
        cursor,
        missions.created_at,
        missions.id
      );
      whereCondition = and(eq(missions.campaign_id, campaignId), cursorWhere)!;
    }

    // Build query with cursor-based pagination
    const results = await db
      .select()
      .from(missions)
      .where(whereCondition)
      .orderBy(...buildOrderBy(sort, missions.created_at, missions.id))
      .limit(limit + 1); // Fetch one extra to determine if there's a next page

    // Check if there's a next page
    const hasNextPage = results.length > limit;
    const data = hasNextPage ? results.slice(0, limit) : results;

    // Generate next cursor from last item
    let nextCursor: string | null = null;
    if (hasNextPage && data.length > 0) {
      const lastItem = data[data.length - 1];
      nextCursor = encodeCursor({
        created_at: lastItem.created_at.toISOString(),
        id: lastItem.id,
      });
    }

    return NextResponse.json(
      {
        data,
        nextCursor,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching campaign missions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

