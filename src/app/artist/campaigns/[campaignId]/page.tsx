"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";
import dynamic from "next/dynamic";

const StripeCheckout = dynamic(() => import("@/components/StripeCheckout"), {
  ssr: false,
  loading: () => <div style={{ padding: "20px", textAlign: "center" }}>Loading payment form...</div>,
});

interface Campaign {
  id: number;
  artist_id: number;
  title: string;
  description: string | null;
  budget_cents: number;
  currency: string;
  payment_intent_id: string | null;
  payment_status: "PENDING" | "FUNDED" | "REFUNDED";
  created_at: string;
}

interface Mission {
  id: string;
  campaign_id: number;
  creator_id: string | null;
  title: string;
  brief: string | null;
  state: string;
  payout_cents: number;
  created_at: string;
  updated_at: string;
  submission?: {
    id: string;
    tiktok_url: string;
    created_at: string;
  } | null;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  OPEN: { bg: "#e3f2fd", text: "#1565c0" },
  ACCEPTED: { bg: "#fff3e0", text: "#ef6c00" },
  SUBMITTED: { bg: "#f3e5f5", text: "#7b1fa2" },
  VERIFIED: { bg: "#e8f5e9", text: "#2e7d32" },
  PAID: { bg: "#e8f5e9", text: "#1b5e20" },
  REJECTED: { bg: "#ffebee", text: "#c62828" },
};

