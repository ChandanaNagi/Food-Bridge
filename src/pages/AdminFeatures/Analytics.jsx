import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";

export default function Analytics() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [donations, setDonations] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30");

  useEffect(() => { loadAnalytics(); }, [period]);

  const loadAnalytics = async () => {
    setLoading(true);
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) { navigate("/"); return; }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(period));
    const isoStart = startDate.toISOString();

    const [
      { data: assignmentRows },
      { data: donationRows },
      { data: restaurantRows },
      { data: shelterRows },
    ] = await Promise.all([
      supabase.from("assignments").select("*, restaurants(name), shelters(name)").gte("created_at", isoStart).order("created_at", { ascending: true }),
      supabase.from("donations").select("*").gte("posted_at", isoStart).order("posted_at", { ascending: true }),
      supabase.from("restaurants").select("*"),
      supabase.from("shelters").select("*"),
    ]);

    setAssignments(assignmentRows || []);
    setDonations(donationRows || []);
    setRestaurants(restaurantRows || []);
    setShelters(shelterRows || []);
    setLoading(false);
  };

  const stats = useMemo(() => {
    const confirmed = assignments.filter((item) => item.status?.toLowerCase() === "confirmed").length;
    const completedDonations = donations.filter((item) => ["collected", "completed", "confirmed"].includes(item.status?.toLowerCase())).length;
    const activeOrganizations = [...restaurants, ...shelters].filter((item) => !item.status || ["approved", "active"].includes(item.status.toLowerCase())).length;
    return {
      assignments: assignments.length,
      confirmed,
      confirmationRate: assignments.length > 0 ? Math.round((confirmed / assignments.length) * 100) : 0,
      donations: donations.length,
      completedDonations,
      activeOrganizations,
    };
  }, [assignments, donations, restaurants, shelters]);

  const dailyRows = useMemo(() => {
    const map = {};
    assignments.forEach((assignment) => {
      const dateValue = assignment.assignment_date || assignment.created_at;
      if (!dateValue) return;
      const key = new Date(dateValue).toISOString().split("T")[0];
      if (!map[key]) map[key] = { date: key, total: 0, confirmed: 0 };
      map[key].total += 1;
      if (assignment.status?.toLowerCase() === "confirmed") map[key].confirmed += 1;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).slice(-10);
  }, [assignments]);

  const topRestaurants = useMemo(() => {
    const counts = {};
    assignments.forEach((assignment) => {
      const name = assignment.restaurants?.name || "Unknown restaurant";
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [assignments]);

  const topShelters = useMemo(() => {
    const counts = {};
    assignments.forEach((assignment) => {
      const name = assignment.shelters?.name || "Unknown shelter";
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [assignments]);

  const maxDaily = Math.max(...dailyRows.map((row) => row.total), 1);
  const formatDate = (value) => new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.brand}>FoodBridge Detroit</div>
          <h1 style={styles.headerTitle}>Analytics Hub</h1>
          <p style={styles.headerSubtitle}>Review assignment, donation, and participation trends.</p>
        </div>
        <div style={styles.headerActions}>
          <select value={period} onChange={(event) => setPeriod(event.target.value)} style={styles.periodSelect}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </select>
          <button type="button" onClick={() => navigate("/admin")} style={styles.backButton}>← Dashboard</button>
        </div>
      </header>

      <main style={styles.content}>
        <section style={styles.statsGrid}>
          <StatCard label="Assignments" value={stats.assignments} />
          <StatCard label="Confirmed" value={stats.confirmed} valueColor="#166534" />
          <StatCard label="Confirmation rate" value={`${stats.confirmationRate}%`} valueColor="#1D4ED8" />
          <StatCard label="Donations posted" value={stats.donations} valueColor="#7C3AED" />
          <StatCard label="Completed donations" value={stats.completedDonations} valueColor="#B45309" />
          <StatCard label="Active organizations" value={stats.activeOrganizations} />
        </section>

        {loading ? (
          <div style={styles.loadingCard}>Loading analytics...</div>
        ) : (
          <>
            <section style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.cardTitle}>Assignment activity</h2>
                  <p style={styles.cardSubtitle}>Daily assignments and confirmations</p>
                </div>
                <button onClick={loadAnalytics} style={styles.refreshButton}>Refresh</button>
              </div>

              {dailyRows.length === 0 ? (
                <div style={styles.emptyState}>No assignment activity found.</div>
              ) : (
                <div style={styles.chart}>
                  {dailyRows.map((row) => (
                    <div key={row.date} style={styles.chartColumn}>
                      <div style={styles.barArea}>
                        <div title={`${row.total} assignments`} style={{ ...styles.totalBar, height: `${Math.max((row.total / maxDaily) * 150, 8)}px` }} />
                        <div title={`${row.confirmed} confirmed`} style={{ ...styles.confirmedBar, height: `${Math.max((row.confirmed / maxDaily) * 150, row.confirmed ? 8 : 0)}px` }} />
                      </div>
                      <div style={styles.chartValue}>{row.total}</div>
                      <div style={styles.chartLabel}>{formatDate(row.date)}</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={styles.legend}>
                <span style={styles.legendItem}><span style={styles.legendTotal} />Assignments</span>
                <span style={styles.legendItem}><span style={styles.legendConfirmed} />Confirmed</span>
              </div>
            </section>

            <section style={styles.rankGrid}>
              <RankingCard title="Top restaurants" subtitle="Most assignments in the selected period" rows={topRestaurants} />
              <RankingCard title="Top shelters" subtitle="Most assignments in the selected period" rows={topShelters} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, valueColor = "#2C5F2D" }) { return <div style={styles.statCard}><div style={{ ...styles.statValue, color: valueColor }}>{value}</div><div style={styles.statLabel}>{label}</div></div>; }
function RankingCard({ title, subtitle, rows }) {
  const maxValue = Math.max(...rows.map((row) => row.total), 1);
  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}><div><h2 style={styles.cardTitle}>{title}</h2><p style={styles.cardSubtitle}>{subtitle}</p></div></div>
      {rows.length === 0 ? <div style={styles.emptyState}>No data available.</div> : (
        <div style={styles.rankingList}>
          {rows.map((row, index) => (
            <div key={row.name} style={styles.rankingRow}>
              <div style={styles.rankNumber}>{index + 1}</div>
              <div style={styles.rankContent}>
                <div style={styles.rankTop}><span style={styles.rankName}>{row.name}</span><span style={styles.rankValue}>{row.total}</span></div>
                <div style={styles.progressTrack}><div style={{ ...styles.progressFill, width: `${(row.total / maxValue) * 100}%` }} /></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#F4F8F4", color: "#17211A", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" },
  header: { background: "#2C5F2D", color: "#FFFFFF", padding: "24px clamp(18px, 4vw, 48px)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" },
  brand: { fontSize: 11, color: "rgba(255,255,255,.72)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 5 }, headerTitle: { margin: 0, fontSize: 25 }, headerSubtitle: { margin: "6px 0 0", color: "rgba(255,255,255,.78)", fontSize: 13 },
  headerActions: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }, periodSelect: { background: "#FFFFFF", color: "#2C5F2D", border: "none", borderRadius: 9, padding: "9px 12px", fontWeight: 650 }, backButton: { background: "transparent", color: "#FFFFFF", border: "1px solid rgba(255,255,255,.5)", borderRadius: 9, padding: "9px 14px", cursor: "pointer", fontWeight: 600 },
  content: { width: "min(1220px, calc(100% - 32px))", margin: "0 auto", padding: "26px 0 50px" }, statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 22 }, statCard: { background: "#FFFFFF", border: "1px solid #E1E9E2", borderRadius: 14, padding: 18 }, statValue: { fontSize: 29, fontWeight: 800 }, statLabel: { marginTop: 5, fontSize: 12, fontWeight: 750 },
  card: { background: "#FFFFFF", border: "1px solid #DCE7DD", borderRadius: 15, overflow: "hidden" }, cardHeader: { padding: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 15, flexWrap: "wrap", borderBottom: "1px solid #E8EEE9" }, cardTitle: { margin: 0, color: "#244D26", fontSize: 18 }, cardSubtitle: { margin: "5px 0 0", color: "#748077", fontSize: 12 }, refreshButton: { background: "#EEF6EE", color: "#2C5F2D", border: "1px solid #CDE0CE", borderRadius: 8, padding: "8px 13px", cursor: "pointer", fontWeight: 600 },
  loadingCard: { background: "#FFFFFF", border: "1px solid #DCE7DD", borderRadius: 15, padding: 40, textAlign: "center", color: "#748077" }, chart: { minHeight: 230, padding: "28px 22px 15px", display: "flex", alignItems: "flex-end", gap: 14, overflowX: "auto" }, chartColumn: { minWidth: 58, flex: 1, textAlign: "center" }, barArea: { height: 160, display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 4 }, totalBar: { width: 15, background: "#B7CFBA", borderRadius: "5px 5px 0 0" }, confirmedBar: { width: 15, background: "#2C5F2D", borderRadius: "5px 5px 0 0" }, chartValue: { marginTop: 7, fontSize: 11, fontWeight: 750, color: "#344138" }, chartLabel: { marginTop: 3, fontSize: 10, color: "#7A847D" },
  legend: { padding: "0 22px 20px", display: "flex", gap: 18, justifyContent: "center" }, legendItem: { display: "flex", alignItems: "center", gap: 6, color: "#657067", fontSize: 11 }, legendTotal: { width: 10, height: 10, borderRadius: 3, background: "#B7CFBA" }, legendConfirmed: { width: 10, height: 10, borderRadius: 3, background: "#2C5F2D" },
  rankGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20, marginTop: 20 }, rankingList: { padding: 16 }, rankingRow: { display: "flex", alignItems: "center", gap: 12, padding: "11px 4px", borderBottom: "1px solid #EDF1ED" }, rankNumber: { width: 28, height: 28, borderRadius: 9, background: "#EAF5EB", color: "#2C5F2D", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }, rankContent: { flex: 1 }, rankTop: { display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }, rankName: { fontSize: 12, fontWeight: 700, color: "#2C3730" }, rankValue: { fontSize: 11, fontWeight: 800, color: "#2C5F2D" }, progressTrack: { height: 6, borderRadius: 999, background: "#EDF2EE", overflow: "hidden" }, progressFill: { height: "100%", borderRadius: 999, background: "#73A779" }, emptyState: { padding: 35, textAlign: "center", color: "#748077", fontSize: 13 },
};