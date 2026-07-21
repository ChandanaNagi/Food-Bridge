import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";

export default function AssignmentManagement() {
  const navigate = useNavigate();

  const [assignments, setAssignments] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [dateFilter, setDateFilter] = useState("upcoming");
  const [message, setMessage] = useState({ type: "", text: "" });

  const [form, setForm] = useState({
    restaurant_id: "",
    shelter_id: "",
    assignment_date: getTodayValue(),
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const [
        { data: assignmentRows, error: assignmentError },
        { data: restaurantRows, error: restaurantError },
        { data: shelterRows, error: shelterError },
      ] = await Promise.all([
        supabase
          .from("assignments")
          .select("*, restaurants(name), shelters(name)")
          .order("assignment_date", { ascending: false }),
        supabase
          .from("restaurants")
          .select("id, name, status")
          .order("name", { ascending: true }),
        supabase
          .from("shelters")
          .select("id, name, status")
          .order("name", { ascending: true }),
      ]);

      if (assignmentError) throw assignmentError;
      if (restaurantError) throw restaurantError;
      if (shelterError) throw shelterError;

      setAssignments(assignmentRows || []);
      setRestaurants((restaurantRows || []).filter((r) => (r.status || "").toLowerCase() === "approved"));
      setShelters((shelterRows || []).filter((s) => (s.status || "").toLowerCase() === "approved"));
    } catch (err) {
      console.error("Assignment management error:", err);
      setMessage({ type: "error", text: err.message || "Assignments could not be loaded." });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    setMessage({ type: "", text: "" });

    if (!form.restaurant_id || !form.shelter_id || !form.assignment_date) {
      setMessage({ type: "error", text: "Please choose a restaurant, a shelter, and a date." });
      return;
    }

    setCreating(true);

    try {
      // Prevent double-booking: one restaurant shouldn't have two assignments on the same day.
      const { data: existing, error: existingError } = await supabase
        .from("assignments")
        .select("id")
        .eq("restaurant_id", form.restaurant_id)
        .eq("assignment_date", form.assignment_date)
        .limit(1);

      if (existingError) throw existingError;

      if (existing && existing.length > 0) {
        setMessage({
          type: "error",
          text: "This restaurant already has an assignment on that date. Delete it first if you want to replace it.",
        });
        setCreating(false);
        return;
      }

      const { error: insertError } = await supabase.from("assignments").insert({
        restaurant_id: form.restaurant_id,
        shelter_id: form.shelter_id,
        assignment_date: form.assignment_date,
        status: "pending",
      });

      if (insertError) throw insertError;

      setMessage({ type: "success", text: "Assignment created." });
      setForm((current) => ({ ...current, restaurant_id: "", shelter_id: "" }));
      await loadData();
    } catch (err) {
      console.error("Create assignment error:", err);
      setMessage({ type: "error", text: err.message || "The assignment could not be created." });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (assignment) => {
    const confirmed = window.confirm(
      `Delete the assignment between ${assignment.restaurants?.name || "this restaurant"} and ${
        assignment.shelters?.name || "this shelter"
      } on ${assignment.assignment_date}?`
    );

    if (!confirmed) return;

    setDeletingId(assignment.id);
    setMessage({ type: "", text: "" });

    try {
      const { error: deleteError } = await supabase
        .from("assignments")
        .delete()
        .eq("id", assignment.id);

      if (deleteError) throw deleteError;

      setMessage({ type: "success", text: "Assignment deleted." });
      await loadData();
    } catch (err) {
      console.error("Delete assignment error:", err);
      setMessage({ type: "error", text: err.message || "The assignment could not be deleted." });
    } finally {
      setDeletingId(null);
    }
  };

  const today = getTodayValue();

  const filteredAssignments = useMemo(() => {
    if (dateFilter === "today") {
      return assignments.filter((a) => a.assignment_date === today);
    }
    if (dateFilter === "upcoming") {
      return assignments.filter((a) => a.assignment_date >= today);
    }
    if (dateFilter === "past") {
      return assignments.filter((a) => a.assignment_date < today);
    }
    return assignments;
  }, [assignments, dateFilter, today]);

  const stats = useMemo(() => {
    return {
      total: assignments.length,
      today: assignments.filter((a) => a.assignment_date === today).length,
      upcoming: assignments.filter((a) => a.assignment_date > today).length,
    };
  }, [assignments, today]);

  if (loading) {
    return <div style={styles.loading}>Loading assignments...</div>;
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.brand}>FoodBridge Detroit</div>
          <h1 style={styles.headerTitle}>Assignment Management</h1>
          <p style={styles.headerSubtitle}>
            Pair restaurants with shelters for daily surplus pickups.
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
          <StatCard label="Total assignments" value={stats.total} />
          <StatCard label="Today" value={stats.today} valueColor="#166534" />
          <StatCard label="Upcoming" value={stats.upcoming} valueColor="#1D4ED8" />
        </section>

        <section style={styles.formCard}>
          <h2 style={styles.sectionTitle}>Create a new assignment</h2>
          <p style={styles.sectionSubtitle}>
            Only approved restaurants and shelters are shown below.
          </p>

          <form onSubmit={handleCreate} style={styles.formGrid}>
            <label style={styles.fieldGroup}>
              <span style={styles.label}>Restaurant</span>
              <select
                value={form.restaurant_id}
                onChange={(e) => setForm({ ...form, restaurant_id: e.target.value })}
                style={styles.input}
                disabled={creating}
              >
                <option value="">Select a restaurant</option>
                {restaurants.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </label>

            <label style={styles.fieldGroup}>
              <span style={styles.label}>Shelter</span>
              <select
                value={form.shelter_id}
                onChange={(e) => setForm({ ...form, shelter_id: e.target.value })}
                style={styles.input}
                disabled={creating}
              >
                <option value="">Select a shelter</option>
                {shelters.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            <label style={styles.fieldGroup}>
              <span style={styles.label}>Date</span>
              <input
                type="date"
                value={form.assignment_date}
                onChange={(e) => setForm({ ...form, assignment_date: e.target.value })}
                style={styles.input}
                disabled={creating}
              />
            </label>

            <div style={styles.formFooter}>
              <button type="submit" style={styles.createButton} disabled={creating}>
                {creating ? "Creating..." : "Create assignment"}
              </button>
            </div>
          </form>
        </section>

        <section style={styles.listCard}>
          <div style={styles.toolbar}>
            <h2 style={styles.sectionTitle}>Assignments</h2>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={styles.filterSelect}
            >
              <option value="today">Today</option>
              <option value="upcoming">Today and upcoming</option>
              <option value="past">Past</option>
              <option value="all">All</option>
            </select>
          </div>

          {filteredAssignments.length === 0 ? (
            <div style={styles.emptyState}>No assignments match this filter.</div>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.tableHeader}>Date</th>
                    <th style={styles.tableHeader}>Restaurant</th>
                    <th style={styles.tableHeader}>Shelter</th>
                    <th style={styles.tableHeader}>Status</th>
                    <th style={styles.tableHeader}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssignments.map((assignment) => (
                    <tr key={assignment.id}>
                      <td style={styles.tableCell}>{assignment.assignment_date}</td>
                      <td style={styles.tableCellStrong}>{assignment.restaurants?.name || "Unknown"}</td>
                      <td style={styles.tableCellStrong}>{assignment.shelters?.name || "Unknown"}</td>
                      <td style={styles.tableCell}>
                        <span style={statusStyle(assignment.status)}>{assignment.status || "pending"}</span>
                      </td>
                      <td style={styles.tableCell}>
                        <button
                          type="button"
                          onClick={() => handleDelete(assignment)}
                          disabled={deletingId === assignment.id}
                          style={styles.deleteButton}
                        >
                          {deletingId === assignment.id ? "Deleting..." : "Delete"}
                        </button>
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

function statusStyle(status) {
  const value = (status || "").toLowerCase();
  if (value === "confirmed") return styles.badgeGreen;
  if (value === "declined" || value === "reassigning") return styles.badgeRed;
  return styles.badgeAmber;
}

function getTodayValue() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60 * 1000);
  return localDate.toISOString().split("T")[0];
}

const styles = {
  page: { minHeight: "100vh", background: "#F4F8F4", color: "#17211A", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" },
  loading: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F8F4", color: "#657067" },
  header: { background: "#2C5F2D", color: "#FFFFFF", padding: "24px clamp(18px, 4vw, 48px)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" },
  brand: { fontSize: 11, color: "rgba(255,255,255,.72)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 5 },
  headerTitle: { margin: 0, fontSize: 25 },
  headerSubtitle: { margin: "6px 0 0", color: "rgba(255,255,255,.78)", fontSize: 13 },
  backButton: { background: "transparent", color: "#FFFFFF", border: "1px solid rgba(255,255,255,.5)", borderRadius: 9, padding: "9px 14px", cursor: "pointer", fontWeight: 600 },
  content: { width: "min(1180px, calc(100% - 32px))", margin: "0 auto", padding: "26px 0 50px" },
  successBanner: { background: "#ECFDF3", color: "#166534", border: "1px solid #BBF7D0", borderRadius: 10, padding: "12px 15px", fontSize: 13, marginBottom: 18 },
  errorBanner: { background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 15px", fontSize: 13, marginBottom: 18 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 22 },
  statCard: { background: "#FFFFFF", border: "1px solid #E1E9E2", borderRadius: 14, padding: 18 },
  statValue: { fontSize: 29, fontWeight: 800 },
  statLabel: { marginTop: 5, fontSize: 12, fontWeight: 750 },
  formCard: { background: "#FFFFFF", border: "1px solid #DCE7DD", borderRadius: 15, padding: 20, marginBottom: 22 },
  sectionTitle: { margin: 0, fontSize: 18, color: "#244D26" },
  sectionSubtitle: { margin: "5px 0 0", color: "#748077", fontSize: 12 },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: 16 },
  fieldGroup: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, fontWeight: 700, color: "#36423A" },
  input: { width: "100%", boxSizing: "border-box", border: "1px solid #CBD8CC", borderRadius: 9, padding: "11px 12px", background: "#FFFFFF", fontSize: 13 },
  formFooter: { display: "flex", alignItems: "flex-end" },
  createButton: { background: "#2C5F2D", color: "#FFFFFF", border: "none", borderRadius: 9, padding: "11px 18px", cursor: "pointer", fontWeight: 700, width: "100%" },
  listCard: { background: "#FFFFFF", border: "1px solid #DCE7DD", borderRadius: 15, overflow: "hidden" },
  toolbar: { padding: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", borderBottom: "1px solid #E8EEE9" },
  filterSelect: { border: "1px solid #CFD9D0", borderRadius: 9, padding: "9px 12px", background: "#FFFFFF", fontSize: 13 },
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", minWidth: 700, borderCollapse: "collapse" },
  tableHeader: { textAlign: "left", padding: "13px 18px", background: "#F8FAF8", color: "#68736A", fontSize: 11, textTransform: "uppercase", letterSpacing: ".5px", borderBottom: "1px solid #E5EBE6" },
  tableCell: { padding: "13px 18px", fontSize: 13, borderBottom: "1px solid #EDF1ED" },
  tableCellStrong: { padding: "13px 18px", fontSize: 13, fontWeight: 700, color: "#243229", borderBottom: "1px solid #EDF1ED" },
  deleteButton: { background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 7, padding: "7px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer" },
  emptyState: { padding: 35, textAlign: "center", color: "#748077", fontSize: 13 },
  badgeGreen: { display: "inline-block", background: "#ECFDF3", color: "#166534", borderRadius: 999, padding: "4px 9px", fontWeight: 700, fontSize: 11 },
  badgeAmber: { display: "inline-block", background: "#FFFBEB", color: "#B45309", borderRadius: 999, padding: "4px 9px", fontWeight: 700, fontSize: 11 },
  badgeRed: { display: "inline-block", background: "#FEF2F2", color: "#991B1B", borderRadius: 999, padding: "4px 9px", fontWeight: 700, fontSize: 11 },
};