export default function CampaignDetailPage() {
  const router = useRouter();
  const params = useParams();
  const campaignId = params.campaignId as string;

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create Mission modal state
  const [showMissionModal, setShowMissionModal] = useState(false);
  const [missionTitle, setMissionTitle] = useState("");
  const [missionBrief, setMissionBrief] = useState("");
  const [missionPayout, setMissionPayout] = useState("");
  const [missionError, setMissionError] = useState<string | null>(null);
  const [missionLoading, setMissionLoading] = useState(false);

  // Checkout modal state
  const [showCheckout, setShowCheckout] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  const fetchData = useCallback(async () => {
    if (!session) return;

    try {
      setError(null);

      // Fetch campaign
      const campaignRes = await fetch(`/api/campaigns/${campaignId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!campaignRes.ok) {
        if (campaignRes.status === 404) {
          setError("Campaign not found");
          return;
        }
        throw new Error("Failed to fetch campaign");
      }

      const campaignData = await campaignRes.json();
      setCampaign(campaignData);

      // Fetch missions
      const missionsRes = await fetch(`/api/campaigns/${campaignId}/missions`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (missionsRes.ok) {
        const missionsData = await missionsRes.json();
        const missionsList = Array.isArray(missionsData) ? missionsData : missionsData.data || [];

        // Fetch submission details for SUBMITTED missions
        const missionsWithSubmissions = await Promise.all(
          missionsList.map(async (mission: Mission) => {
            if (mission.state === "SUBMITTED" || mission.state === "VERIFIED" || mission.state === "PAID") {
              const detailRes = await fetch(`/api/missions/${mission.id}`, {
                headers: { Authorization: `Bearer ${session.access_token}` },
              });
              if (detailRes.ok) {
                return await detailRes.json();
              }
            }
            return mission;
          })
        );

        setMissions(missionsWithSubmissions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    }
  }, [session, campaignId]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.push("/auth/signin");
        return;
      }
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push("/auth/signin");
        return;
      }
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    if (session) {
      fetchData();
    }
  }, [session, fetchData]);

  const handleFundCampaign = async () => {
    if (!session || !campaign) return;

    setCheckoutLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/payment-intent`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to get payment details");
      }

      setClientSecret(data.clientSecret);
      setShowCheckout(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to initiate payment");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleCheckoutSuccess = async () => {
    setShowCheckout(false);
    setClientSecret(null);
    await fetchData();
  };

  const handleCheckoutCancel = () => {
    setShowCheckout(false);
    setClientSecret(null);
  };

  const handleCreateMission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    setMissionLoading(true);
    setMissionError(null);

    try {
      const payoutCents = Math.round(parseFloat(missionPayout) * 100);
      if (isNaN(payoutCents) || payoutCents < 100) {
        throw new Error("Payout must be at least $1.00");
      }

      if (!missionTitle.trim()) {
        throw new Error("Mission title is required");
      }

      const res = await fetch(`/api/campaigns/${campaignId}/missions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: missionTitle,
          brief: missionBrief || undefined,
          payoutCents,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create mission");
      }

      setShowMissionModal(false);
      setMissionTitle("");
      setMissionBrief("");
      setMissionPayout("");
      await fetchData();
    } catch (err) {
      setMissionError(err instanceof Error ? err.message : "Failed to create mission");
    } finally {
      setMissionLoading(false);
    }
  };

  const handleVerify = async (missionId: string) => {
    if (!session) return;

    setActionLoading(missionId);
    setError(null);

    try {
      const res = await fetch(`/api/missions/${missionId}/verify`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to verify mission");
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify mission");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (missionId: string) => {
    if (!session) return;

    setActionLoading(missionId);
    setError(null);

    try {
      const res = await fetch(`/api/missions/${missionId}/reject`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reject mission");
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject mission");
    } finally {
      setActionLoading(null);
    }
  };

  const handlePayout = async (missionId: string) => {
    if (!session) return;

    setActionLoading(missionId);
    setError(null);

    try {
      const res = await fetch(`/api/missions/${missionId}/payout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to process payout");
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process payout");
    } finally {
      setActionLoading(null);
    }
  };

  // Calculate stats
  const totalPayout = missions.reduce((sum, m) => sum + m.payout_cents, 0);
  const paidOut = missions.filter(m => m.state === "PAID").reduce((sum, m) => sum + m.payout_cents, 0);
  const pendingPayout = missions.filter(m => m.state === "VERIFIED").reduce((sum, m) => sum + m.payout_cents, 0);

  if (loading) {
    return (
      <div style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        fontSize: "18px",
      }}>
        Loading...
      </div>
    );
  }

  if (!campaign) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        gap: "16px",
      }}>
        <div style={{ fontSize: "24px" }}>Campaign not found</div>
        <button
          onClick={() => router.push("/artist")}
          style={{
            padding: "12px 24px",
            backgroundColor: "#0070f3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#f5f5f5",
      padding: "20px",
    }}>
      {/* Header */}
      <div style={{
        maxWidth: "1000px",
        margin: "0 auto",
        marginBottom: "24px",
      }}>
        <button
          onClick={() => router.push("/artist")}
          style={{
            padding: "8px 16px",
            backgroundColor: "transparent",
            color: "#0070f3",
            border: "none",
            cursor: "pointer",
            fontSize: "14px",
            marginBottom: "16px",
          }}
        >
          ← Back to Dashboard
        </button>

        <div style={{
          backgroundColor: "white",
          borderRadius: "8px",
          padding: "24px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <h1 style={{ margin: 0, fontSize: "28px" }}>{campaign.title}</h1>
                <span
                  style={{
                    padding: "6px 12px",
                    borderRadius: "4px",
                    fontSize: "14px",
                    fontWeight: "bold",
                    backgroundColor: campaign.payment_status === "FUNDED"
                      ? "#e8f5e9"
                      : campaign.payment_status === "PENDING"
                      ? "#fff3e0"
                      : "#ffebee",
                    color: campaign.payment_status === "FUNDED"
                      ? "#2e7d32"
                      : campaign.payment_status === "PENDING"
                      ? "#ef6c00"
                      : "#c62828",
                  }}
                >
                  {campaign.payment_status === "FUNDED" && "✓ Funded"}
                  {campaign.payment_status === "PENDING" && "Awaiting Payment"}
                  {campaign.payment_status === "REFUNDED" && "Refunded"}
                </span>
              </div>
              {campaign.description && (
                <p style={{ color: "#666", margin: "0 0 16px", lineHeight: "1.5" }}>
                  {campaign.description}
                </p>
              )}
              <div style={{ display: "flex", gap: "24px", color: "#666", fontSize: "14px" }}>
                <div>
                  <strong>Budget:</strong> {formatCurrency(campaign.budget_cents)}
                </div>
                <div>
                  <strong>Total Missions:</strong> {missions.length}
                </div>
                <div>
                  <strong>Created:</strong> {new Date(campaign.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {campaign.payment_status === "PENDING" && (
                <button
                  onClick={handleFundCampaign}
                  disabled={checkoutLoading}
                  style={{
                    padding: "12px 24px",
                    backgroundColor: checkoutLoading ? "#ccc" : "#ff9800",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: checkoutLoading ? "not-allowed" : "pointer",
                    fontSize: "14px",
                    fontWeight: "bold",
                  }}
                >
                  {checkoutLoading ? "Loading..." : "Fund Campaign"}
                </button>
              )}
              <button
                onClick={() => setShowMissionModal(true)}
                style={{
                  padding: "12px 24px",
                  backgroundColor: "#28a745",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: "bold",
                }}
              >
                + Add Mission
              </button>
            </div>
          </div>

          {/* Stats */}
          <div style={{
            display: "flex",
            gap: "16px",
            marginTop: "24px",
            paddingTop: "24px",
            borderTop: "1px solid #eee",
          }}>
            <div style={{
              flex: 1,
              padding: "16px",
              backgroundColor: "#f5f5f5",
              borderRadius: "8px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#333" }}>
                {formatCurrency(totalPayout)}
              </div>
              <div style={{ fontSize: "12px", color: "#666" }}>Total Allocated</div>
            </div>
            <div style={{
              flex: 1,
              padding: "16px",
              backgroundColor: "#e8f5e9",
              borderRadius: "8px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#2e7d32" }}>
                {formatCurrency(paidOut)}
              </div>
              <div style={{ fontSize: "12px", color: "#666" }}>Paid Out</div>
            </div>
            <div style={{
              flex: 1,
              padding: "16px",
              backgroundColor: "#fff3e0",
              borderRadius: "8px",
              textAlign: "center",
            }}>
              <div style={{ fontSize: "24px", fontWeight: "bold", color: "#ef6c00" }}>
                {formatCurrency(pendingPayout)}
              </div>
              <div style={{ fontSize: "12px", color: "#666" }}>Pending Payout</div>
            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{
          maxWidth: "1000px",
          margin: "0 auto 16px",
          padding: "12px",
          backgroundColor: "#ffebee",
          color: "#c62828",
          borderRadius: "4px",
        }}>
          {error}
        </div>
      )}

      {/* Missions List */}
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <h2 style={{ fontSize: "20px", marginBottom: "16px" }}>Missions</h2>

        {missions.length === 0 ? (
          <div style={{
            backgroundColor: "white",
            borderRadius: "8px",
            padding: "40px",
            textAlign: "center",
            color: "#666",
          }}>
            No missions yet. Click &quot;Add Mission&quot; to create one.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {missions.map((mission) => (
              <div
                key={mission.id}
                style={{
                  backgroundColor: "white",
                  borderRadius: "8px",
                  padding: "20px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                      <h3 style={{ margin: 0, fontSize: "18px" }}>{mission.title}</h3>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: "bold",
                          backgroundColor: statusColors[mission.state]?.bg || "#eee",
                          color: statusColors[mission.state]?.text || "#333",
                        }}
                      >
                        {mission.state}
                      </span>
                      <span style={{ fontSize: "18px", fontWeight: "bold", color: "#2e7d32" }}>
                        {formatCurrency(mission.payout_cents)}
                      </span>
                    </div>
                    {mission.brief && (
                      <p style={{ color: "#666", margin: "0 0 8px", fontSize: "14px", lineHeight: "1.4" }}>
                        {mission.brief}
                      </p>
                    )}
                    {mission.submission && (
                      <div style={{
                        marginTop: "12px",
                        padding: "12px",
                        backgroundColor: "#f5f5f5",
                        borderRadius: "4px",
                      }}>
                        <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>
                          Submission:
                        </div>
                        <a
                          href={mission.submission.tiktok_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "#0070f3", wordBreak: "break-all" }}
                        >
                          {mission.submission.tiktok_url}
                        </a>
                      </div>
                    )}
                    <div style={{ color: "#999", fontSize: "12px", marginTop: "8px" }}>
                      Updated {new Date(mission.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {mission.state === "SUBMITTED" && (
                      <>
                        <button
                          onClick={() => handleVerify(mission.id)}
                          disabled={actionLoading === mission.id}
                          style={{
                            padding: "8px 16px",
                            backgroundColor: actionLoading === mission.id ? "#ccc" : "#28a745",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: actionLoading === mission.id ? "not-allowed" : "pointer",
                            fontSize: "14px",
                          }}
                        >
                          Verify
                        </button>
                        <button
                          onClick={() => handleReject(mission.id)}
                          disabled={actionLoading === mission.id}
                          style={{
                            padding: "8px 16px",
                            backgroundColor: actionLoading === mission.id ? "#ccc" : "#dc3545",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: actionLoading === mission.id ? "not-allowed" : "pointer",
                            fontSize: "14px",
                          }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {mission.state === "VERIFIED" && (
                      <button
                        onClick={() => handlePayout(mission.id)}
                        disabled={actionLoading === mission.id}
                        style={{
                          padding: "8px 16px",
                          backgroundColor: actionLoading === mission.id ? "#ccc" : "#0070f3",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: actionLoading === mission.id ? "not-allowed" : "pointer",
                          fontSize: "14px",
                          fontWeight: "bold",
                        }}
                      >
                        {actionLoading === mission.id ? "Processing..." : "Pay Creator"}
                      </button>
                    )}
                    {mission.state === "PAID" && (
                      <span style={{
                        padding: "8px 16px",
                        backgroundColor: "#e8f5e9",
                        color: "#1b5e20",
                        borderRadius: "4px",
                        fontSize: "14px",
                        fontWeight: "bold",
                      }}>
                        Paid ✓
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Mission Modal */}
      {showMissionModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: "white",
            borderRadius: "8px",
            padding: "24px",
            width: "100%",
            maxWidth: "500px",
            margin: "20px",
          }}>
            <h2 style={{ margin: "0 0 16px", fontSize: "20px" }}>Add Mission</h2>

            {missionError && (
              <div style={{
                padding: "12px",
                backgroundColor: "#ffebee",
                color: "#c62828",
                borderRadius: "4px",
                marginBottom: "16px",
              }}>
                {missionError}
              </div>
            )}

            <form onSubmit={handleCreateMission}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
                  Mission Title
                </label>
                <input
                  type="text"
                  value={missionTitle}
                  onChange={(e) => setMissionTitle(e.target.value)}
                  placeholder="e.g., Create a 30-second TikTok video"
                  required
                  style={{
                    width: "100%",
                    padding: "12px",
                    fontSize: "16px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
                  Brief / Instructions (optional)
                </label>
                <textarea
                  value={missionBrief}
                  onChange={(e) => setMissionBrief(e.target.value)}
                  placeholder="Describe what the creator needs to do..."
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "12px",
                    fontSize: "16px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                    resize: "vertical",
                  }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
                  Payout Amount (USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={missionPayout}
                  onChange={(e) => setMissionPayout(e.target.value)}
                  placeholder="50.00"
                  required
                  style={{
                    width: "100%",
                    padding: "12px",
                    fontSize: "16px",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setShowMissionModal(false)}
                  disabled={missionLoading}
                  style={{
                    padding: "12px 24px",
                    backgroundColor: "#f5f5f5",
                    color: "#333",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    cursor: missionLoading ? "not-allowed" : "pointer",
                    fontSize: "14px",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={missionLoading || !missionTitle || !missionPayout}
                  style={{
                    padding: "12px 24px",
                    backgroundColor: missionLoading || !missionTitle || !missionPayout ? "#ccc" : "#28a745",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: missionLoading || !missionTitle || !missionPayout ? "not-allowed" : "pointer",
                    fontSize: "14px",
                    fontWeight: "bold",
                  }}
                >
                  {missionLoading ? "Creating..." : "Create Mission"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stripe Checkout Modal */}
      {showCheckout && clientSecret && campaign && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: "white",
            borderRadius: "8px",
            padding: "24px",
            width: "100%",
            maxWidth: "500px",
            margin: "20px",
          }}>
            <h2 style={{ margin: "0 0 8px", fontSize: "20px" }}>
              Fund Campaign
            </h2>
            <p style={{ color: "#666", marginBottom: "20px" }}>
              {campaign.title}
            </p>

            <StripeCheckout
              clientSecret={clientSecret}
              amount={campaign.budget_cents}
              onSuccess={handleCheckoutSuccess}
              onCancel={handleCheckoutCancel}
            />
          </div>
        </div>
      )}
    </div>
  );
}
