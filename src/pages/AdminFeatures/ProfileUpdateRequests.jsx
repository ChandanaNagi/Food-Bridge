import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";

export default function ProfileUpdateRequests() {
  const navigate = useNavigate();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [message, setMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const { data, error } = await supabase
        .from("profile_update_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setRequests(data || []);
    } catch (err) {
      console.error("Load profile update requests error:", err);
      setMessage({ type: "error", text: err.message || "Requests could not be loaded." });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (request) => {
    setProcessingId(request.id);
    setMessage({ type: "", text: "" });

    const table = request.organization_type === "Restaurant" ? "restaurants" : "shelters";

    try {
      // Apply the requested changes to the actual organization row.
      const { error: updateError } = await supabase
        .from(table)
        .update({
          name: request.requested_name || undefined,
          email: request.requested_email || undefined,
          address: request.requested_address || undefined,
          phone: request.requested_phone || undefined,
        })
        .eq("id", request.organization_id);

      if (updateError) throw updateError;

      const { error: requestError } = await supabase
        .from("profile_update_requests")
        .update({ status: "Approved", reviewed_at: new Date().toISOString() })
        .eq("id", request.id);

      if (requestError) throw requestError;

      const {
        data: { user: adminUser },
      } = await supabase.auth.getUser();

      await supabase.from("audit_logs").insert({
        admin_email: adminUser?.email || "Unknown admin",
        action: "Approved profile update request",
        target_name: request.requested_name || request.current_name,
        target_type: request.organization_type,
        details: `Profile changes applied for ${request.current_name}.`,
      });

      setMessage({ type: "success", text: `${request.current_name}'s profile was updated.` });
      await loadRequests();
    } catch (err) {
      console.error("Approve request error:", err);
      setMessage({ type: "error", text: err.message || "The request could not be approved." });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (request) => {
    setProcessingId(request.id);
    setMessage({ type: "", text: "" });

    try {
      const { error: requestError } = await supabase
        .from("profile_update_requests")
        .update({ status: "Rejected", reviewed_at: new Date().toISOString() })
        .eq("id", request.id);

      if (requestError) throw requestError;

      const {
        data: { user: adminUser },
      } = await supabase.auth.getUser();

      await supabase.from("audit_logs").insert({
        admin_email: adminUser?.email || "Unknown admin",
        action: "Rejected profile update request",
        target_name: request.current_name,
        target_type: request.organization_type,
        details: "Profile update request was rejected.",
      });

      setMessage({ type: "success", text: `Request from ${request.current_name} was rejected.` });
      await loadRequests();
    } catch (err) {
      console.error("Reject request error:", err);
      setMessage({ type: "error", text: err.message || "The request could not be rejected." });
    } finally {
      setProcessingId(null);
    }
  };

  const filteredRequests = useMemo(() => {
    if (statusFilter === "All") return requests;
    return requests.filter((r) => r.status === statusFilter);
  }, [requests, statusFilter]);

  const stats = useMemo(() => {
    return {
      pending: requests.filter((r) => r.status === "Pending").length,
      approved: requests.filter((r) => r.status === "Approved").length,
      rejected: requests.filter((r) => r.status === "Rejected").length,
    };
  }, [requests]);

  if (loading) {
    return <div style={styles.loading}>Loading profile update requests...</div>;
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.brand}>FoodBridge Detroit</div>
          <h1 style={styles.headerTitle}>Profile Update Requests</h1>
          <p style={styles.headerSubtitle}>
            Review changes restaurants and shelters have requested to their profiles.
          </p>
        </div>
        <button type="button" onClick={() => navigate("/admin")} style={styles.backButton}>
          ← Dashboard
        </button>
      </header>

      <main style={styles.content}>
        {message.text && (
          <div style={message.type === "success" ? styles.successBanner : styles.errorBanner}>
            {message.text}
          </div>
        )}

        <section style={styles.statsGrid}>
          <StatCard label="Pending" value={stats.pending} valueColor="#B45309" />
          <StatCard label="Approved" value={stats.approved} valueColor="#166534" />
          <StatCard label="Rejected" value={stats.rejected} valueColor="#991B1B" />
        </section>

        <section style={styles.toolbar}>
          <div style={styles.toolbarTitle}>Requests</div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
            <option value="All">All</option>
          </select>
        </section>

        {filteredRequests.length === 0 ? (
          <div style={styles.emptyState}>No requests match this filter.</div>
        ) : (
          filteredRequests.map((request) => (
            <div key={request.id} style={styles.requestCard}>
              <div style={styles.requestHeader}>
                <div>
                  <div style={styles.requestOrgName}>{request.current_name}</div>
                  <div style={styles.requestOrgType}>{request.organization_type}</div>
                </div>
                <span style={statusStyle(request.status)}>{request.status}</span>
              </div>

              <div style={styles.changesGrid}>
                <ChangeRow label="Name" oldValue={request.current_name} newValue={request.requested_name} />
                <ChangeRow label="Email" newValue={request.requested_email} />
                <ChangeRow label="Address" newValue={request.requested_address} />
                <ChangeRow label="Phone" newValue={request.requested_phone} />
              </div>

              <div style={styles.requestMeta}>
                Requested {new Date(request.created_at).toLocaleString()}
              </div>

              {request.status === "Pending" && (
                <div style={styles.actionRow}>
                  <button
                    type="button"
                    onClick={() => handleReject(request)}
                    disabled={processingId === request.id}
                    style={styles.rejectButton}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprove(request)}
                    disabled={processingId === request.id}
                    style={styles.approveButton}
                  >
                    {processingId === request.id ? "Saving..." : "Approve"}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, valueColor = "#2C5F2D" }) {
  return (
    <div style={styles.statCard}>
      <div style={{ ...styles.statValue, color: valueColor }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function ChangeRow({ label, oldValue, newValue }) {
  if (!newValue) return null;

  return (
    <div style={styles.changeRow}>
      <span style={styles.changeLabel}>{label}</span>
      <span style={styles.changeValue}>
        {oldValue && oldValue !== newValue ? (
          <>
            <span style={styles.oldValue}>{oldValue}</span> → {newValue}
          </>
        ) : (
          newValue
        )}
      </span>
    </div>
  );
}

function statusStyle(status) {
  if (status === "Approved") return styles.badgeGreen;
  if (status === "Rejected") return styles.badgeRed;
  return styles.badgeAmber;
}

const styles = {
  page: { minHeight: "100vh", background: "#F4F8F4", color: "#17211A", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" },
  loading: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F8F4", color: "#657067" },
  header: { background: "#2C5F2D", color: "#FFFFFF", padding: "24px clamp(18px, 4vw, 48px)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" },
  brand: { fontSize: 11, color: "rgba(255,255,255,.72)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 5 },
  headerTitle: { margin: 0, fontSize: 25 },
  headerSubtitle: { margin: "6px 0 0", color: "rgba(255,255,255,.78)", fontSize: 13 },
  backButton: { background: "transparent", color: "#FFFFFF", border: "1px solid rgba(255,255,255,.5)", borderRadius: 9, padding: "9px 14px", cursor: "pointer", fontWeight: 600 },
  content: { width: "min(900px, calc(100% - 32px))", margin: "0 auto", padding: "26px 0 50px" },
  successBanner: { background: "#ECFDF3", color: "#166534", border: "1px solid #BBF7D0", borderRadius: 10, padding: "12px 15px", fontSize: 13, marginBottom: 18 },
  errorBanner: { background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 15px", fontSize: 13, marginBottom: 18 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 18 },
  statCard: { background: "#FFFFFF", border: "1px solid #E1E9E2", borderRadius: 14, padding: 18 },
  statValue: { fontSize: 29, fontWeight: 800 },
  statLabel: { marginTop: 5, fontSize: 12, fontWeight: 750 },
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  toolbarTitle: { fontSize: 16, fontWeight: 700, color: "#244D26" },
  filterSelect: { border: "1px solid #CFD9D0", borderRadius: 9, padding: "9px 12px", background: "#FFFFFF", fontSize: 13 },
  emptyState: { padding: 40, textAlign: "center", color: "#748077", fontSize: 13, background: "#FFFFFF", border: "1px dashed #CBD8CC", borderRadius: 14 },
  requestCard: { background: "#FFFFFF", border: "1px solid #DCE7DD", borderRadius: 15, padding: 18, marginBottom: 14 },
  requestHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  requestOrgName: { fontSize: 16, fontWeight: 700, color: "#243229" },
  requestOrgType: { fontSize: 12, color: "#748077", marginTop: 2 },
  changesGrid: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 },
  changeRow: { display: "flex", gap: 10, fontSize: 13 },
  changeLabel: { minWidth: 60, color: "#748077", fontWeight: 700 },
  changeValue: { color: "#243229" },
  oldValue: { color: "#9CA3AF", textDecoration: "line-through" },
  requestMeta: { fontSize: 11, color: "#9CA3AF", marginBottom: 12 },
  actionRow: { display: "flex", justifyContent: "flex-end", gap: 10 },
  approveButton: { background: "#2C5F2D", color: "#fff", border: "none", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  rejectButton: { background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 9, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  badgeGreen: { display: "inline-block", background: "#ECFDF3", color: "#166534", borderRadius: 999, padding: "4px 9px", fontWeight: 700, fontSize: 11 },
  badgeAmber: { display: "inline-block", background: "#FFFBEB", color: "#B45309", borderRadius: 999, padding: "4px 9px", fontWeight: 700, fontSize: 11 },
  badgeRed: { display: "inline-block", background: "#FEF2F2", color: "#991B1B", borderRadius: 999, padding: "4px 9px", fontWeight: 700, fontSize: 11 },
};