import { useNavigate } from "react-router-dom";

export default function Analytics() {

  const navigate = useNavigate();


  const stats = [
    {
      label: "Total Donations",
      value: "1,250 meals"
    },
    {
      label: "Active Restaurants",
      value: "45"
    },
    {
      label: "Active Shelters",
      value: "22"
    },
    {
      label: "Successful Pickups",
      value: "92%"
    }
  ];


  return (
    <div>

      <button onClick={() => navigate("/admin")}>
        ← Back to Dashboard
      </button>


      <h1>Platform Analytics</h1>

      <p>
        Monitor FoodBridge performance and impact.
      </p>


      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "15px",
          marginTop: "20px"
        }}
      >

        {stats.map((stat, index) => (

          <div
            key={index}
            style={{
              background: "#F4F8F4",
              padding: "20px",
              borderRadius: "12px"
            }}
          >

            <h2>{stat.value}</h2>

            <p>{stat.label}</p>

          </div>

        ))}

      </div>


      <h2 style={{marginTop:"30px"}}>
        Donation Trends
      </h2>


      <div
        style={{
          height:"250px",
          background:"#E5E7EB",
          borderRadius:"12px",
          display:"flex",
          alignItems:"center",
          justifyContent:"center"
        }}
      >

        Chart Placeholder

      </div>


    </div>
  );
}