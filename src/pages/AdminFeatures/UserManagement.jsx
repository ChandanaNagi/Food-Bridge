import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";

export default function UserManagement() {
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);

  const [message, setMessage] = useState({
    type: "",
    text: "",
  });

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    type: "Shelter",
  });

  useEffect(() => {
    checkAdminAndLoadUsers();
  }, []);

  const normalizeStatus = (status) => {
    if (!status) return "Pending";

    const value = status.toString().trim().toLowerCase();

    if (value === "approved" || value === "active") {
      return "Approved";
    }

    if (value === "suspended") {
      return "Suspended";
    }

    if (value === "declined" || value === "rejected") {
      return "Declined";
    }

    return "Pending";
  };

  const checkAdminAndLoadUsers = async () => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      navigate("/");
      return;
    }

    await loadUsers();
  };

  const loadUsers = async () => {
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const [
        { data: restaurants, error: restaurantError },
        { data: shelters, error: shelterError },
      ] = await Promise.all([
        supabase
          .from("restaurants")
          .select("*")
          .order("name", { ascending: true }),

        supabase
          .from("shelters")
          .select("*")
          .order("name", { ascending: true }),
      ]);

      if (restaurantError) {
        throw restaurantError;
      }

      if (shelterError) {
        throw shelterError;
      }

      const restaurantUsers = (restaurants || []).map((restaurant) => ({
        ...restaurant,
        type: "Restaurant",
        status: normalizeStatus(restaurant.status),
      }));

      const shelterUsers = (shelters || []).map((shelter) => ({
        ...shelter,
        type: "Shelter",
        status: normalizeStatus(shelter.status),
      }));

      const combinedUsers = [...restaurantUsers, ...shelterUsers].sort(
        (a, b) => {
          const nameA = a.name || "";
          const nameB = b.name || "";

          return nameA.localeCompare(nameB);
        }
      );

      setUsers(combinedUsers);
    } catch (error) {
      setMessage({
        type: "error",
        text: error.message || "Unable to load users.",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateUserStatus = async (user, newStatus) => {
    const actionKey = `${user.type}-${user.id}`;
    const table =
      user.type === "Restaurant" ? "restaurants" : "shelters";

    setProcessingId(actionKey);
    setMessage({ type: "", text: "" });

    try {
      const { error } = await supabase
        .from(table)
        .update({
          status: newStatus,
        })
        .eq("id", user.id);

      if (error) {
        throw error;
      }
      // Send an approval email — only when the account is being approved,
      // not for suspend/decline/reactivate.
      if (newStatus === "Approved" && user.email) {
        try {
          await fetch("/api/send-approval-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: user.email, name: user.name }),
          });
        } catch (emailError) {
          // Don't block the approval itself if the email fails to send —
          // just log it so we know.
          console.error("Approval email failed to send:", emailError);
        }
      }

      // Log this action to the audit trail
      const {
        data: { user: adminUser },
      } = await supabase.auth.getUser();

      const { error: auditError } = await supabase.from("audit_logs").insert({
        admin_email: adminUser?.email || "Unknown admin",
        action: `${newStatus} user account`,
        target_name: user.name,
        target_type: user.type,
        details: `Status changed to ${newStatus}`,
      });

      if (auditError) {
        // Don't block the status update if only the audit log insert fails —
        // just log it so we know, since the actual approve/suspend/decline
        // already succeeded.
        console.error("Failed to write audit log:", auditError);
      }

      setUsers((currentUsers) =>
        currentUsers.map((currentUser) =>
          currentUser.id === user.id &&
          currentUser.type === user.type
            ? {
                ...currentUser,
                status: newStatus,
              }
            : currentUser
        )
      );

      setMessage({
        type: "success",
        text: `${user.name} was ${newStatus.toLowerCase()} successfully.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error.message ||
          `Unable to change ${user.name}'s status.`,
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleAddUser = async (event) => {
    event.preventDefault();

    setMessage({ type: "", text: "" });

    const cleanName = form.name.trim();
    const cleanEmail = form.email.trim().toLowerCase();

    if (!cleanName || !cleanEmail || !form.password) {
      setMessage({
        type: "error",
        text: "Please complete all required fields.",
      });
      return;
    }

    if (form.password.length < 6) {
      setMessage({
        type: "error",
        text: "Password must contain at least 6 characters.",
      });
      return;
    }

    setAdding(true);

    try {
      const {
        data: { session: adminSession },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !adminSession) {
        throw new Error(
          "Your admin session could not be found. Please sign in again."
        );
      }

      const {
        data: signUpData,
        error: signUpError,
      } = await supabase.auth.signUp({
        email: cleanEmail,
        password: form.password,
      });

      if (signUpError) {
        throw signUpError;
      }

      const newUserId = signUpData?.user?.id;

      if (!newUserId) {
        throw new Error(
          "The login was not created correctly. Check the Supabase email-confirmation setting."
        );
      }

      const table =
        form.type === "Restaurant" ? "restaurants" : "shelters";

      const { error: insertError } = await supabase
        .from(table)
        .insert({
          id: newUserId,
          name: cleanName,
          email: cleanEmail,
          status: "Pending",
        });

      /*
        supabase.auth.signUp() can change the browser session to the
        newly created account. Restore the original admin session.
      */
      const { error: restoreError } =
        await supabase.auth.setSession({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token,
        });

      if (restoreError) {
        throw new Error(
          `The user was created, but the admin session could not be restored: ${restoreError.message}`
        );
      }

      if (insertError) {
        throw new Error(
          `The login was created, but the ${form.type.toLowerCase()} profile could not be saved: ${insertError.message}`
        );
      }

      setForm({
        name: "",
        email: "",
        password: "",
        type: "Shelter",
      });

      setShowAddForm(false);

      setMessage({
        type: "success",
        text: `${cleanName} was created and is awaiting approval.`,
      });

      await loadUsers();
    } catch (error) {
      setMessage({
        type: "error",
        text: error.message || "Unable to create the user.",
      });
    } finally {
      setAdding(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const searchValue = searchText.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        !searchValue ||
        user.name?.toLowerCase().includes(searchValue) ||
        user.email?.toLowerCase().includes(searchValue);

      const matchesType =
        typeFilter === "All" || user.type === typeFilter;

      const matchesStatus =
        statusFilter === "All" ||
        normalizeStatus(user.status) === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [users, searchText, typeFilter, statusFilter]);

  const userStats = useMemo(() => {
    return {
      total: users.length,

      pending: users.filter(
        (user) => normalizeStatus(user.status) === "Pending"
      ).length,

      approved: users.filter(
        (user) => normalizeStatus(user.status) === "Approved"
      ).length,

      suspended: users.filter(
        (user) => normalizeStatus(user.status) === "Suspended"
      ).length,
    };
  }, [users]);

  const getStatusStyle = (status) => {
    const normalizedStatus = normalizeStatus(status);

    if (normalizedStatus === "Approved") {
      return styles.statusApproved;
    }

    if (normalizedStatus === "Suspended") {
      return styles.statusSuspended;
    }

    if (normalizedStatus === "Declined") {
      return styles.statusDeclined;
    }

    return styles.statusPending;
  };

  const getTypeStyle = (type) => {
    return type === "Restaurant"
      ? styles.restaurantBadge
      : styles.shelterBadge;
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.brand}>FoodBridge Detroit</div>

          <h1 style={styles.headerTitle}>User Management</h1>

          <p style={styles.headerSubtitle}>
            Review, approve and manage platform accounts.
          </p>
        </div>

        <div style={styles.headerActions}>
          <button
            type="button"
            onClick={() => navigate("/admin")}
            style={styles.backButton}
          >
            ← Dashboard
          </button>

          <button
            type="button"
            onClick={() => {
              setShowAddForm((current) => !current);
              setMessage({ type: "", text: "" });
            }}
            style={styles.addButton}
          >
            {showAddForm ? "Cancel" : "+ Add User"}
          </button>
        </div>
      </header>

      <main style={styles.content}>
        {message.text && (
          <div
            style={
              message.type === "success"
                ? styles.successMessage
                : styles.errorMessage
            }
          >
            {message.text}
          </div>
        )}

        <section style={styles.statsGrid}>
          <StatCard
            label="Total users"
            value={userStats.total}
            description="All organizations"
          />

          <StatCard
            label="Pending"
            value={userStats.pending}
            description="Awaiting approval"
            valueColor="#B45309"
          />

          <StatCard
            label="Approved"
            value={userStats.approved}
            description="Active accounts"
            valueColor="#166534"
          />

          <StatCard
            label="Suspended"
            value={userStats.suspended}
            description="Restricted accounts"
            valueColor="#991B1B"
          />
        </section>

        {showAddForm && (
          <section style={styles.formCard}>
            <div style={styles.formHeader}>
              <div>
                <h2 style={styles.formTitle}>Create a user</h2>

                <p style={styles.formSubtitle}>
                  The new organization will begin with Pending status.
                </p>
              </div>
            </div>

            <form
              onSubmit={handleAddUser}
              style={styles.formGrid}
            >
              <label style={styles.fieldGroup}>
                <span style={styles.label}>
                  Organization name
                </span>

                <input
                  type="text"
                  value={form.name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      name: event.target.value,
                    })
                  }
                  placeholder="Enter organization name"
                  style={styles.input}
                  disabled={adding}
                />
              </label>

              <label style={styles.fieldGroup}>
                <span style={styles.label}>Organization type</span>

                <select
                  value={form.type}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      type: event.target.value,
                    })
                  }
                  style={styles.input}
                  disabled={adding}
                >
                  <option value="Shelter">Shelter</option>
                  <option value="Restaurant">Restaurant</option>
                </select>
              </label>

              <label style={styles.fieldGroup}>
                <span style={styles.label}>Email address</span>

                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      email: event.target.value,
                    })
                  }
                  placeholder="organization@example.com"
                  style={styles.input}
                  disabled={adding}
                />
              </label>

              <label style={styles.fieldGroup}>
                <span style={styles.label}>
                  Temporary password
                </span>

                <input
                  type="password"
                  value={form.password}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      password: event.target.value,
                    })
                  }
                  placeholder="At least 6 characters"
                  style={styles.input}
                  disabled={adding}
                />
              </label>

              <div style={styles.formFooter}>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  style={styles.cancelButton}
                  disabled={adding}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  style={{
                    ...styles.createButton,
                    ...(adding ? styles.disabledButton : {}),
                  }}
                  disabled={adding}
                >
                  {adding ? "Creating..." : "Create user"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section style={styles.usersCard}>
          <div style={styles.toolbar}>
            <div>
              <h2 style={styles.sectionTitle}>
                Organization accounts
              </h2>

              <p style={styles.sectionSubtitle}>
                Showing {filteredUsers.length} of {users.length} users
              </p>
            </div>

            <button
              type="button"
              onClick={loadUsers}
              style={styles.refreshButton}
              disabled={loading}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div style={styles.filters}>
            <input
              type="search"
              value={searchText}
              onChange={(event) =>
                setSearchText(event.target.value)
              }
              placeholder="Search by name or email"
              style={styles.searchInput}
            />

            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value)
              }
              style={styles.filterSelect}
            >
              <option value="All">All types</option>
              <option value="Restaurant">Restaurants</option>
              <option value="Shelter">Shelters</option>
            </select>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
              style={styles.filterSelect}
            >
              <option value="All">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Suspended">Suspended</option>
              <option value="Declined">Declined</option>
            </select>
          </div>

          {loading ? (
            <div style={styles.stateMessage}>
              Loading users...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div style={styles.stateMessage}>
              No users match the selected filters.
            </div>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.tableHeader}>
                      Organization
                    </th>

                    <th style={styles.tableHeader}>Type</th>

                    <th style={styles.tableHeader}>Status</th>

                    <th style={styles.tableHeader}>
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredUsers.map((user) => {
                    const status = normalizeStatus(user.status);
                    const actionKey = `${user.type}-${user.id}`;
                    const isProcessing =
                      processingId === actionKey;

                    return (
                      <tr
                        key={actionKey}
                        style={styles.tableRow}
                      >
                        <td style={styles.tableCell}>
                          <div style={styles.userName}>
                            {user.name || "Unnamed organization"}
                          </div>

                          <div style={styles.userEmail}>
                            {user.email || "No email provided"}
                          </div>
                        </td>

                        <td style={styles.tableCell}>
                          <span style={getTypeStyle(user.type)}>
                            {user.type}
                          </span>
                        </td>

                        <td style={styles.tableCell}>
                          <span style={getStatusStyle(status)}>
                            {status}
                          </span>
                        </td>

                        <td style={styles.tableCell}>
                          <div style={styles.actionGroup}>
                            {status !== "Approved" && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateUserStatus(
                                    user,
                                    "Approved"
                                  )
                                }
                                style={styles.approveButton}
                                disabled={isProcessing}
                              >
                                {isProcessing
                                  ? "Updating..."
                                  : status === "Suspended"
                                  ? "Reactivate"
                                  : "Approve"}
                              </button>
                            )}

                            {status !== "Suspended" && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateUserStatus(
                                    user,
                                    "Suspended"
                                  )
                                }
                                style={styles.suspendButton}
                                disabled={isProcessing}
                              >
                                Suspend
                              </button>
                            )}

                            {status === "Pending" && (
                              <button
                                type="button"
                                onClick={() =>
                                  updateUserStatus(
                                    user,
                                    "Declined"
                                  )
                                }
                                style={styles.declineButton}
                                disabled={isProcessing}
                              >
                                Decline
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  description,
  valueColor = "#2C5F2D",
}) {
  return (
    <div style={styles.statCard}>
      <div
        style={{
          ...styles.statValue,
          color: valueColor,
        }}
      >
        {value}
      </div>

      <div style={styles.statLabel}>{label}</div>

      <div style={styles.statDescription}>
        {description}
      </div>
    </div>
  );
}

