import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";

export default function AuditLog() {
  const navigate = useNavigate();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [actionFilter, setActionFilter] = useState("All");
  const [message, setMessage] = useState("");

  useEffect(() => {
    checkAdminAndLoadLogs();
  }, []);

  const checkAdminAndLoadLogs = async () => {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.user) {
      navigate("/");
      return;
    }

    await loadLogs();
  };

  const loadLogs = async () => {
    setLoading(true);
    setMessage("");

    const { data, error } = await supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Unable to load audit logs:", error);
      setMessage(
        error.message ||
          "The audit log could not be loaded. Confirm that the audit_logs table exists."
      );
      setLogs([]);
    } else {
      setLogs(data || []);
    }

    setLoading(false);
  };

  const filteredLogs = useMemo(() => {
    const searchValue = searchText.trim().toLowerCase();

    return logs.filter((log) => {
      const matchesSearch =
        !searchValue ||
        log.admin_email?.toLowerCase().includes(searchValue) ||
        log.action?.toLowerCase().includes(searchValue) ||
        log.target_name?.toLowerCase().includes(searchValue) ||
        log.target_type?.toLowerCase().includes(searchValue) ||
        log.details?.toLowerCase().includes(searchValue);

      const matchesAction =
        actionFilter === "All" || log.action === actionFilter;

      return matchesSearch && matchesAction;
    });
  }, [logs, searchText, actionFilter]);

  const availableActions = useMemo(() => {
    return [...new Set(logs.map((log) => log.action).filter(Boolean))].sort();
  }, [logs]);

  const stats = useMemo(() => {
    const today = new Date().toDateString();

    return {
      total: logs.length,
      today: logs.filter(
        (log) =>
          log.created_at &&
          new Date(log.created_at).toDateString() === today
      ).length,
      approvals: logs.filter((log) =>
        log.action?.toLowerCase().includes("approv")
      ).length,
      strikes: logs.filter((log) =>
        log.action?.toLowerCase().includes("strike")
      ).length,
    };
  }, [logs]);

  const formatDate = (value) => {
    if (!value) return "Unknown date";

    return new Date(value).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getActionStyle = (action = "") => {
    const value = action.toLowerCase();

    if (value.includes("approv") || value.includes("reactivat")) {
      return styles.actionGreen;
    }

    if (value.includes("suspend") || value.includes("declin")) {
      return styles.actionRed;
    }

    if (value.includes("strike")) {
      return styles.actionAmber;
    }

    return styles.actionBlue;
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.brand}>FoodBridge Detroit</div>
          <h1 style={styles.headerTitle}>Audit Log</h1>
          <p style={styles.headerSubtitle}>
            Review administrative activity across the platform.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate("/admin")}
          style={styles.backButton}
        >
          ← Dashboard
        </button>
      </header>

      <main style={styles.content}>
        {message && <div style={styles.errorMessage}>{message}</div>}

        <section style={styles.statsGrid}>
          <StatCard label="All actions" value={stats.total} />
          <StatCard label="Actions today" value={stats.today} valueColor="#1D4ED8" />
          <StatCard label="Approvals" value={stats.approvals} valueColor="#166534" />
          <StatCard label="Strike actions" value={stats.strikes} valueColor="#B45309" />
        </section>

        <section style={styles.card}>
          <div style={styles.toolbar}>
            <div>
              <h2 style={styles.sectionTitle}>Administrative activity</h2>
              <p style={styles.sectionSubtitle}>
                Showing {filteredLogs.length} of {logs.length} records
              </p>
            </div>

            <button
              type="button"
              onClick={loadLogs}
              disabled={loading}
              style={styles.refreshButton}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div style={styles.filters}>
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search admin, action, organization, or details"
              style={styles.searchInput}
            />

            <select
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
              style={styles.filterSelect}
            >
              <option value="All">All actions</option>
              {availableActions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div style={styles.stateMessage}>Loading audit records...</div>
          ) : filteredLogs.length === 0 ? (
            <div style={styles.stateMessage}>No audit records found.</div>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.tableHeader}>Date</th>
                    <th style={styles.tableHeader}>Admin</th>
                    <th style={styles.tableHeader}>Action</th>
                    <th style={styles.tableHeader}>Target</th>
                    <th style={styles.tableHeader}>Details</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log.id} style={styles.tableRow}>
                      <td style={styles.tableCell}>
                        <span style={styles.dateText}>{formatDate(log.created_at)}</span>
                      </td>
                      <td style={styles.tableCell}>
                        <div style={styles.adminText}>{log.admin_email || "Admin"}</div>
                      </td>
                      <td style={styles.tableCell}>
                        <span style={getActionStyle(log.action)}>
                          {log.action || "Administrative action"}
                        </span>
                      </td>
                      <td style={styles.tableCell}>
                        <div style={styles.targetName}>{log.target_name || "Unknown target"}</div>
                        <div style={styles.secondaryText}>{log.target_type || ""}</div>
                      </td>
                      <td style={styles.tableCell}>
                        <div style={styles.detailsText}>{log.details || "No additional details"}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
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

