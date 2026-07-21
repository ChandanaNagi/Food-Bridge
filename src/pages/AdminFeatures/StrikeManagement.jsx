import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";

export default function StrikeManagement() {
  const navigate = useNavigate();

  const [organizations, setOrganizations] = useState([]);
  const [strikes, setStrikes] = useState([]);

  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");

  const [showStrikeForm, setShowStrikeForm] = useState(false);
  const [selectedOrganization, setSelectedOrganization] = useState(null);
  const [strikeReason, setStrikeReason] = useState("");
  const [submittingStrike, setSubmittingStrike] = useState(false);

  const [historyOrganization, setHistoryOrganization] = useState(null);

  const [message, setMessage] = useState({
    type: "",
    text: "",
  });

  useEffect(() => {
    checkAdminAndLoadData();
  }, []);

  const checkAdminAndLoadData = async () => {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.user) {
      navigate("/");
      return;
    }

    await loadData();
  };

  const loadData = async () => {
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const [
        { data: restaurants, error: restaurantError },
        { data: shelters, error: shelterError },
        { data: strikeRows, error: strikeError },
      ] = await Promise.all([
        supabase
          .from("restaurants")
          .select("*")
          .order("name", { ascending: true }),

        supabase
          .from("shelters")
          .select("*")
          .order("name", { ascending: true }),

        supabase
          .from("strikes")
          .select("*")
          .order("created_at", { ascending: false }),
      ]);

      if (restaurantError) throw restaurantError;
      if (shelterError) throw shelterError;
      if (strikeError) throw strikeError;

      const restaurantOrganizations = (restaurants || []).map(
        (restaurant) => ({
          ...restaurant,
          type: "Restaurant",
          sourceTable: "restaurants",
        })
      );

      const shelterOrganizations = (shelters || []).map((shelter) => ({
        ...shelter,
        type: "Shelter",
        sourceTable: "shelters",
      }));

      setOrganizations([
        ...restaurantOrganizations,
        ...shelterOrganizations,
      ]);

      setStrikes(strikeRows || []);
    } catch (error) {
      console.error("Unable to load strike management data:", error);

      setMessage({
        type: "error",
        text:
          error.message ||
          "Strike management data could not be loaded.",
      });
    } finally {
      setLoading(false);
    }
  };

  const getOrganizationKey = (organization) =>
    `${organization.type}-${organization.id}`;

  const getActiveStrikes = (organization) => {
    return strikes.filter(
      (strike) =>
        strike.organization_id === organization.id &&
        strike.organization_type === organization.type &&
        strike.status === "Active"
    );
  };

  const getStrikeCount = (organization) => {
    return getActiveStrikes(organization).length;
  };

  const getDisplayStatus = (organization) => {
    const strikeCount = getStrikeCount(organization);

    if (
      strikeCount >= 3 ||
      organization.status?.toLowerCase() === "suspended"
    ) {
      return "Suspended";
    }

    if (strikeCount > 0) {
      return "Warning";
    }

    return "Good Standing";
  };

  const openStrikeForm = (organization) => {
    setSelectedOrganization(organization);
    setStrikeReason("");
    setShowStrikeForm(true);
    setMessage({ type: "", text: "" });
  };

  const closeStrikeForm = () => {
    if (submittingStrike) return;

    setShowStrikeForm(false);
    setSelectedOrganization(null);
    setStrikeReason("");
  };

  const issueStrike = async (event) => {
    event.preventDefault();

    if (!selectedOrganization) return;

    const cleanReason = strikeReason.trim();

    if (!cleanReason) {
      setMessage({
        type: "error",
        text: "Please enter a reason for the strike.",
      });
      return;
    }

    const currentStrikeCount = getStrikeCount(selectedOrganization);

    if (currentStrikeCount >= 3) {
      setMessage({
        type: "error",
        text: `${selectedOrganization.name} already has three active strikes.`,
      });
      return;
    }

    setSubmittingStrike(true);
    setMessage({ type: "", text: "" });

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const { data: insertedStrike, error: insertError } =
        await supabase
          .from("strikes")
          .insert({
            organization_id: selectedOrganization.id,
            organization_type: selectedOrganization.type,
            organization_name: selectedOrganization.name,
            reason: cleanReason,
            status: "Active",
            issued_by: session?.user?.email || "Admin",
          })
          .select()
          .single();

      if (insertError) throw insertError;

      const newStrikeCount = currentStrikeCount + 1;

      if (newStrikeCount >= 3) {
        const { error: suspensionError } = await supabase
          .from(selectedOrganization.sourceTable)
          .update({
            status: "Suspended",
          })
          .eq("id", selectedOrganization.id);

        if (suspensionError) throw suspensionError;
      }

      setStrikes((currentStrikes) => [
        insertedStrike,
        ...currentStrikes,
      ]);

      if (newStrikeCount >= 3) {
        setOrganizations((currentOrganizations) =>
          currentOrganizations.map((organization) =>
            organization.id === selectedOrganization.id &&
            organization.type === selectedOrganization.type
              ? {
                  ...organization,
                  status: "Suspended",
                }
              : organization
          )
        );
      }

      setMessage({
        type: "success",
        text:
          newStrikeCount >= 3
            ? `${selectedOrganization.name} received a third strike and was suspended.`
            : `A strike was issued to ${selectedOrganization.name}.`,
      });

      closeStrikeForm();
    } catch (error) {
      console.error("Unable to issue strike:", error);

      setMessage({
        type: "error",
        text: error.message || "The strike could not be issued.",
      });
    } finally {
      setSubmittingStrike(false);
    }
  };

  const removeStrike = async (strike, organization) => {
    const confirmed = window.confirm(
      `Remove this strike from ${organization.name}?\n\nReason: ${strike.reason}`
    );

    if (!confirmed) return;

    setProcessingId(strike.id);
    setMessage({ type: "", text: "" });

    try {
      const { error: removeError } = await supabase
        .from("strikes")
        .update({
          status: "Removed",
          removed_at: new Date().toISOString(),
        })
        .eq("id", strike.id);

      if (removeError) throw removeError;

      const remainingActiveStrikes = getActiveStrikes(
        organization
      ).filter((activeStrike) => activeStrike.id !== strike.id);

      if (
        remainingActiveStrikes.length < 3 &&
        organization.status?.toLowerCase() === "suspended"
      ) {
        const { error: reactivateError } = await supabase
          .from(organization.sourceTable)
          .update({
            status: "Approved",
          })
          .eq("id", organization.id);

        if (reactivateError) throw reactivateError;

        setOrganizations((currentOrganizations) =>
          currentOrganizations.map((currentOrganization) =>
            currentOrganization.id === organization.id &&
            currentOrganization.type === organization.type
              ? {
                  ...currentOrganization,
                  status: "Approved",
                }
              : currentOrganization
          )
        );
      }

      setStrikes((currentStrikes) =>
        currentStrikes.map((currentStrike) =>
          currentStrike.id === strike.id
            ? {
                ...currentStrike,
                status: "Removed",
                removed_at: new Date().toISOString(),
              }
            : currentStrike
        )
      );

      setMessage({
        type: "success",
        text: `A strike was removed from ${organization.name}.`,
      });
    } catch (error) {
      console.error("Unable to remove strike:", error);

      setMessage({
        type: "error",
        text: error.message || "The strike could not be removed.",
      });
    } finally {
      setProcessingId(null);
    }
  };

  const filteredOrganizations = useMemo(() => {
    const searchValue = searchText.trim().toLowerCase();

    return organizations.filter((organization) => {
      const displayStatus = getDisplayStatus(organization);

      const matchesSearch =
        !searchValue ||
        organization.name?.toLowerCase().includes(searchValue) ||
        organization.email?.toLowerCase().includes(searchValue);

      const matchesType =
        typeFilter === "All" || organization.type === typeFilter;

      const matchesStatus =
        statusFilter === "All" ||
        displayStatus === statusFilter;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [
    organizations,
    strikes,
    searchText,
    typeFilter,
    statusFilter,
  ]);

  const stats = useMemo(() => {
    return {
      totalOrganizations: organizations.length,

      goodStanding: organizations.filter(
        (organization) =>
          getDisplayStatus(organization) === "Good Standing"
      ).length,

      warning: organizations.filter(
        (organization) =>
          getDisplayStatus(organization) === "Warning"
      ).length,

      suspended: organizations.filter(
        (organization) =>
          getDisplayStatus(organization) === "Suspended"
      ).length,

      activeStrikes: strikes.filter(
        (strike) => strike.status === "Active"
      ).length,
    };
  }, [organizations, strikes]);

  const historyStrikes = historyOrganization
    ? strikes.filter(
        (strike) =>
          strike.organization_id === historyOrganization.id &&
          strike.organization_type === historyOrganization.type
      )
    : [];

  const formatDate = (dateValue) => {
    if (!dateValue) return "Unknown date";

    return new Date(dateValue).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getStatusStyle = (status) => {
    if (status === "Suspended") return styles.statusSuspended;
    if (status === "Warning") return styles.statusWarning;
    return styles.statusGood;
  };

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.brand}>FoodBridge Detroit</div>

          <h1 style={styles.headerTitle}>
            Strike Management
          </h1>

          <p style={styles.headerSubtitle}>
            Record violations and manage organization penalties.
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
        {message.text && (
          <div
            style={
              message.type === "success"
                ? styles.successMessage
                : styles.errorMessage
            }
          >
            <span>{message.text}</span>

            <button
              type="button"
              onClick={() =>
                setMessage({ type: "", text: "" })
              }
              style={styles.dismissButton}
            >
              ×
            </button>
          </div>
        )}

        <section style={styles.statsGrid}>
          <StatCard
            label="Organizations"
            value={stats.totalOrganizations}
            description="Restaurants and shelters"
          />

          <StatCard
            label="Good standing"
            value={stats.goodStanding}
            description="No active strikes"
            valueColor="#166534"
          />

          <StatCard
            label="Warnings"
            value={stats.warning}
            description="One or two active strikes"
            valueColor="#B45309"
          />

          <StatCard
            label="Suspended"
            value={stats.suspended}
            description="Three strikes or suspended"
            valueColor="#991B1B"
          />

          <StatCard
            label="Active strikes"
            value={stats.activeStrikes}
            description="Across all organizations"
            valueColor="#7C3AED"
          />
        </section>

        <section style={styles.managementCard}>
          <div style={styles.toolbar}>
            <div>
              <h2 style={styles.sectionTitle}>
                Organization penalties
              </h2>

              <p style={styles.sectionSubtitle}>
                Three active strikes automatically suspend an
                organization.
              </p>
            </div>

            <button
              type="button"
              onClick={loadData}
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
              <option value="All">All penalty statuses</option>
              <option value="Good Standing">
                Good standing
              </option>
              <option value="Warning">Warning</option>
              <option value="Suspended">Suspended</option>
            </select>
          </div>

          {loading ? (
            <div style={styles.stateMessage}>
              Loading organizations and strikes...
            </div>
          ) : filteredOrganizations.length === 0 ? (
            <div style={styles.stateMessage}>
              No organizations match the selected filters.
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

                    <th style={styles.tableHeader}>Strikes</th>

                    <th style={styles.tableHeader}>Status</th>

                    <th style={styles.tableHeader}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredOrganizations.map((organization) => {
                    const organizationKey =
                      getOrganizationKey(organization);

                    const strikeCount =
                      getStrikeCount(organization);

                    const displayStatus =
                      getDisplayStatus(organization);

                    return (
                      <tr
                        key={organizationKey}
                        style={styles.tableRow}
                      >
                        <td style={styles.tableCell}>
                          <div style={styles.organizationName}>
                            {organization.name ||
                              "Unnamed organization"}
                          </div>

                          <div style={styles.organizationEmail}>
                            {organization.email ||
                              "No email provided"}
                          </div>
                        </td>

                        <td style={styles.tableCell}>
                          <span
                            style={
                              organization.type === "Restaurant"
                                ? styles.restaurantBadge
                                : styles.shelterBadge
                            }
                          >
                            {organization.type}
                          </span>
                        </td>

                        <td style={styles.tableCell}>
                          <div style={styles.strikeMeter}>
                            {[1, 2, 3].map((number) => (
                              <span
                                key={number}
                                style={
                                  number <= strikeCount
                                    ? styles.strikeActive
                                    : styles.strikeInactive
                                }
                              />
                            ))}

                            <span style={styles.strikeText}>
                              {strikeCount}/3
                            </span>
                          </div>
                        </td>

                        <td style={styles.tableCell}>
                          <span
                            style={getStatusStyle(displayStatus)}
                          >
                            {displayStatus}
                          </span>
                        </td>

                        <td style={styles.tableCell}>
                          <div style={styles.actionGroup}>
                            <button
                              type="button"
                              onClick={() =>
                                openStrikeForm(organization)
                              }
                              disabled={strikeCount >= 3}
                              style={{
                                ...styles.addStrikeButton,
                                ...(strikeCount >= 3
                                  ? styles.disabledButton
                                  : {}),
                              }}
                            >
                              + Strike
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                setHistoryOrganization(
                                  organization
                                )
                              }
                              style={styles.historyButton}
                            >
                              History
                            </button>
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

      {showStrikeForm && selectedOrganization && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={styles.modalTitle}>
                  Issue a strike
                </h2>

                <p style={styles.modalSubtitle}>
                  {selectedOrganization.name}
                </p>
              </div>

              <button
                type="button"
                onClick={closeStrikeForm}
                style={styles.modalClose}
              >
                ×
              </button>
            </div>

            <form onSubmit={issueStrike}>
              <div style={styles.warningBox}>
                This organization currently has{" "}
                <strong>
                  {getStrikeCount(selectedOrganization)}
                </strong>{" "}
                active strike
                {getStrikeCount(selectedOrganization) === 1
                  ? ""
                  : "s"}
                . A third strike will suspend the account.
              </div>

              <label style={styles.fieldGroup}>
                <span style={styles.label}>
                  Reason for strike
                </span>

                <textarea
                  value={strikeReason}
                  onChange={(event) =>
                    setStrikeReason(event.target.value)
                  }
                  placeholder="Describe the violation or incident..."
                  rows={5}
                  style={styles.textarea}
                  disabled={submittingStrike}
                />
              </label>

              <div style={styles.modalActions}>
                <button
                  type="button"
                  onClick={closeStrikeForm}
                  style={styles.cancelButton}
                  disabled={submittingStrike}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  style={{
                    ...styles.confirmStrikeButton,
                    ...(submittingStrike
                      ? styles.disabledButton
                      : {}),
                  }}
                  disabled={submittingStrike}
                >
                  {submittingStrike
                    ? "Issuing strike..."
                    : "Issue strike"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {historyOrganization && (
        <div style={styles.modalOverlay}>
          <div style={styles.historyModal}>
            <div style={styles.modalHeader}>
              <div>
                <h2 style={styles.modalTitle}>
                  Strike history
                </h2>

                <p style={styles.modalSubtitle}>
                  {historyOrganization.name}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setHistoryOrganization(null)}
                style={styles.modalClose}
              >
                ×
              </button>
            </div>

            {historyStrikes.length === 0 ? (
              <div style={styles.historyEmpty}>
                No strikes have been recorded for this
                organization.
              </div>
            ) : (
              <div style={styles.historyList}>
                {historyStrikes.map((strike) => (
                  <div
                    key={strike.id}
                    style={styles.historyItem}
                  >
                    <div style={styles.historyTopRow}>
                      <span
                        style={
                          strike.status === "Active"
                            ? styles.activeStrikeBadge
                            : styles.removedStrikeBadge
                        }
                      >
                        {strike.status}
                      </span>

                      <span style={styles.historyDate}>
                        {formatDate(strike.created_at)}
                      </span>
                    </div>

                    <div style={styles.historyReason}>
                      {strike.reason}
                    </div>

                    <div style={styles.historyAdmin}>
                      Issued by: {strike.issued_by || "Admin"}
                    </div>

                    {strike.status === "Active" && (
                      <button
                        type="button"
                        onClick={() =>
                          removeStrike(
                            strike,
                            historyOrganization
                          )
                        }
                        disabled={processingId === strike.id}
                        style={styles.removeStrikeButton}
                      >
                        {processingId === strike.id
                          ? "Removing..."
                          : "Remove strike"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
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

const styles = {
  page: {
    minHeight: "100vh",
    background: "#F4F8F4",
    color: "#17211A",
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  },

  header: {
    background: "#2C5F2D",
    color: "#FFFFFF",
    padding: "24px clamp(18px, 4vw, 48px)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 20,
    flexWrap: "wrap",
  },

  brand: {
    fontSize: 11,
    color: "rgba(255,255,255,.72)",
    textTransform: "uppercase",
    letterSpacing: "1px",
    marginBottom: 5,
  },

  headerTitle: {
    margin: 0,
    fontSize: 25,
  },

  headerSubtitle: {
    margin: "6px 0 0",
    color: "rgba(255,255,255,.78)",
    fontSize: 13,
  },

  backButton: {
    background: "transparent",
    color: "#FFFFFF",
    border: "1px solid rgba(255,255,255,.5)",
    borderRadius: 9,
    padding: "9px 14px",
    cursor: "pointer",
    fontWeight: 600,
  },

  content: {
    width: "min(1180px, calc(100% - 32px))",
    margin: "0 auto",
    padding: "26px 0 50px",
  },

  successMessage: {
    background: "#ECFDF3",
    color: "#166534",
    border: "1px solid #BBF7D0",
    borderRadius: 10,
    padding: "12px 15px",
    fontSize: 13,
    marginBottom: 18,
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
  },

  errorMessage: {
    background: "#FEF2F2",
    color: "#991B1B",
    border: "1px solid #FECACA",
    borderRadius: 10,
    padding: "12px 15px",
    fontSize: 13,
    marginBottom: 18,
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
  },

  dismissButton: {
    border: "none",
    background: "transparent",
    color: "inherit",
    cursor: "pointer",
    fontSize: 18,
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(165px, 1fr))",
    gap: 14,
    marginBottom: 22,
  },

  statCard: {
    background: "#FFFFFF",
    border: "1px solid #E1E9E2",
    borderRadius: 14,
    padding: 18,
  },

  statValue: {
    fontSize: 30,
    fontWeight: 800,
  },

  statLabel: {
    fontWeight: 700,
    fontSize: 13,
    marginTop: 5,
  },

  statDescription: {
    color: "#6B756D",
    fontSize: 11,
    marginTop: 4,
  },

  managementCard: {
    background: "#FFFFFF",
    border: "1px solid #DCE7DD",
    borderRadius: 15,
    overflow: "hidden",
  },

  toolbar: {
    padding: 20,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    borderBottom: "1px solid #E8EEE9",
  },

  sectionTitle: {
    margin: 0,
    color: "#244D26",
    fontSize: 18,
  },

  sectionSubtitle: {
    margin: "5px 0 0",
    color: "#748077",
    fontSize: 12,
  },

  refreshButton: {
    background: "#EEF6EE",
    color: "#2C5F2D",
    border: "1px solid #CDE0CE",
    borderRadius: 8,
    padding: "8px 13px",
    cursor: "pointer",
    fontWeight: 600,
  },

  filters: {
    padding: "14px 20px",
    display: "grid",
    gridTemplateColumns: "minmax(220px, 1fr) 180px 210px",
    gap: 10,
    background: "#FAFCFA",
    borderBottom: "1px solid #E8EEE9",
  },

  searchInput: {
    border: "1px solid #CFD9D0",
    borderRadius: 9,
    padding: "10px 12px",
    fontSize: 13,
  },

  filterSelect: {
    border: "1px solid #CFD9D0",
    borderRadius: 9,
    padding: "10px 12px",
    background: "#FFFFFF",
    fontSize: 13,
  },

  tableWrapper: {
    overflowX: "auto",
  },

  table: {
    width: "100%",
    minWidth: 820,
    borderCollapse: "collapse",
  },

  tableHeader: {
    textAlign: "left",
    padding: "13px 18px",
    background: "#F8FAF8",
    color: "#68736A",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: ".5px",
    borderBottom: "1px solid #E5EBE6",
  },

  tableRow: {
    borderBottom: "1px solid #EDF1ED",
  },

  tableCell: {
    padding: "15px 18px",
    verticalAlign: "middle",
    fontSize: 13,
  },

  organizationName: {
    fontWeight: 700,
    color: "#243229",
  },

  organizationEmail: {
    color: "#778078",
    fontSize: 11,
    marginTop: 4,
  },

  restaurantBadge: {
    display: "inline-block",
    background: "#EFF6FF",
    color: "#1D4ED8",
    borderRadius: 999,
    padding: "4px 9px",
    fontWeight: 700,
    fontSize: 11,
  },

  shelterBadge: {
    display: "inline-block",
    background: "#F5F3FF",
    color: "#6D28D9",
    borderRadius: 999,
    padding: "4px 9px",
    fontWeight: 700,
    fontSize: 11,
  },

  strikeMeter: {
    display: "flex",
    alignItems: "center",
    gap: 5,
  },

  strikeActive: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#DC2626",
  },

  strikeInactive: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#E5E7EB",
  },

  strikeText: {
    marginLeft: 4,
    fontSize: 11,
    color: "#657067",
    fontWeight: 700,
  },

  statusGood: {
    display: "inline-block",
    background: "#ECFDF3",
    color: "#166534",
    borderRadius: 999,
    padding: "4px 9px",
    fontWeight: 700,
    fontSize: 11,
  },

  statusWarning: {
    display: "inline-block",
    background: "#FFFBEB",
    color: "#B45309",
    borderRadius: 999,
    padding: "4px 9px",
    fontWeight: 700,
    fontSize: 11,
  },

  statusSuspended: {
    display: "inline-block",
    background: "#FEF2F2",
    color: "#991B1B",
    borderRadius: 999,
    padding: "4px 9px",
    fontWeight: 700,
    fontSize: 11,
  },

  actionGroup: {
    display: "flex",
    gap: 7,
    flexWrap: "wrap",
  },

  addStrikeButton: {
    background: "#B91C1C",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 7,
    padding: "7px 11px",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
  },

  historyButton: {
    background: "#F3F4F6",
    color: "#374151",
    border: "1px solid #D1D5DB",
    borderRadius: 7,
    padding: "7px 11px",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
  },

  stateMessage: {
    padding: 35,
    color: "#748077",
    fontSize: 13,
    textAlign: "center",
  },

  disabledButton: {
    opacity: 0.5,
    cursor: "not-allowed",
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 1000,
  },

  modal: {
    width: "min(520px, 100%)",
    background: "#FFFFFF",
    borderRadius: 16,
    padding: 22,
    boxShadow: "0 20px 55px rgba(0,0,0,.2)",
  },

  historyModal: {
    width: "min(620px, 100%)",
    maxHeight: "80vh",
    overflowY: "auto",
    background: "#FFFFFF",
    borderRadius: 16,
    padding: 22,
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 18,
  },

  modalTitle: {
    margin: 0,
    color: "#244D26",
    fontSize: 20,
  },

  modalSubtitle: {
    margin: "4px 0 0",
    color: "#6B756D",
    fontSize: 13,
  },

  modalClose: {
    background: "transparent",
    border: "none",
    fontSize: 24,
    cursor: "pointer",
    color: "#647067",
  },

  warningBox: {
    background: "#FFF7ED",
    color: "#9A3412",
    border: "1px solid #FED7AA",
    borderRadius: 9,
    padding: 12,
    fontSize: 12,
    lineHeight: 1.5,
    marginBottom: 16,
  },

  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 7,
  },

  label: {
    fontSize: 12,
    fontWeight: 700,
    color: "#36423A",
  },

  textarea: {
    width: "100%",
    boxSizing: "border-box",
    resize: "vertical",
    border: "1px solid #CBD8CC",
    borderRadius: 9,
    padding: 12,
    fontFamily: "inherit",
    fontSize: 13,
  },

  modalActions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 18,
  },

  cancelButton: {
    background: "#FFFFFF",
    color: "#465249",
    border: "1px solid #CBD8CC",
    borderRadius: 9,
    padding: "10px 16px",
    cursor: "pointer",
    fontWeight: 600,
  },

  confirmStrikeButton: {
    background: "#B91C1C",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 9,
    padding: "10px 16px",
    cursor: "pointer",
    fontWeight: 700,
  },

  historyEmpty: {
    color: "#748077",
    padding: "30px 5px",
    textAlign: "center",
    fontSize: 13,
  },

  historyList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },

  historyItem: {
    border: "1px solid #E2E8E3",
    borderRadius: 11,
    padding: 14,
  },

  historyTopRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },

  activeStrikeBadge: {
    background: "#FEF2F2",
    color: "#991B1B",
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 10,
    fontWeight: 700,
  },

  removedStrikeBadge: {
    background: "#F3F4F6",
    color: "#4B5563",
    borderRadius: 999,
    padding: "4px 9px",
    fontSize: 10,
    fontWeight: 700,
  },

  historyDate: {
    color: "#7A847D",
    fontSize: 11,
  },

  historyReason: {
    color: "#28332B",
    fontSize: 13,
    lineHeight: 1.5,
    marginTop: 12,
  },

  historyAdmin: {
    color: "#7A847D",
    fontSize: 11,
    marginTop: 8,
  },

  removeStrikeButton: {
    marginTop: 12,
    background: "#FFFFFF",
    color: "#991B1B",
    border: "1px solid #F1B9B9",
    borderRadius: 7,
    padding: "7px 10px",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
  },
};