const styles = { page: { minHeight: "100vh", background: "#F4F8F4", color: "#17211A", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif", },
 header: { background: "#2C5F2D", color: "#FFFFFF", padding: "24px clamp(18px, 4vw, 48px)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap", },
 brand: { fontSize: 11, color: "rgba(255,255,255,.72)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 5, },
 headerTitle: { margin: 0, fontSize: 25, lineHeight: 1.2, },
 headerSubtitle: { margin: "6px 0 0", color: "rgba(255,255,255,.78)", fontSize: 13, },
 headerActions: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", },
 backButton: { background: "transparent", color: "#FFFFFF", border: "1px solid rgba(255,255,255,.5)", borderRadius: 9, padding: "9px 14px", cursor: "pointer", fontWeight: 600, },
 addButton: { background: "#FFFFFF", color: "#2C5F2D", border: "none", borderRadius: 9, padding: "10px 16px", cursor: "pointer", fontWeight: 700, },
 content: { width: "min(1180px, calc(100% - 32px))", margin: "0 auto", padding: "26px 0 50px", },
 successMessage: { background: "#ECFDF3", color: "#166534", border: "1px solid #BBF7D0", borderRadius: 10, padding: "12px 15px", fontSize: 13, marginBottom: 18, },
 errorMessage: { background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 15px", fontSize: 13, marginBottom: 18, },
 statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 22, },
 statCard: { background: "#FFFFFF", border: "1px solid #E1E9E2", borderRadius: 14, padding: 18, boxShadow: "0 4px 14px rgba(27, 62, 31, 0.04)", },
 statValue: { fontSize: 30, fontWeight: 800, lineHeight: 1, marginBottom: 8, },
 statLabel: { fontWeight: 700, fontSize: 13, },
 statDescription: { color: "#6B756D", fontSize: 11, marginTop: 4, },
 formCard: { background: "#FFFFFF", border: "1px solid #DCE7DD", borderRadius: 15, padding: 20, marginBottom: 22, boxShadow: "0 5px 20px rgba(27, 62, 31, 0.05)", },
 formHeader: { marginBottom: 17, },
 formTitle: { margin: 0, fontSize: 18, color: "#244D26", },
 formSubtitle: { margin: "5px 0 0", color: "#6B756D", fontSize: 12, },
 formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16, },
 fieldGroup: { display: "flex", flexDirection: "column", gap: 6, },
 label: { fontSize: 12, fontWeight: 700, color: "#36423A", },
 input: { width: "100%", boxSizing: "border-box", border: "1px solid #CBD8CC", borderRadius: 9, padding: "11px 12px", background: "#FFFFFF", fontSize: 13, outline: "none", },
 formFooter: { gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4, },
 cancelButton: { background: "#FFFFFF", color: "#465249", border: "1px solid #CBD8CC", borderRadius: 9, padding: "10px 16px", cursor: "pointer", fontWeight: 600, },
 createButton: { background: "#2C5F2D", color: "#FFFFFF", border: "none", borderRadius: 9, padding: "10px 18px", cursor: "pointer", fontWeight: 700, },
 disabledButton: { opacity: 0.65, cursor: "not-allowed", },
 usersCard: { background: "#FFFFFF", border: "1px solid #DCE7DD", borderRadius: 15, overflow: "hidden", boxShadow: "0 5px 20px rgba(27, 62, 31, 0.05)", },
 toolbar: { padding: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", borderBottom: "1px solid #E8EEE9", },
 sectionTitle: { margin: 0, color: "#244D26", fontSize: 18, },
 sectionSubtitle: { margin: "5px 0 0", color: "#748077", fontSize: 12, },
 refreshButton: { background: "#EEF6EE", color: "#2C5F2D", border: "1px solid #CDE0CE", borderRadius: 8, padding: "8px 13px", cursor: "pointer", fontWeight: 600, },
 filters: { padding: "14px 20px", display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 180px 180px", gap: 10, background: "#FAFCFA", borderBottom: "1px solid #E8EEE9", },
 searchInput: { border: "1px solid #CFD9D0", borderRadius: 9, padding: "10px 12px", fontSize: 13, minWidth: 0, },
 filterSelect: { border: "1px solid #CFD9D0", borderRadius: 9, padding: "10px 12px", background: "#FFFFFF", fontSize: 13, },
 tableWrapper: { overflowX: "auto", },
 table: { width: "100%", borderCollapse: "collapse", minWidth: 760, },
 tableHeader: { textAlign: "left", padding: "13px 18px", background: "#F8FAF8", color: "#68736A", fontSize: 11, textTransform: "uppercase", letterSpacing: ".5px", borderBottom: "1px solid #E5EBE6", },
 tableRow: { borderBottom: "1px solid #EDF1ED", },
 tableCell: { padding: "15px 18px", verticalAlign: "middle", fontSize: 13, },
 userName: { fontWeight: 700, color: "#243229", },
 userEmail: { color: "#778078", fontSize: 11, marginTop: 4, },
 restaurantBadge: { display: "inline-block", background: "#EFF6FF", color: "#1D4ED8", borderRadius: 999, padding: "4px 9px", fontWeight: 700, fontSize: 11, },
 shelterBadge: { display: "inline-block", background: "#F5F3FF", color: "#6D28D9", borderRadius: 999, padding: "4px 9px", fontWeight: 700, fontSize: 11, },
 statusApproved: { display: "inline-block", background: "#ECFDF3", color: "#166534", borderRadius: 999, padding: "4px 9px", fontWeight: 700, fontSize: 11, },
 statusPending: { display: "inline-block", background: "#FFFBEB", color: "#B45309", borderRadius: 999, padding: "4px 9px", fontWeight: 700, fontSize: 11, },
 statusSuspended: { display: "inline-block", background: "#FEF2F2", color: "#991B1B", borderRadius: 999, padding: "4px 9px", fontWeight: 700, fontSize: 11, },
 statusDeclined: { display: "inline-block", background: "#F3F4F6", color: "#4B5563", borderRadius: 999, padding: "4px 9px", fontWeight: 700, fontSize: 11, },
 actionGroup: { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", },
 approveButton: { background: "#2C5F2D", color: "#FFFFFF", border: "none", borderRadius: 7, padding: "7px 11px", cursor: "pointer", fontSize: 11, fontWeight: 700, },
 suspendButton: { background: "#FFF7ED", color: "#9A3412", border: "1px solid #FED7AA", borderRadius: 7, padding: "7px 11px", cursor: "pointer", fontSize: 11, fontWeight: 700, },
 declineButton: { background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 7, padding: "7px 11px", cursor: "pointer", fontSize: 11, fontWeight: 700, },
 stateMessage: { padding: 35, color: "#748077", fontSize: 13, textAlign: "center", },
 };