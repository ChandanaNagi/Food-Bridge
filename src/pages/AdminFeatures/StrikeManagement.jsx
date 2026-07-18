import { useNavigate } from "react-router-dom";

export default function StrikeManagement() {

    const navigate = useNavigate();


    const users = [
        {
            id: 1,
            name: "Jimmy Johns",
            type: "Restaurant",
            strikes: 2,
            status: "Warning"
        },
        {
            id: 2,
            name: "Hope Shelter",
            type: "Shelter",
            strikes: 3,
            status: "Suspended"
        },
        {
            id: 3,
            name: "Fresh Market",
            type: "Restaurant",
            strikes: 0,
            status: "Active"
        }
    ];


    return (

        <div>


            <button onClick={() => navigate("/admin")}>
                ← Back to Dashboard
            </button>


            <h1>Strike Management</h1>


            <p>
                Monitor violations and manage account penalties.
            </p>



            <table>

                <thead>

                    <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Strikes</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>

                </thead>


                <tbody>


                {users.map(user => (

                    <tr key={user.id}>

                        <td>{user.name}</td>

                        <td>{user.type}</td>

                        <td>
                            {user.strikes}/3
                        </td>


                        <td>
                            {user.status}
                        </td>


                        <td>


                            <button>
                                + Strike
                            </button>


                            <button>
                                Remove Strike
                            </button>


                        </td>


                    </tr>


                ))}


                </tbody>


            </table>


        </div>

    );
}