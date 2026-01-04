"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";

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
}

type TabType = "available" | "my-missions";

const statusColors: Record<string, { bg: string; text: string }> = {
  OPEN: { bg: "#e3f2fd", text: "#1565c0" },
  ACCEPTED: { bg: "#fff3e0", text: "#ef6c00" },
  SUBMITTED: { bg: "#f3e5f5", text: "#7b1fa2" },
  VERIFIED: { bg: "#e8f5e9", text: "#2e7d32" },
  PAID: { bg: "#e8f5e9", text: "#1b5e20" },
  REJECTED: { bg: "#ffebee", text: "#c62828" },
};

export default function CreatorDashboard() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("available");
  const [availableMissions, setAvailableMissions] = useState<Mission[]>([]);
  const [myMissions, setMyMissions] = useState<Mission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Submit modal state
  const [submitModal, setSubmitModal] = useState<Mission | null>(null);
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const checkUserRole = useCallback(async (accessToken: string) => {
    try {
      const res = await fetch("/api/auth/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!res.ok) {
        // User not found in database, redirect to signup
        if (res.status === 404) {
          router.push("/auth/signup");
          return false;
        }
        throw new Error("Failed to fetch user role");
      }

      const user = await res.json();
      if (user.role !== "CREATOR") {
        setAccessDenied(true);
        return false;
      }
      return true;
    } catch (err) {
      console.error("Error checking user role:", err);
      setError("Failed to verify access. Please try again.");
      return false;
    }
  }, [router]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.push("/auth/signin");
        return;
      }

      const hasAccess = await checkUserRole(session.access_token);
      if (hasAccess) {
        setSession(session);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        router.push("/auth/signin");
        return;
      }

      const hasAccess = await checkUserRole(session.access_token);
      if (hasAccess) {
        setSession(session);
      }
    });

    return () => subscription.unsubscribe();
  }, [router, checkUserRole]);

  useEffect(() => {
    if (session) {
      fetchMissions();
    }
  }, [session]);

  const fetchMissions = async () => {
    if (!session) return;

    try {
      setError(null);

      // Fetch available (OPEN) missions
      const availableRes = await fetch("/api/missions?state=OPEN");
      if (availableRes.ok) {
        const data = await availableRes.json();
        setAvailableMissions(Array.isArray(data) ? data : data.data || []);
      }

      // Fetch my missions (all states except OPEN)
      const states = ["ACCEPTED", "SUBMITTED", "VERIFIED", "PAID", "REJECTED"];
      const myMissionsList: Mission[] = [];

      for (const state of states) {
        const res = await fetch(`/api/missions?state=${state}`);
        if (res.ok) {
          const data = await res.json();
          const missions = Array.isArray(data) ? data : data.data || [];
          // Filter to only include missions belonging to this creator
          const filtered = missions.filter(
            (m: Mission) => m.creator_id === session.user.id
          );
          myMissionsList.push(...filtered);
        }
      }

      // Sort by updated_at descending
      myMissionsList.sort((a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
      setMyMissions(myMissionsList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch missions");
    }
  };

  const handleAccept = async (missionId: string) => {
    if (!session) return;

    setActionLoading(missionId);
    setError(null);

    try {
      const res = await fetch(`/api/missions/${missionId}/accept`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to accept mission");
      }

      // Refresh missions
      await fetchMissions();
      setActiveTab("my-missions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept mission");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !submitModal) return;

    setSubmitLoading(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/missions/${submitModal.id}/submit`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tiktokUrl }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit mission");
      }

      // Close modal and refresh
      setSubmitModal(null);
      setTiktokUrl("");
      await fetchMissions();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitLoading(false);
    }
  };

  const formatPayout = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100);
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

  if (accessDenied) {
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        gap: "16px",
        padding: "20px",
        textAlign: "center",
      }}>
        <div style={{ fontSize: "48px" }}>🚫</div>
        <h1 style={{ fontSize: "24px", margin: 0 }}>Access Denied</h1>
        <p style={{ color: "#666", margin: 0 }}>
          This dashboard is only accessible to Creator accounts.
        </p>
        <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
          <button
            onClick={() => router.push("/")}
            style={{
              padding: "12px 24px",
              backgroundColor: "#0070f3",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Go to Home
          </button>
          <button
            onClick={() => router.push("/artist")}
            style={{
              padding: "12px 24px",
              backgroundColor: "#28a745",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            Go to Artist Dashboard
          </button>
        </div>
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
            Creator Dashboard
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
          Browse missions, accept work, and submit your content
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
          paddingBottom: "0",
        }}>
          <button
            onClick={() => setActiveTab("available")}
            style={{
              padding: "12px 24px",
              fontSize: "16px",
              backgroundColor: activeTab === "available" ? "#0070f3" : "transparent",
              color: activeTab === "available" ? "white" : "#333",
              border: "none",
              borderRadius: "4px 4px 0 0",
              cursor: "pointer",
              fontWeight: activeTab === "available" ? "bold" : "normal",
            }}
          >
            Available Missions ({availableMissions.length})
          </button>
          <button
            onClick={() => setActiveTab("my-missions")}
            style={{
              padding: "12px 24px",
              fontSize: "16px",
              backgroundColor: activeTab === "my-missions" ? "#0070f3" : "transparent",
              color: activeTab === "my-missions" ? "white" : "#333",
              border: "none",
              borderRadius: "4px 4px 0 0",
              cursor: "pointer",
              fontWeight: activeTab === "my-missions" ? "bold" : "normal",
            }}
          >
            My Missions ({myMissions.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        {activeTab === "available" && (
          <div>
            {availableMissions.length === 0 ? (
              <div style={{
                textAlign: "center",
                padding: "40px",
                color: "#666",
                backgroundColor: "white",
                borderRadius: "8px",
              }}>
                No available missions at the moment. Check back later!
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {availableMissions.map((mission) => (
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
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: "18px",
                          fontWeight: "bold",
                          marginBottom: "8px",
                        }}>
                          {mission.title}
                        </div>
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          marginBottom: "8px",
                        }}>
                          <span style={{
                            fontSize: "20px",
                            fontWeight: "bold",
                            color: "#2e7d32",
                          }}>
                            {formatPayout(mission.payout_cents)}
                          </span>
                          <span style={{
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: "bold",
                            backgroundColor: statusColors[mission.state]?.bg || "#eee",
                            color: statusColors[mission.state]?.text || "#333",
                          }}>
                            {mission.state}
                          </span>
                        </div>
                        {mission.brief && (
                          <div style={{
                            color: "#555",
                            fontSize: "14px",
                            marginBottom: "8px",
                            lineHeight: "1.4",
                          }}>
                            {mission.brief.length > 150
                              ? `${mission.brief.substring(0, 150)}...`
                              : mission.brief}
                          </div>
                        )}
                        <div style={{ color: "#999", fontSize: "12px" }}>
                          Posted {new Date(mission.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleAccept(mission.id)}
                        disabled={actionLoading === mission.id}
                        style={{
                          padding: "10px 20px",
                          backgroundColor: actionLoading === mission.id ? "#ccc" : "#0070f3",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: actionLoading === mission.id ? "not-allowed" : "pointer",
                          fontSize: "14px",
                          fontWeight: "bold",
                          alignSelf: "flex-start",
                        }}
                      >
                        {actionLoading === mission.id ? "Accepting..." : "Accept Mission"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "my-missions" && (
          <div>
            {myMissions.length === 0 ? (
              <div style={{
                textAlign: "center",
                padding: "40px",
                color: "#666",
                backgroundColor: "white",
                borderRadius: "8px",
              }}>
                You haven&apos;t accepted any missions yet.{" "}
                <button
                  onClick={() => setActiveTab("available")}
                  style={{
                    color: "#0070f3",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Browse available missions
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {myMissions.map((mission) => (
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
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: "18px",
                          fontWeight: "bold",
                          marginBottom: "8px",
                        }}>
                          {mission.title}
                        </div>
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          marginBottom: "8px",
                        }}>
                          <span style={{
                            fontSize: "20px",
                            fontWeight: "bold",
                            color: mission.state === "PAID" ? "#1b5e20" : "#333",
                          }}>
                            {formatPayout(mission.payout_cents)}
                          </span>
                          <span style={{
                            padding: "4px 8px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: "bold",
                            backgroundColor: statusColors[mission.state]?.bg || "#eee",
                            color: statusColors[mission.state]?.text || "#333",
                          }}>
                            {mission.state}
                            {mission.state === "PAID" && " ✓"}
                          </span>
                        </div>
                        <div style={{ color: "#999", fontSize: "12px" }}>
                          Updated {new Date(mission.updated_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div>
                        {mission.state === "ACCEPTED" && (
                          <button
                            onClick={() => {
                              setSubmitModal(mission);
                              setTiktokUrl("");
                              setSubmitError(null);
                            }}
                            style={{
                              padding: "10px 20px",
                              backgroundColor: "#7b1fa2",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                              fontSize: "14px",
                              fontWeight: "bold",
                            }}
                          >
                            Submit Work
                          </button>
                        )}
                        {mission.state === "SUBMITTED" && (
                          <span style={{
                            padding: "10px 20px",
                            backgroundColor: "#f3e5f5",
                            color: "#7b1fa2",
                            borderRadius: "4px",
                            fontSize: "14px",
                          }}>
                            Awaiting Review
                          </span>
                        )}
                        {mission.state === "VERIFIED" && (
                          <span style={{
                            padding: "10px 20px",
                            backgroundColor: "#e8f5e9",
                            color: "#2e7d32",
                            borderRadius: "4px",
                            fontSize: "14px",
                          }}>
                            Payment Pending
                          </span>
                        )}
                        {mission.state === "PAID" && (
                          <span style={{
                            padding: "10px 20px",
                            backgroundColor: "#e8f5e9",
                            color: "#1b5e20",
                            borderRadius: "4px",
                            fontSize: "14px",
                            fontWeight: "bold",
                          }}>
                            Paid ✓
                          </span>
                        )}
                        {mission.state === "REJECTED" && (
                          <span style={{
                            padding: "10px 20px",
                            backgroundColor: "#ffebee",
                            color: "#c62828",
                            borderRadius: "4px",
                            fontSize: "14px",
                          }}>
                            Rejected
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Submit Modal */}
      {submitModal && (
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
              Submit Mission
            </h2>
            <p style={{ color: "#666", marginBottom: "16px" }}>
              Submit your TikTok video URL for Campaign #{submitModal.campaign_id}
            </p>
            <p style={{ color: "#2e7d32", fontWeight: "bold", marginBottom: "20px" }}>
              Payout: {formatPayout(submitModal.payout_cents)}
            </p>

            {submitError && (
              <div style={{
                padding: "12px",
                backgroundColor: "#ffebee",
                color: "#c62828",
                borderRadius: "4px",
                marginBottom: "16px",
              }}>
                {submitError}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: "16px" }}>
                <label
                  htmlFor="tiktokUrl"
                  style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}
                >
                  TikTok Video URL
                </label>
                <input
                  id="tiktokUrl"
                  type="url"
                  value={tiktokUrl}
                  onChange={(e) => setTiktokUrl(e.target.value)}
                  placeholder="https://www.tiktok.com/@username/video/..."
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
                  onClick={() => setSubmitModal(null)}
                  disabled={submitLoading}
                  style={{
                    padding: "12px 24px",
                    backgroundColor: "#f5f5f5",
                    color: "#333",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    cursor: submitLoading ? "not-allowed" : "pointer",
                    fontSize: "14px",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitLoading || !tiktokUrl}
                  style={{
                    padding: "12px 24px",
                    backgroundColor: submitLoading || !tiktokUrl ? "#ccc" : "#7b1fa2",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: submitLoading || !tiktokUrl ? "not-allowed" : "pointer",
                    fontSize: "14px",
                    fontWeight: "bold",
                  }}
                >
                  {submitLoading ? "Submitting..." : "Submit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
