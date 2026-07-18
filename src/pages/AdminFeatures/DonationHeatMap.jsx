import { useNavigate } from "react-router-dom";

export default function DonationHeatMap() {

  const navigate = useNavigate();

  return (
    <div>

      <button onClick={() => navigate("/admin")}>
        ← Back to Dashboard
      </button>

      <h1>Donation Heat Map</h1>

      <p>
        View food donation activity by location.
      </p>

      <div
        style={{
          height: "400px",
          background: "#E5E7EB",
          borderRadius: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        Map Placeholder
      </div>

    </div>
  );
}