import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [assignments, setAssignments] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [strikes, setStrikes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adminEmail, setAdminEmail] = useState("");

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    setLoading(true);
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) { navigate("/"); return; }
    setAdminEmail(session.user.email || "Admin");
    const today = new Date().toISOString().split("T")[0];

    const [
      { data: assignmentRows },
      { data: restaurantRows },
      { data: shelterRows },
      { data: strikeRows },
    ] = await Promise.all([
      supabase.from("assignments").select("*, restaurants(name), shelters(name)").eq("assignment_date", today).order("created_at", { ascending: false }),
      supabase.from("restaurants").select("*"),
      supabase.from("shelters").select("*"),
      supabase.from("strikes").select("*"),
    ]);

    setAssignments(assignmentRows || []);
    setRestaurants(restaurantRows || []);
    setShelters(shelterRows || []);
    setStrikes(strikeRows || []);
    setLoading(false);
  };

  const stats = useMemo(() => {
    const confirmed = assignments.filter((item) => item.status?.toLowerCase() === "confirmed").length;
    const pending = assignments.filter((item) => ["pending", "posted"].includes(item.status?.toLowerCase())).length;
    const declined = assignments.filter((item) => ["declined", "reassigning"].includes(item.status?.toLowerCase())).length;
    const pendingUsers = [...restaurants, ...shelters].filter((item) => item.status?.toLowerCase() === "pending").length;
    return {
      assignments: assignments.length,
      confirmed,
      pending,
      declined,
      pendingUsers,
      activeStrikes: strikes.filter((strike) => !strike.status || strike.status === "Active").length,
    };
  }, [assignments, restaurants, shelters, strikes]);

  const handleSignOut = async () => { await supabase.auth.signOut(); navigate("/"); };
  const getStatusStyle = (status = "") => {
    const value = status.toLowerCase();
    if (value === "confirmed") return styles.badgeGreen;
    if (value === "declined" || value === "reassigning") return styles.badgeRed;
    return styles.badgeAmber;
  };

  if (loading) return <div style={styles.loading}>Loading admin dashboard...</div>;

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.brand}>FoodBridge Detroit</div>
          <h1 style={styles.headerTitle}>Admin Dashboard</h1>
          <p style={styles.headerSubtitle}>Monitor assignments, organizations, and platform activity.</p>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.adminIdentity}>
            <span style={styles.adminLabel}>Admin</span>
            <span style={styles.adminEmail}>{adminEmail}</span>
          </div>
          <button onClick={handleSignOut} style={styles.signOut}>Sign out</button>
        </div>
      </header>

      <main style={styles.body}>
        <section style={styles.statsGrid}>
          <StatCard label="Today's pairs" value={stats.assignments} />
          <StatCard label="Confirmed" value={stats.confirmed} valueColor="#166534" />
          <StatCard label="Pending responses" value={stats.pending} valueColor="#B45309" />
          <StatCard label="Declined" value={stats.declined} valueColor="#991B1B" />
          <StatCard label="Pending users" value={stats.pendingUsers} valueColor="#1D4ED8" />
          <StatCard label="Active strikes" value={stats.activeStrikes} valueColor="#7C3AED" />
        </section>

        <section style={styles.layout}>
          <div style={styles.mainColumn}>
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.cardTitle}>Today's assignments</h2>
                  <p style={styles.cardSubtitle}>Restaurant-to-shelter matches scheduled for today</p>
                </div>
                <button onClick={loadDashboard} style={styles.refreshButton}>Refresh</button>
              </div>
              {assignments.length === 0 ? (
                <div style={styles.emptyState}>No assignments today.</div>
              ) : (
                <div style={styles.assignmentList}>
                  {assignments.map((assignment) => (
                    <div key={assignment.id} style={styles.assignmentRow}>
                      <div>
                        <div style={styles.restaurantName}>{assignment.restaurants?.name || "Restaurant"}</div>
                        <div style={styles.shelterName}>→ {assignment.shelters?.name || "Shelter"}</div>
                      </div>
                      <span style={getStatusStyle(assignment.status)}>{assignment.status || "pending"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.impactCard}>
              <h2 style={styles.impactTitle}>Today's platform impact</h2>
              <div style={styles.impactGrid}>
                <ImpactItem label="Assignments" value={stats.assignments} />
                <ImpactItem label="Confirmed" value={stats.confirmed} />
                <ImpactItem label="Participation rate" value={stats.assignments > 0 ? `${Math.round((stats.confirmed / stats.assignments) * 100)}%` : "N/A"} />
              </div>
            </div>
          </div>

          <nav style={styles.sidebar}>
            <div style={styles.sidebarTitle}>ADMIN TOOLS</div>
            <NavButton title="Assignment Management" subtitle="Pair restaurants with shelters" onClick={() => navigate("/admin/assignments")} />
            <NavButton title="User Management" subtitle="Approve and manage organizations" onClick={() => navigate("/admin/users")} />
            <NavButton title="Strike Management" subtitle="Issue and review penalties" onClick={() => navigate("/admin/strikes")} />
            <NavButton title="Donation Heat Map" subtitle="View donation activity by location" onClick={() => navigate("/admin/map")} />
            <NavButton title="Audit Log" subtitle="Track administrative actions" onClick={() => navigate("/admin/audit")} />
            <NavButton title="Analytics Hub" subtitle="Review performance trends" onClick={() => navigate("/admin/analytics")} />
          </nav>
        </section>
      </main>
    </div>
  );
}

function StatCard({ label, value, valueColor = "#2C5F2D" }) { return <div style={styles.statCard}><div style={{ ...styles.statValue, color: valueColor }}>{value}</div><div style={styles.statLabel}>{label}</div><div style={styles.statNote}>Current</div></div>; }
function ImpactItem({ label, value }) { return <div style={styles.impactItem}><div style={styles.impactValue}>{value}</div><div style={styles.impactLabel}>{label}</div></div>; }
function NavButton({ title, subtitle, onClick }) { return <button type="button" onClick={onClick} style={styles.navButton}><span style={styles.navTitle}>{title}</span><span style={styles.navSubtitle}>{subtitle}</span></button>; }

const styles = {
  page: { minHeight: "100vh", background: "#F4F8F4", color: "#17211A", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" },
  header: { background: "#2C5F2D", color: "#FFFFFF", padding: "24px clamp(18px, 4vw, 48px)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" },
  brand: { fontSize: 11, color: "rgba(255,255,255,.72)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 5 },
  headerTitle: { margin: 0, fontSize: 27 },
  headerSubtitle: { margin: "6px 0 0", color: "rgba(255,255,255,.78)", fontSize: 13 },
  headerRight: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  adminIdentity: { display: "flex", flexDirection: "column", alignItems: "flex-end" },
  adminLabel: { fontSize: 11, fontWeight: 800 }, adminEmail: { fontSize: 10, color: "rgba(255,255,255,.72)" },
  signOut: { background: "transparent", color: "#FFFFFF", border: "1px solid rgba(255,255,255,.5)", borderRadius: 9, padding: "9px 14px", cursor: "pointer", fontWeight: 600 },
  body: { width: "min(1280px, calc(100% - 32px))", margin: "0 auto", padding: "26px 0 50px" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 14, marginBottom: 22 },
  statCard: { background: "#FFFFFF", border: "1px solid #E1E9E2", borderRadius: 14, padding: 17 },
  statValue: { fontSize: 29, fontWeight: 800 }, statLabel: { marginTop: 5, fontSize: 12, fontWeight: 750 }, statNote: { marginTop: 3, fontSize: 10, color: "#7A847D" },
  layout: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 285px", gap: 22, alignItems: "start" },
  mainColumn: { display: "flex", flexDirection: "column", gap: 20 },
  card: { background: "#FFFFFF", border: "1px solid #DCE7DD", borderRadius: 15, overflow: "hidden" },
  cardHeader: { padding: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 15, flexWrap: "wrap", borderBottom: "1px solid #E8EEE9" },
  cardTitle: { margin: 0, color: "#244D26", fontSize: 18 }, cardSubtitle: { margin: "5px 0 0", color: "#748077", fontSize: 12 },
  refreshButton: { background: "#EEF6EE", color: "#2C5F2D", border: "1px solid #CDE0CE", borderRadius: 8, padding: "8px 13px", cursor: "pointer", fontWeight: 600 },
  assignmentList: { padding: 14 }, assignmentRow: { padding: 14, border: "1px solid #E7ECE8", borderRadius: 11, marginBottom: 9, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 },
  restaurantName: { fontWeight: 750, color: "#263229" }, shelterName: { marginTop: 4, color: "#748077", fontSize: 12 },
  badgeGreen: { background: "#ECFDF3", color: "#166534", padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700 },
  badgeAmber: { background: "#FFFBEB", color: "#B45309", padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700 },
  badgeRed: { background: "#FEF2F2", color: "#991B1B", padding: "4px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700 },
  emptyState: { padding: 38, textAlign: "center", color: "#748077", fontSize: 13 },
  impactCard: { background: "#EAF5EB", border: "1px solid #CFE1D1", borderRadius: 15, padding: 20 }, impactTitle: { margin: "0 0 16px", color: "#245C2B", fontSize: 17 },
  impactGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }, impactItem: { background: "rgba(255,255,255,.7)", borderRadius: 11, padding: 14 }, impactValue: { fontSize: 24, fontWeight: 800, color: "#245C2B" }, impactLabel: { marginTop: 4, fontSize: 11, color: "#5D6B60" },
  sidebar: { background: "#FFFFFF", border: "1px solid #DCE7DD", borderRadius: 15, padding: 14, position: "sticky", top: 20 }, sidebarTitle: { padding: "6px 8px 12px", color: "#6B756D", fontSize: 10, fontWeight: 800, letterSpacing: ".8px" },
  navButton: { width: "100%", textAlign: "left", background: "#FFFFFF", border: "1px solid transparent", borderRadius: 10, padding: "12px 11px", marginBottom: 5, cursor: "pointer", display: "flex", flexDirection: "column", gap: 3 }, navTitle: { color: "#2C3A30", fontSize: 13, fontWeight: 750 }, navSubtitle: { color: "#7A847D", fontSize: 10, lineHeight: 1.35 },
  loading: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F8F4", color: "#657067" },
};