import { desc, asc, and, lt, gt, or, eq, type SQL, type Column } from "drizzle-orm";

export type SortOption = "created_at_desc" | "created_at_asc" | "id_desc" | "id_asc";

export interface PaginationParams {
  limit: number;
  cursor: Cursor | null;
  sort: SortOption;
}

export interface Cursor {
  created_at: string; // ISO timestamp string
  id: string | number; // Can be integer (campaigns) or UUID string (missions)
}

/**
 * Parse and validate pagination query parameters
 */
export function parsePaginationParams(searchParams: URLSearchParams): {
  params: PaginationParams | null;
  error: string | null;
} {
  const limitParam = searchParams.get("limit");
  const cursorParam = searchParams.get("cursor");
  const sortParam = searchParams.get("sort");

  // If no pagination params, return null (backward compatibility)
  if (!limitParam && !cursorParam && !sortParam) {
    return { params: null, error: null };
  }

  // Parse limit
  let limit = 20; // default
  if (limitParam) {
    const parsedLimit = parseInt(limitParam, 10);
    if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
      return {
        params: null,
        error: "Invalid limit. Must be an integer between 1 and 100.",
      };
    }
    limit = parsedLimit;
  }

  // Parse sort
  const validSorts: SortOption[] = ["created_at_desc", "created_at_asc", "id_desc", "id_asc"];
  let sort: SortOption = "created_at_desc"; // default
  if (sortParam) {
    if (!validSorts.includes(sortParam as SortOption)) {
      return {
        params: null,
        error: `Invalid sort. Must be one of: ${validSorts.join(", ")}`,
      };
    }
    sort = sortParam as SortOption;
  }

  // Parse cursor
  let cursor: Cursor | null = null;
  if (cursorParam) {
    try {
      const decoded = Buffer.from(cursorParam, "base64").toString("utf-8");
      const parsed = JSON.parse(decoded);
      if (
        typeof parsed.created_at !== "string" ||
        (typeof parsed.id !== "string" && typeof parsed.id !== "number")
      ) {
        return {
          params: null,
          error: "Invalid cursor format.",
        };
      }
      cursor = {
        created_at: parsed.created_at,
        id: parsed.id,
      };
    } catch {
      return {
        params: null,
        error: "Invalid cursor. Cursor must be a valid base64-encoded JSON string.",
      };
    }
  }

  return {
    params: {
      limit,
      cursor,
      sort,
    },
    error: null,
  };
}

/**
 * Encode cursor to base64 string
 */
export function encodeCursor(cursor: Cursor): string {
  const json = JSON.stringify(cursor);
  return Buffer.from(json).toString("base64");
}

/**
 * Build Drizzle orderBy clause from sort option
 */
export function buildOrderBy(
  sort: SortOption,
  createdAtColumn: Column,
  idColumn: Column
): SQL[] {
  switch (sort) {
    case "created_at_desc":
      return [desc(createdAtColumn), desc(idColumn)];
    case "created_at_asc":
      return [asc(createdAtColumn), asc(idColumn)];
    case "id_desc":
      return [desc(idColumn), desc(createdAtColumn)];
    case "id_asc":
      return [asc(idColumn), asc(createdAtColumn)];
    default:
      return [desc(createdAtColumn), desc(idColumn)];
  }
}

/**
 * Build Drizzle where clause for cursor-based pagination
 */
export function buildCursorWhere(
  sort: SortOption,
  cursor: Cursor,
  createdAtColumn: Column,
  idColumn: Column
): SQL | undefined {
  const cursorCreatedAt = new Date(cursor.created_at);
  const cursorId = cursor.id;

  switch (sort) {
    case "created_at_desc":
      // created_at < cursor.created_at OR (created_at = cursor.created_at AND id < cursor.id)
      return or(
        lt(createdAtColumn, cursorCreatedAt),
        and(
          eq(createdAtColumn, cursorCreatedAt),
          lt(idColumn, cursorId)
        )
      );
    case "created_at_asc":
      // created_at > cursor.created_at OR (created_at = cursor.created_at AND id > cursor.id)
      return or(
        gt(createdAtColumn, cursorCreatedAt),
        and(
          eq(createdAtColumn, cursorCreatedAt),
          gt(idColumn, cursorId)
        )
      );
    case "id_desc":
      // id < cursor.id OR (id = cursor.id AND created_at < cursor.created_at)
      return or(
        lt(idColumn, cursorId),
        and(
          eq(idColumn, cursorId),
          lt(createdAtColumn, cursorCreatedAt)
        )
      );
    case "id_asc":
      // id > cursor.id OR (id = cursor.id AND created_at > cursor.created_at)
      return or(
        gt(idColumn, cursorId),
        and(
          eq(idColumn, cursorId),
          gt(createdAtColumn, cursorCreatedAt)
        )
      );
    default:
      return or(
        lt(createdAtColumn, cursorCreatedAt),
        and(
          eq(createdAtColumn, cursorCreatedAt),
          lt(idColumn, cursorId)
        )
      );
  }
}


