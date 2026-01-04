import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { missions, missionStateEnum } from "@/lib/db/schema";
import { desc, eq, and, SQL } from "drizzle-orm";
import { MissionState } from "@/lib/state/mission";
import {
  parsePaginationParams,
  buildOrderBy,
  buildCursorWhere,
  encodeCursor,
} from "@/lib/pagination";

export async function GET(request: Request) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: "DATABASE_URL environment variable is not set" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const stateParam = searchParams.get("state");

    // Validate state if provided
    if (stateParam) {
      const validStates = Object.values(MissionState);
      if (!validStates.includes(stateParam as MissionState)) {
        return NextResponse.json(
          {
            error: "Invalid state",
            validStates: validStates,
          },
          { status: 400 }
        );
      }
    }

    const { params: paginationParams, error: paginationError } =
      parsePaginationParams(searchParams);

    if (paginationError) {
      return NextResponse.json({ error: paginationError }, { status: 400 });
    }

    const db = getDb();

    // Backward compatibility: if no pagination params, return plain array
    if (!paginationParams) {
      // Build query with optional state filter
      let allMissions;
      if (stateParam) {
        allMissions = await db
          .select()
          .from(missions)
          .where(eq(missions.state, stateParam as typeof missionStateEnum.enumValues[number]))
          .orderBy(desc(missions.created_at));
      } else {
        allMissions = await db
          .select()
          .from(missions)
          .orderBy(desc(missions.created_at));
      }

      return NextResponse.json(allMissions, { status: 200 });
    }

    // Pagination mode
    const { limit, cursor, sort } = paginationParams;

    // Build where conditions
    const whereConditions: SQL[] = [];
    if (stateParam) {
      whereConditions.push(eq(missions.state, stateParam as typeof missionStateEnum.enumValues[number]));
    }
    if (cursor) {
      const cursorWhere = buildCursorWhere(sort, cursor, missions.created_at, missions.id);
      if (cursorWhere) {
        whereConditions.push(cursorWhere);
      }
    }

    // Build query with cursor-based pagination
    let query = db
      .select()
      .from(missions)
      .orderBy(...buildOrderBy(sort, missions.created_at, missions.id))
      .limit(limit + 1); // Fetch one extra to determine if there's a next page

    if (whereConditions.length > 0) {
      query = query.where(
        whereConditions.length === 1
          ? whereConditions[0]
          : and(...whereConditions)
      ) as typeof query;
    }

    const results = await query;

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
    console.error("Error fetching missions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

