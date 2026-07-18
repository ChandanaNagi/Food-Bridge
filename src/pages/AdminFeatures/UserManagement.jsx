import { useNavigate } from "react-router-dom";

export default function UserManagement() {

    const navigate = useNavigate();

    const users = [
        {
            id: 1,
            name: "Jimmy Johns",
            type: "Restaurant",
            status: "Pending"
        },
        {
            id: 2,
            name: "Hope Shelter",
            type: "Shelter",
            status: "Approved"
        }
    ];


    return (

        <div>

            <button onClick={() => navigate("/admin")}>
                ← Back to Dashboard
            </button>


            <h1>User Management</h1>

            <p>
                Approve, suspend, and manage users here.
            </p>


            <table>

                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>


                <tbody>

                    {users.map(user => (

                        <tr key={user.id}>

                            <td>{user.name}</td>

                            <td>{user.type}</td>

                            <td>{user.status}</td>

                            <td>

                                <button>
                                    Approve
                                </button>


                                <button>
                                    Suspend
                                </button>


                                <button>
                                    Reactivate
                                </button>

                            </td>

                        </tr>

                    ))}

                </tbody>

            </table>


        </div>

    );
}