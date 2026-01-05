import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getDb } from "@/lib/db";
import { campaigns, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    console.error("Webhook Error: Missing stripe-signature header");
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("Webhook Error: STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Webhook Error: ${message}`);
    return NextResponse.json(
      { error: `Webhook Error: ${message}` },
      { status: 400 }
    );
  }

  const db = getDb();

  // Handle the event
  switch (event.type) {
    case "payment_intent.succeeded": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log(`PaymentIntent succeeded: ${paymentIntent.id}`);

      // Update campaign payment status
      const campaignId = paymentIntent.metadata?.campaign_id;
      if (campaignId) {
        try {
          await db
            .update(campaigns)
            .set({ payment_status: "FUNDED" })
            .where(eq(campaigns.id, parseInt(campaignId, 10)));
          console.log(`Campaign ${campaignId} marked as FUNDED`);
        } catch (dbError) {
          console.error(`Failed to update campaign ${campaignId}:`, dbError);
        }
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log(`PaymentIntent failed: ${paymentIntent.id}`);
      console.log(`Failure reason: ${paymentIntent.last_payment_error?.message}`);
      break;
    }

    case "payment_intent.canceled": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log(`PaymentIntent canceled: ${paymentIntent.id}`);
      break;
    }

    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      console.log(`Account updated: ${account.id}`);

      // Check if onboarding is complete
      if (account.details_submitted && account.payouts_enabled) {
        try {
          await db
            .update(users)
            .set({ stripe_onboarding_complete: new Date() })
            .where(eq(users.stripe_account_id, account.id));
          console.log(`User with Stripe account ${account.id} marked as onboarding complete`);
        } catch (dbError) {
          console.error(`Failed to update user for account ${account.id}:`, dbError);
        }
      }
      break;
    }

    case "transfer.created": {
      const transfer = event.data.object as Stripe.Transfer;
      console.log(`Transfer created: ${transfer.id} for ${transfer.amount} ${transfer.currency}`);
      break;
    }

    case "transfer.reversed": {
      const transfer = event.data.object as Stripe.Transfer;
      console.log(`Transfer reversed: ${transfer.id}`);
      // Could revert mission state here if needed
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
