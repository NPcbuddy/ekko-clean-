"use client";

import { useState, useEffect } from "react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { getStripeClient } from "@/lib/stripe/client";

interface CheckoutFormProps {
  clientSecret: string;
  amount: number;
  onSuccess: () => void;
  onCancel: () => void;
}

function CheckoutForm({ clientSecret, amount, onSuccess, onCancel }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || "An error occurred");
      setProcessing(false);
      return;
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: {
        return_url: `${window.location.origin}/artist?payment=success`,
      },
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message || "Payment failed");
      setProcessing(false);
    } else if (paymentIntent && paymentIntent.status === "succeeded") {
      onSuccess();
    } else {
      setError("Payment was not completed. Please try again.");
      setProcessing(false);
    }
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: "20px" }}>
        <div style={{
          padding: "16px",
          backgroundColor: "#f0f9ff",
          borderRadius: "8px",
          marginBottom: "16px",
        }}>
          <div style={{ fontSize: "14px", color: "#0369a1" }}>Amount to pay</div>
          <div style={{ fontSize: "28px", fontWeight: "bold", color: "#0c4a6e" }}>
            {formatCurrency(amount)}
          </div>
        </div>

        <PaymentElement />
      </div>

      {error && (
        <div style={{
          padding: "12px",
          backgroundColor: "#fef2f2",
          color: "#dc2626",
          borderRadius: "4px",
          marginBottom: "16px",
          fontSize: "14px",
        }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={processing}
          style={{
            padding: "12px 24px",
            backgroundColor: "#f5f5f5",
            color: "#333",
            border: "1px solid #ccc",
            borderRadius: "4px",
            cursor: processing ? "not-allowed" : "pointer",
            fontSize: "14px",
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!stripe || processing}
          style={{
            padding: "12px 24px",
            backgroundColor: !stripe || processing ? "#ccc" : "#0070f3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: !stripe || processing ? "not-allowed" : "pointer",
            fontSize: "14px",
            fontWeight: "bold",
          }}
        >
          {processing ? "Processing..." : `Pay ${formatCurrency(amount)}`}
        </button>
      </div>
    </form>
  );
}

interface StripeCheckoutProps {
  clientSecret: string;
  amount: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function StripeCheckout({
  clientSecret,
  amount,
  onSuccess,
  onCancel,
}: StripeCheckoutProps) {
  const [stripeLoaded, setStripeLoaded] = useState(false);
  const stripePromise = getStripeClient();

  useEffect(() => {
    if (stripePromise) {
      stripePromise.then(() => setStripeLoaded(true));
    }
  }, [stripePromise]);

  if (!stripePromise) {
    return (
      <div style={{
        padding: "20px",
        textAlign: "center",
        color: "#dc2626",
      }}>
        Stripe is not configured. Please set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.
      </div>
    );
  }

  if (!stripeLoaded) {
    return (
      <div style={{
        padding: "20px",
        textAlign: "center",
        color: "#666",
      }}>
        Loading payment form...
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#0070f3",
          },
        },
      }}
    >
      <CheckoutForm
        clientSecret={clientSecret}
        amount={amount}
        onSuccess={onSuccess}
        onCancel={onCancel}
      />
    </Elements>
  );
}