const styles = {
  page: { minHeight: "100vh", background: "#F4F8F4", color: "#17211A", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" },
  header: { background: "#2C5F2D", color: "#FFFFFF", padding: "24px clamp(18px, 4vw, 48px)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" },
  brand: { fontSize: 11, color: "rgba(255,255,255,.72)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 5 },
  headerTitle: { margin: 0, fontSize: 25 },
  headerSubtitle: { margin: "6px 0 0", color: "rgba(255,255,255,.78)", fontSize: 13 },
  backButton: { background: "transparent", color: "#FFFFFF", border: "1px solid rgba(255,255,255,.5)", borderRadius: 9, padding: "9px 14px", cursor: "pointer", fontWeight: 600 },
  content: { width: "min(1180px, calc(100% - 32px))", margin: "0 auto", padding: "26px 0 50px" },
  errorMessage: { background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 15px", fontSize: 13, marginBottom: 18 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 22 },
  statCard: { background: "#FFFFFF", border: "1px solid #E1E9E2", borderRadius: 14, padding: 18 },
  statValue: { fontSize: 30, fontWeight: 800 },
  statLabel: { fontWeight: 700, fontSize: 13, marginTop: 5 },
  card: { background: "#FFFFFF", border: "1px solid #DCE7DD", borderRadius: 15, overflow: "hidden" },
  toolbar: { padding: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", borderBottom: "1px solid #E8EEE9" },
  sectionTitle: { margin: 0, color: "#244D26", fontSize: 18 },
  sectionSubtitle: { margin: "5px 0 0", color: "#748077", fontSize: 12 },
  refreshButton: { background: "#EEF6EE", color: "#2C5F2D", border: "1px solid #CDE0CE", borderRadius: 8, padding: "8px 13px", cursor: "pointer", fontWeight: 600 },
  filters: { padding: "14px 20px", display: "grid", gridTemplateColumns: "minmax(240px, 1fr) 220px", gap: 10, background: "#FAFCFA", borderBottom: "1px solid #E8EEE9" },
  searchInput: { border: "1px solid #CFD9D0", borderRadius: 9, padding: "10px 12px", fontSize: 13 },
  filterSelect: { border: "1px solid #CFD9D0", borderRadius: 9, padding: "10px 12px", background: "#FFFFFF", fontSize: 13 },
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", minWidth: 900, borderCollapse: "collapse" },
  tableHeader: { textAlign: "left", padding: "13px 18px", background: "#F8FAF8", color: "#68736A", fontSize: 11, textTransform: "uppercase", letterSpacing: ".5px", borderBottom: "1px solid #E5EBE6" },
  tableRow: { borderBottom: "1px solid #EDF1ED" },
  tableCell: { padding: "15px 18px", verticalAlign: "middle", fontSize: 13 },
  dateText: { color: "#667168", fontSize: 11 },
  adminText: { fontWeight: 650, color: "#29342C" },
  targetName: { fontWeight: 700, color: "#243229" },
  secondaryText: { color: "#778078", fontSize: 11, marginTop: 4 },
  detailsText: { color: "#59635C", fontSize: 12, lineHeight: 1.45 },
  actionGreen: { display: "inline-block", background: "#ECFDF3", color: "#166534", borderRadius: 999, padding: "4px 9px", fontWeight: 700, fontSize: 11 },
  actionRed: { display: "inline-block", background: "#FEF2F2", color: "#991B1B", borderRadius: 999, padding: "4px 9px", fontWeight: 700, fontSize: 11 },
  actionAmber: { display: "inline-block", background: "#FFFBEB", color: "#B45309", borderRadius: 999, padding: "4px 9px", fontWeight: 700, fontSize: 11 },
  actionBlue: { display: "inline-block", background: "#EFF6FF", color: "#1D4ED8", borderRadius: 999, padding: "4px 9px", fontWeight: 700, fontSize: 11 },
  stateMessage: { padding: 35, color: "#748077", fontSize: 13, textAlign: "center" },
};
