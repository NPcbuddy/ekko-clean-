"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";

interface Campaign {
  id: number;
  artist_id: number;
  title: string;
  budget_cents: number;
  currency: string;
  payment_intent_id: string | null;
  created_at: string;
}

interface Mission {
  id: string;
  campaign_id: number;
  creator_id: string | null;
  state: string;
  payout_cents: number;
  created_at: string;
  updated_at: string;
}

interface MissionWithSubmission extends Mission {
  submission?: {
    id: string;
    mission_id: string;
    tiktok_url: string;
    created_at: string;
  } | null;
}

type TabType = "campaigns" | "reviews";

const statusColors: Record<string, { bg: string; text: string }> = {
  OPEN: { bg: "#e3f2fd", text: "#1565c0" },
  ACCEPTED: { bg: "#fff3e0", text: "#ef6c00" },
  SUBMITTED: { bg: "#f3e5f5", text: "#7b1fa2" },
  VERIFIED: { bg: "#e8f5e9", text: "#2e7d32" },
  PAID: { bg: "#e8f5e9", text: "#1b5e20" },
  REJECTED: { bg: "#ffebee", text: "#c62828" },
};

export default function ArtistDashboard() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("campaigns");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignMissions, setCampaignMissions] = useState<Record<number, Mission[]>>({});
  const [pendingReviews, setPendingReviews] = useState<MissionWithSubmission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedCampaign, setExpandedCampaign] = useState<number | null>(null);

  // Create Campaign modal state
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignBudget, setCampaignBudget] = useState("");
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [campaignLoading, setCampaignLoading] = useState(false);

  // Create Mission modal state
  const [missionModalCampaign, setMissionModalCampaign] = useState<Campaign | null>(null);
  const [missionPayout, setMissionPayout] = useState("");
  const [missionError, setMissionError] = useState<string | null>(null);
  const [missionLoading, setMissionLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
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
  }, [session]);

  const fetchData = async () => {
    if (!session) return;

    try {
      setError(null);

      // Fetch all campaigns (we'll display all for now since we're using DEV_ARTIST_ID)
      const campaignsRes = await fetch("/api/campaigns");
      if (campaignsRes.ok) {
        const data = await campaignsRes.json();
        const campaignList = Array.isArray(data) ? data : data.data || [];
        setCampaigns(campaignList);

        // Fetch missions for each campaign
        const missionsMap: Record<number, Mission[]> = {};
        for (const campaign of campaignList) {
          const missionsRes = await fetch(`/api/campaigns/${campaign.id}/missions`);
          if (missionsRes.ok) {
            const missionsData = await missionsRes.json();
            missionsMap[campaign.id] = Array.isArray(missionsData) ? missionsData : missionsData.data || [];
          }
        }
        setCampaignMissions(missionsMap);
      }

      // Fetch pending reviews (SUBMITTED missions)
      const reviewsRes = await fetch("/api/missions?state=SUBMITTED");
      if (reviewsRes.ok) {
        const data = await reviewsRes.json();
        const submittedMissions = Array.isArray(data) ? data : data.data || [];

        // Fetch submission details for each
        const reviewsWithSubmissions: MissionWithSubmission[] = [];
        for (const mission of submittedMissions) {
          const detailRes = await fetch(`/api/missions/${mission.id}`);
          if (detailRes.ok) {
            const detail = await detailRes.json();
            reviewsWithSubmissions.push(detail);
          }
        }
        setPendingReviews(reviewsWithSubmissions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;

    setCampaignLoading(true);
    setCampaignError(null);

    try {
      const budgetCents = Math.round(parseFloat(campaignBudget) * 100);
      if (isNaN(budgetCents) || budgetCents < 100) {
        throw new Error("Budget must be at least $1.00");
      }

      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: campaignTitle,
          budgetCents,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create campaign");
      }

      setShowCampaignModal(false);
      setCampaignTitle("");
      setCampaignBudget("");
      await fetchData();
    } catch (err) {
      setCampaignError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setCampaignLoading(false);
    }
  };

  const handleCreateMission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !missionModalCampaign) return;

    setMissionLoading(true);
    setMissionError(null);

    try {
      const payoutCents = Math.round(parseFloat(missionPayout) * 100);
      if (isNaN(payoutCents) || payoutCents < 100) {
        throw new Error("Payout must be at least $1.00");
      }

      const res = await fetch(`/api/campaigns/${missionModalCampaign.id}/missions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payoutCents,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create mission");
      }

      setMissionModalCampaign(null);
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

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
  };

  const getMissionCounts = (campaignId: number) => {
    const missions = campaignMissions[campaignId] || [];
    const counts: Record<string, number> = {};
    missions.forEach((m) => {
      counts[m.state] = (counts[m.state] || 0) + 1;
    });
    return counts;
  };

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

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#f5f5f5",
      padding: "20px",
    }}>
      {/* Header */}
      <div style={{
        maxWidth: "900px",
        margin: "0 auto",
        marginBottom: "24px",
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <h1 style={{ fontSize: "28px", fontWeight: "bold", margin: 0 }}>
            Artist Dashboard
          </h1>
          <button
            onClick={() => router.push("/")}
            style={{
              padding: "8px 16px",
              backgroundColor: "#6c757d",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Back to Home
          </button>
        </div>
        <p style={{ color: "#666", marginTop: "8px" }}>
          Manage campaigns, create missions, and review submissions
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{
          maxWidth: "900px",
          margin: "0 auto 16px",
          padding: "12px",
          backgroundColor: "#ffebee",
          color: "#c62828",
          borderRadius: "4px",
        }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{
        maxWidth: "900px",
        margin: "0 auto",
        marginBottom: "20px",
      }}>
        <div style={{
          display: "flex",
          gap: "8px",
          borderBottom: "2px solid #ddd",
        }}>
          <button
            onClick={() => setActiveTab("campaigns")}
            style={{
              padding: "12px 24px",
              fontSize: "16px",
              backgroundColor: activeTab === "campaigns" ? "#0070f3" : "transparent",
              color: activeTab === "campaigns" ? "white" : "#333",
              border: "none",
              borderRadius: "4px 4px 0 0",
              cursor: "pointer",
              fontWeight: activeTab === "campaigns" ? "bold" : "normal",
            }}
          >
            My Campaigns ({campaigns.length})
          </button>
          <button
            onClick={() => setActiveTab("reviews")}
            style={{
              padding: "12px 24px",
              fontSize: "16px",
              backgroundColor: activeTab === "reviews" ? "#0070f3" : "transparent",
              color: activeTab === "reviews" ? "white" : "#333",
              border: "none",
              borderRadius: "4px 4px 0 0",
              cursor: "pointer",
              fontWeight: activeTab === "reviews" ? "bold" : "normal",
            }}
          >
            Pending Reviews ({pendingReviews.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        {activeTab === "campaigns" && (
          <div>
            <button
              onClick={() => setShowCampaignModal(true)}
              style={{
                marginBottom: "20px",
                padding: "12px 24px",
                backgroundColor: "#0070f3",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "16px",
                fontWeight: "bold",
              }}
            >
              + Create Campaign
            </button>

            {campaigns.length === 0 ? (
              <div style={{
                textAlign: "center",
                padding: "40px",
                color: "#666",
                backgroundColor: "white",
                borderRadius: "8px",
              }}>
                No campaigns yet. Create your first campaign to get started!
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {campaigns.map((campaign) => {
                  const counts = getMissionCounts(campaign.id);
                  const missions = campaignMissions[campaign.id] || [];
                  const isExpanded = expandedCampaign === campaign.id;

                  return (
                    <div
                      key={campaign.id}
                      style={{
                        backgroundColor: "white",
                        borderRadius: "8px",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          padding: "20px",
                          cursor: "pointer",
                        }}
                        onClick={() => setExpandedCampaign(isExpanded ? null : campaign.id)}
                      >
                        <div style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                        }}>
                          <div>
                            <h3 style={{ margin: "0 0 8px", fontSize: "20px" }}>
                              {campaign.title}
                            </h3>
                            <div style={{ color: "#666", fontSize: "14px", marginBottom: "8px" }}>
                              Budget: {formatCurrency(campaign.budget_cents)}
                            </div>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                              {Object.entries(counts).map(([state, count]) => (
                                <span
                                  key={state}
                                  style={{
                                    padding: "2px 8px",
                                    borderRadius: "4px",
                                    fontSize: "12px",
                                    backgroundColor: statusColors[state]?.bg || "#eee",
                                    color: statusColors[state]?.text || "#333",
                                  }}
                                >
                                  {count} {state}
                                </span>
                              ))}
                              {missions.length === 0 && (
                                <span style={{ color: "#999", fontSize: "12px" }}>
                                  No missions yet
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setMissionModalCampaign(campaign);
                                setMissionPayout("");
                                setMissionError(null);
                              }}
                              style={{
                                padding: "8px 16px",
                                backgroundColor: "#28a745",
                                color: "white",
                                border: "none",
                                borderRadius: "4px",
                                cursor: "pointer",
                                fontSize: "14px",
                              }}
                            >
                              + Add Mission
                            </button>
                            <span style={{ color: "#999", fontSize: "20px" }}>
                              {isExpanded ? "▼" : "▶"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {isExpanded && missions.length > 0 && (
                        <div style={{
                          borderTop: "1px solid #eee",
                          padding: "16px 20px",
                          backgroundColor: "#fafafa",
                        }}>
                          <h4 style={{ margin: "0 0 12px", fontSize: "14px", color: "#666" }}>
                            Missions
                          </h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {missions.map((mission) => (
                              <div
                                key={mission.id}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  padding: "12px",
                                  backgroundColor: "white",
                                  borderRadius: "4px",
                                  border: "1px solid #eee",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                  <span style={{ fontWeight: "bold" }}>
                                    {formatCurrency(mission.payout_cents)}
                                  </span>
                                  <span style={{
                                    padding: "2px 8px",
                                    borderRadius: "4px",
                                    fontSize: "12px",
                                    backgroundColor: statusColors[mission.state]?.bg || "#eee",
                                    color: statusColors[mission.state]?.text || "#333",
                                  }}>
                                    {mission.state}
                                  </span>
                                </div>
                                <span style={{ color: "#999", fontSize: "12px" }}>
                                  {new Date(mission.created_at).toLocaleDateString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "reviews" && (
          <div>
            {pendingReviews.length === 0 ? (
              <div style={{
                textAlign: "center",
                padding: "40px",
                color: "#666",
                backgroundColor: "white",
                borderRadius: "8px",
              }}>
                No submissions pending review.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {pendingReviews.map((mission) => (
                  <div
                    key={mission.id}
                    style={{
                      backgroundColor: "white",
                      borderRadius: "8px",
                      padding: "20px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                    }}
                  >
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}>
                      <div>
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          marginBottom: "8px",
                        }}>
                          <span style={{ fontSize: "20px", fontWeight: "bold" }}>
                            {formatCurrency(mission.payout_cents)}
                          </span>
                          <span style={{
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: "bold",
                            backgroundColor: statusColors.SUBMITTED.bg,
                            color: statusColors.SUBMITTED.text,
                          }}>
                            SUBMITTED
                          </span>
                        </div>
                        <div style={{ color: "#666", fontSize: "14px", marginBottom: "8px" }}>
                          Campaign #{mission.campaign_id}
                        </div>
                        {mission.submission && (
                          <div style={{ marginBottom: "12px" }}>
                            <span style={{ color: "#666", fontSize: "14px" }}>TikTok: </span>
                            <a
                              href={mission.submission.tiktok_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "#0070f3", fontSize: "14px" }}
                            >
                              {mission.submission.tiktok_url}
                            </a>
                          </div>
                        )}
                        <div style={{ color: "#999", fontSize: "12px" }}>
                          Submitted {new Date(mission.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          onClick={() => handleVerify(mission.id)}
                          disabled={actionLoading === mission.id}
                          style={{
                            padding: "10px 20px",
                            backgroundColor: actionLoading === mission.id ? "#ccc" : "#28a745",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: actionLoading === mission.id ? "not-allowed" : "pointer",
                            fontSize: "14px",
                            fontWeight: "bold",
                          }}
                        >
                          {actionLoading === mission.id ? "..." : "Verify"}
                        </button>
                        <button
                          onClick={() => handleReject(mission.id)}
                          disabled={actionLoading === mission.id}
                          style={{
                            padding: "10px 20px",
                            backgroundColor: actionLoading === mission.id ? "#ccc" : "#dc3545",
                            color: "white",
                            border: "none",
                            borderRadius: "4px",
                            cursor: actionLoading === mission.id ? "not-allowed" : "pointer",
                            fontSize: "14px",
                            fontWeight: "bold",
                          }}
                        >
                          {actionLoading === mission.id ? "..." : "Reject"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Campaign Modal */}
      {showCampaignModal && (
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
            <h2 style={{ margin: "0 0 16px", fontSize: "20px" }}>
              Create Campaign
            </h2>

            {campaignError && (
              <div style={{
                padding: "12px",
                backgroundColor: "#ffebee",
                color: "#c62828",
                borderRadius: "4px",
                marginBottom: "16px",
              }}>
                {campaignError}
              </div>
            )}

            <form onSubmit={handleCreateCampaign}>
              <div style={{ marginBottom: "16px" }}>
                <label
                  htmlFor="campaignTitle"
                  style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}
                >
                  Campaign Title
                </label>
                <input
                  id="campaignTitle"
                  type="text"
                  value={campaignTitle}
                  onChange={(e) => setCampaignTitle(e.target.value)}
                  placeholder="Enter campaign title"
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
                <label
                  htmlFor="campaignBudget"
                  style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}
                >
                  Budget (USD)
                </label>
                <input
                  id="campaignBudget"
                  type="number"
                  step="0.01"
                  min="1"
                  value={campaignBudget}
                  onChange={(e) => setCampaignBudget(e.target.value)}
                  placeholder="100.00"
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
                  onClick={() => setShowCampaignModal(false)}
                  disabled={campaignLoading}
                  style={{
                    padding: "12px 24px",
                    backgroundColor: "#f5f5f5",
                    color: "#333",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    cursor: campaignLoading ? "not-allowed" : "pointer",
                    fontSize: "14px",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={campaignLoading || !campaignTitle || !campaignBudget}
                  style={{
                    padding: "12px 24px",
                    backgroundColor: campaignLoading || !campaignTitle || !campaignBudget ? "#ccc" : "#0070f3",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: campaignLoading || !campaignTitle || !campaignBudget ? "not-allowed" : "pointer",
                    fontSize: "14px",
                    fontWeight: "bold",
                  }}
                >
                  {campaignLoading ? "Creating..." : "Create Campaign"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Mission Modal */}
      {missionModalCampaign && (
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
              Add Mission
            </h2>
            <p style={{ color: "#666", marginBottom: "16px" }}>
              Campaign: {missionModalCampaign.title}
            </p>

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
                <label
                  htmlFor="missionPayout"
                  style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}
                >
                  Payout Amount (USD)
                </label>
                <input
                  id="missionPayout"
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
                  onClick={() => setMissionModalCampaign(null)}
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
                  disabled={missionLoading || !missionPayout}
                  style={{
                    padding: "12px 24px",
                    backgroundColor: missionLoading || !missionPayout ? "#ccc" : "#28a745",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: missionLoading || !missionPayout ? "not-allowed" : "pointer",
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
    </div>
  );
}
