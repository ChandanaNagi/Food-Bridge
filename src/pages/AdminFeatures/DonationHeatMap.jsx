import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "../../supabaseClient";

// Detroit, roughly centered
const DETROIT_CENTER = [42.3314, -83.0458];

export default function DonationHeatMap() {
  const navigate = useNavigate();

  const [restaurants, setRestaurants] = useState([]);
  const [shelters, setShelters] = useState([]);
  const [donations, setDonations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeStatus, setGeocodeStatus] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const [
        { data: restaurantRows, error: restaurantError },
        { data: shelterRows, error: shelterError },
        { data: donationRows, error: donationError },
      ] = await Promise.all([
        supabase.from("restaurants").select("*"),
        supabase.from("shelters").select("*"),
        supabase.from("donations").select("id, restaurant_id, shelter_id, quantity, status"),
      ]);

      if (restaurantError) throw restaurantError;
      if (shelterError) throw shelterError;
      if (donationError) throw donationError;

      setRestaurants(restaurantRows || []);
      setShelters(shelterRows || []);
      setDonations(donationRows || []);
    } catch (err) {
      console.error("Heat map data error:", err);
      setMessage({
        type: "error",
        text: err.message || "The heat map data could not be loaded.",
      });
    } finally {
      setLoading(false);
    }
  };

  // Geocode any restaurant/shelter that has an address but no lat/lng yet.
  // Nominatim's usage policy asks for roughly 1 request per second, so we
  // geocode sequentially with a delay rather than firing requests in parallel.
  const geocodeMissingLocations = async () => {
    setGeocoding(true);
    setMessage({ type: "", text: "" });

    const targets = [
      ...restaurants
        .filter((r) => r.address && (!r.latitude || !r.longitude))
        .map((r) => ({ ...r, table: "restaurants" })),
      ...shelters
        .filter((s) => s.address && (!s.latitude || !s.longitude))
        .map((s) => ({ ...s, table: "shelters" })),
    ];

    if (targets.length === 0) {
      setMessage({
        type: "success",
        text: "All locations with an address already have coordinates.",
      });
      setGeocoding(false);
      return;
    }

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      setGeocodeStatus(`Looking up ${i + 1} of ${targets.length}: ${target.name || target.address}`);

      try {
        const query = encodeURIComponent(`${target.address}, Detroit, Michigan`);
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`
        );
        const results = await response.json();

        if (results && results.length > 0) {
          const { lat, lon } = results[0];

          const { error: updateError } = await supabase
            .from(target.table)
            .update({ latitude: parseFloat(lat), longitude: parseFloat(lon) })
            .eq("id", target.id);

          if (updateError) throw updateError;
          succeeded++;
        } else {
          failed++;
        }
      } catch (err) {
        console.error(`Geocoding failed for ${target.name}:`, err);
        failed++;
      }

      // Respect Nominatim's ~1 request/second usage policy
      if (i < targets.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    }

    setGeocodeStatus("");
    setGeocoding(false);
    setMessage({
      type: failed === 0 ? "success" : "error",
      text: `Geocoding complete: ${succeeded} location${succeeded === 1 ? "" : "s"} updated${
        failed > 0 ? `, ${failed} could not be found` : ""
      }.`,
    });

    await loadData();
  };

  // Donation volume per restaurant / shelter, used to size the circle markers
  const restaurantVolume = useMemo(() => {
    const counts = {};
    donations.forEach((d) => {
      if (!d.restaurant_id) return;
      counts[d.restaurant_id] = (counts[d.restaurant_id] || 0) + 1;
    });
    return counts;
  }, [donations]);

  const shelterVolume = useMemo(() => {
    const counts = {};
    donations.forEach((d) => {
      if (!d.shelter_id) return;
      counts[d.shelter_id] = (counts[d.shelter_id] || 0) + 1;
    });
    return counts;
  }, [donations]);

  const mappedRestaurants = restaurants.filter((r) => r.latitude && r.longitude);
  const mappedShelters = shelters.filter((s) => s.latitude && s.longitude);
  const unmappedCount =
    restaurants.filter((r) => r.address && (!r.latitude || !r.longitude)).length +
    shelters.filter((s) => s.address && (!s.latitude || !s.longitude)).length;

  const maxVolume = Math.max(
    1,
    ...Object.values(restaurantVolume),
    ...Object.values(shelterVolume)
  );

  const radiusFor = (count) => {
    const base = 8;
    const extra = (count / maxVolume) * 22;
    return base + extra;
  };

  if (loading) {
    return <div style={styles.loading}>Loading heat map...</div>;
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.brand}>FoodBridge Detroit</div>
          <h1 style={styles.headerTitle}>Donation Heat Map</h1>
          <p style={styles.headerSubtitle}>
            View restaurant and shelter locations, sized by donation activity.
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
          <StatCard label="Restaurants on map" value={mappedRestaurants.length} valueColor="#166534" />
          <StatCard label="Shelters on map" value={mappedShelters.length} valueColor="#1D4ED8" />
          <StatCard label="Needs geocoding" value={unmappedCount} valueColor="#B45309" />
          <StatCard label="Total donations" value={donations.length} valueColor="#7C3AED" />
        </section>

        <section style={styles.toolbar}>
          <div>
            <div style={styles.toolbarTitle}>Locations without coordinates: {unmappedCount}</div>
            <div style={styles.toolbarSubtitle}>
              Addresses are converted to map coordinates once and saved — this only needs to run
              when a new restaurant or shelter is added.
            </div>
          </div>
          <button
            type="button"
            onClick={geocodeMissingLocations}
            disabled={geocoding || unmappedCount === 0}
            style={{
              ...styles.geocodeButton,
              ...(geocoding || unmappedCount === 0 ? styles.geocodeButtonDisabled : {}),
            }}
          >
            {geocoding ? "Geocoding..." : "Geocode missing locations"}
          </button>
        </section>

        {geocoding && geocodeStatus && (
          <div style={styles.geocodeProgress}>{geocodeStatus}</div>
        )}

        <section style={styles.mapCard}>
          <MapContainer
            center={DETROIT_CENTER}
            zoom={11}
            style={{ height: "560px", width: "100%", borderRadius: 15 }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />

            {mappedRestaurants.map((restaurant) => (
              <CircleMarker
                key={`restaurant-${restaurant.id}`}
                center={[restaurant.latitude, restaurant.longitude]}
                radius={radiusFor(restaurantVolume[restaurant.id] || 0)}
                pathOptions={{
                  color: "#166534",
                  fillColor: "#22C55E",
                  fillOpacity: 0.55,
                  weight: 2,
                }}
              >
                <Popup>
                  <strong>{restaurant.name}</strong>
                  <br />
                  Restaurant
                  <br />
                  {restaurant.address}
                  <br />
                  Donations posted: {restaurantVolume[restaurant.id] || 0}
                </Popup>
              </CircleMarker>
            ))}

            {mappedShelters.map((shelter) => (
              <CircleMarker
                key={`shelter-${shelter.id}`}
                center={[shelter.latitude, shelter.longitude]}
                radius={radiusFor(shelterVolume[shelter.id] || 0)}
                pathOptions={{
                  color: "#1D4ED8",
                  fillColor: "#60A5FA",
                  fillOpacity: 0.55,
                  weight: 2,
                }}
              >
                <Popup>
                  <strong>{shelter.name}</strong>
                  <br />
                  Shelter
                  <br />
                  {shelter.address}
                  <br />
                  Donations received: {shelterVolume[shelter.id] || 0}
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>

          <div style={styles.legend}>
            <span style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: "#22C55E" }} />
              Restaurants
            </span>
            <span style={styles.legendItem}>
              <span style={{ ...styles.legendDot, background: "#60A5FA" }} />
              Shelters
            </span>
            <span style={styles.legendNote}>Larger circle = more donation activity</span>
          </div>
        </section>

        {mappedRestaurants.length === 0 && mappedShelters.length === 0 && (
          <div style={styles.emptyState}>
            No locations have coordinates yet. Click "Geocode missing locations" above to plot
            your restaurants and shelters on the map.
          </div>
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

const styles = {
  page: { minHeight: "100vh", background: "#F4F8F4", color: "#17211A", fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif" },
  loading: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F8F4", color: "#657067" },
  header: { background: "#2C5F2D", color: "#FFFFFF", padding: "24px clamp(18px, 4vw, 48px)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 20, flexWrap: "wrap" },
  brand: { fontSize: 11, color: "rgba(255,255,255,.72)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 5 },
  headerTitle: { margin: 0, fontSize: 25 },
  headerSubtitle: { margin: "6px 0 0", color: "rgba(255,255,255,.78)", fontSize: 13 },
  backButton: { background: "transparent", color: "#FFFFFF", border: "1px solid rgba(255,255,255,.5)", borderRadius: 9, padding: "9px 14px", cursor: "pointer", fontWeight: 600 },
  content: { width: "min(1220px, calc(100% - 32px))", margin: "0 auto", padding: "26px 0 50px" },
  successBanner: { background: "#ECFDF3", color: "#166534", border: "1px solid #BBF7D0", borderRadius: 10, padding: "12px 15px", fontSize: 13, marginBottom: 18 },
  errorBanner: { background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 15px", fontSize: 13, marginBottom: 18 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 18 },
  statCard: { background: "#FFFFFF", border: "1px solid #E1E9E2", borderRadius: 14, padding: 18 },
  statValue: { fontSize: 29, fontWeight: 800 },
  statLabel: { marginTop: 5, fontSize: 12, fontWeight: 750 },
  toolbar: { background: "#FFFFFF", border: "1px solid #DCE7DD", borderRadius: 15, padding: 18, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 14 },
  toolbarTitle: { fontSize: 14, fontWeight: 700, color: "#244D26" },
  toolbarSubtitle: { marginTop: 4, fontSize: 12, color: "#748077", maxWidth: 480 },
  geocodeButton: { background: "#2C5F2D", color: "#fff", border: "none", borderRadius: 9, padding: "11px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  geocodeButtonDisabled: { opacity: 0.5, cursor: "not-allowed" },
  geocodeProgress: { background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #BFDBFE", borderRadius: 10, padding: "10px 14px", fontSize: 12, marginBottom: 14 },
  mapCard: { background: "#FFFFFF", border: "1px solid #DCE7DD", borderRadius: 15, padding: 16 },
  legend: { display: "flex", alignItems: "center", gap: 20, marginTop: 14, flexWrap: "wrap" },
  legendItem: { display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#455349", fontWeight: 600 },
  legendDot: { width: 12, height: 12, borderRadius: "50%", display: "inline-block" },
  legendNote: { fontSize: 11, color: "#8B9890" },
  emptyState: { marginTop: 16, padding: 30, textAlign: "center", background: "#FFFFFF", border: "1px dashed #CBD8CC", borderRadius: 14, color: "#748077", fontSize: 13 },
};