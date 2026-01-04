import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";
import { createCampaignPaymentIntent } from "@/lib/payments/stripe";
import { eq, desc } from "drizzle-orm";
import {
  parsePaginationParams,
  buildOrderBy,
  buildCursorWhere,
  encodeCursor,
} from "@/lib/pagination";
import { requireRole } from "@/lib/auth";

const createCampaignSchema = z.object({
  title: z.string().min(1, "Title must be at least 1 character"),
  description: z.string().optional(),
  budgetCents: z.number().int().min(100, "Budget must be at least 100 cents"),
  currency: z.string().optional().default("usd"),
});

export async function POST(request: Request) {
  try {
    // Require ARTIST role
    const { appUser } = await requireRole(request, "ARTIST");
    const artistId = appUser.id;

    // Validate required environment variables before any DB or Stripe work
    const missing: string[] = [];
    if (!process.env.DATABASE_URL) {
      missing.push("DATABASE_URL");
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      missing.push("STRIPE_SECRET_KEY");
    }

    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "Required environment variables are not configured",
          missing,
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const validated = createCampaignSchema.parse(body);

    const db = getDb();

    // Insert campaign into DB
    const [campaign] = await db
      .insert(campaigns)
      .values({
        artist_id: artistId,
        title: validated.title,
        description: validated.description || null,
        budget_cents: validated.budgetCents,
        currency: validated.currency || "usd",
      })
      .returning();

    // Create PaymentIntent
    let paymentIntent;
    try {
      paymentIntent = await createCampaignPaymentIntent({
        amount: validated.budgetCents,
        currency: validated.currency || "usd",
        metadata: {
          campaign_id: campaign.id.toString(),
          artist_id: artistId.toString(),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("STRIPE_SECRET_KEY")) {
        return NextResponse.json(
          {
            error: "Internal server error",
            reason: "Payment service configuration error",
          },
          { status: 500 }
        );
      }
      throw error;
    }

    // Update campaign with payment_intent_id
    const [updatedCampaign] = await db
      .update(campaigns)
      .set({ payment_intent_id: paymentIntent.id })
      .where(eq(campaigns.id, campaign.id))
      .returning();

    return NextResponse.json(
      {
        campaign: updatedCampaign,
        paymentIntent: {
          id: paymentIntent.id,
          client_secret: paymentIntent.client_secret,
        },
      },
      { status: 201 }
    );
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

    // Extract safe error summary (no secrets)
    let errorReason = "Unknown error";
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes("foreign key") || message.includes("constraint") || message.includes("violates")) {
        errorReason = "Database constraint violation";
      } else if (message.includes("connection") || message.includes("timeout") || message.includes("connect econnrefused") || message.includes("getaddrinfo")) {
        errorReason = "Database connection error";
      } else if (message.includes("stripe") || message.includes("payment")) {
        errorReason = "Payment service error";
      } else if (message.includes("relation") || message.includes("does not exist") || message.includes("table") || message.includes("failed query")) {
        errorReason = "Database schema error - tables may not exist. Ensure migrations have been applied.";
      } else if (message.includes("syntax") || message.includes("invalid")) {
        errorReason = "Database query error";
      } else {
        errorReason = "Request processing error";
      }
    }

    console.error("Error creating campaign:", error);
    
    return NextResponse.json({
      error: "Internal server error",
      reason: errorReason,
    }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { error: "DATABASE_URL environment variable is not set" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const { params: paginationParams, error: paginationError } =
      parsePaginationParams(searchParams);

    if (paginationError) {
      return NextResponse.json({ error: paginationError }, { status: 400 });
    }

    const db = getDb();

    // Backward compatibility: if no pagination params, return plain array
    if (!paginationParams) {
      const allCampaigns = await db
        .select()
        .from(campaigns)
        .orderBy(desc(campaigns.created_at));

      return NextResponse.json(allCampaigns, { status: 200 });
    }

    // Pagination mode
    const { limit, cursor, sort } = paginationParams;

    // Build query with cursor-based pagination
    let query = db
      .select()
      .from(campaigns)
      .orderBy(...buildOrderBy(sort, campaigns.created_at, campaigns.id))
      .limit(limit + 1); // Fetch one extra to determine if there's a next page

    if (cursor) {
      query = query.where(
        buildCursorWhere(sort, cursor, campaigns.created_at, campaigns.id)
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
    console.error("Error fetching campaigns:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

