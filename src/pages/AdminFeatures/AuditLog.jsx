import { useNavigate } from "react-router-dom";

export default function AuditLog() {

  const navigate = useNavigate();


  const logs = [
    {
      id: 1,
      admin: "Admin",
      action: "Approved user account",
      target: "Jimmy Johns",
      date: "July 18, 2026"
    },
    {
      id: 2,
      admin: "Admin",
      action: "Issued strike",
      target: "Hope Shelter",
      date: "July 18, 2026"
    }
  ];


  return (
    <div>

      <button onClick={() => navigate("/admin")}>
        ← Back to Dashboard
      </button>


      <h1>Audit Log</h1>

      <p>
        Track all administrative actions.
      </p>


      <table>

        <thead>
          <tr>
            <th>Admin</th>
            <th>Action</th>
            <th>Target</th>
            <th>Date</th>
          </tr>
        </thead>


        <tbody>

          {logs.map(log => (

            <tr key={log.id}>

              <td>{log.admin}</td>

              <td>{log.action}</td>

              <td>{log.target}</td>

              <td>{log.date}</td>

            </tr>

          ))}

        </tbody>

      </table>


    </div>
  );
}