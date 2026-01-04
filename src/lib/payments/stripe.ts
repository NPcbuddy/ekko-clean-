import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY environment variable is not set");
    }

    stripeInstance = new Stripe(secretKey);
  }

  return stripeInstance;
}

export interface CreateCampaignPaymentIntentParams {
  amount: number; // in cents
  currency?: string; // defaults to "usd"
  metadata?: Record<string, string>;
}

export interface CampaignPaymentIntentResult {
  id: string;
  client_secret: string;
}

export async function createCampaignPaymentIntent(
  params: CreateCampaignPaymentIntentParams
): Promise<CampaignPaymentIntentResult> {
  const stripe = getStripe();

  const paymentIntent = await stripe.paymentIntents.create({
    amount: params.amount,
    currency: params.currency || "usd",
    metadata: params.metadata || {},
  });

  return {
    id: paymentIntent.id,
    client_secret: paymentIntent.client_secret!,
  };
}

export interface PayoutCreatorParams {
  connectedAccountId: string;
  amount: number; // in cents
  currency: string;
}

export interface PayoutCreatorResult {
  id: string;
  status: string;
}

export async function payoutCreator(
  params: PayoutCreatorParams
): Promise<PayoutCreatorResult> {
  const stripe = getStripe();

  const transfer = await stripe.transfers.create({
    amount: params.amount,
    currency: params.currency,
    destination: params.connectedAccountId,
  });

  return {
    id: transfer.id,
    status: "pending",
  };
}

