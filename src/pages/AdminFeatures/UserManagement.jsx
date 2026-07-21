import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
export default function UserManagement() {
    const navigate = useNavigate();

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState(null);

    const [showAddForm, setShowAddForm] = useState(false);
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState("");

    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        type: "Shelter",
    });

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        setLoading(true);

        const { data: restaurants } = await supabase.from("restaurants").select("*");
        const { data: shelters } = await supabase.from("shelters").select("*");

        const combined = [
            ...(restaurants || []).map((r) => ({ ...r, type: "Restaurant" })),
            ...(shelters || []).map((s) => ({ ...s, type: "Shelter" })),
        ];

        setUsers(combined);
        setLoading(false);
    };

     const handleStatusChange = async (user, newStatus) => {
    setUpdatingId(user.id);

    const table = user.type === "Restaurant" ? "restaurants" : "shelters";

    const { error: updateError } = await supabase
        .from(table)
        .update({ status: newStatus })
        .eq("id", user.id);

    if (updateError) {
        alert(`Failed to update status: ${updateError.message}`);
    } else {
        const { data: { user: adminUser } } = await supabase.auth.getUser();

        await supabase.from("audit_logs").insert({
            admin_email: adminUser?.email || "Unknown admin",
            action: newStatus === "Approved" ? "Approved user account" : `${newStatus} user account`,
            target_name: user.name,
            target_type: user.type,
            details: `Status changed to ${newStatus}`,
        });
    }

    await loadUsers();
    setUpdatingId(null);
};

    const handleAddUser = async (e) => {
        e.preventDefault();
        setError("");

        if (!form.name || !form.email || !form.password) {
            setError("Please fill in all fields.");
            return;
        }

        if (form.password.length < 6) {
            setError("Password must be at least 6 characters.");
            return;
        }

        setAdding(true);

        const { data: { session: adminSession } } = await supabase.auth.getSession();

        const { data, error: signUpError } = await supabase.auth.signUp({
            email: form.email,
            password: form.password,
        });

        if (signUpError) {
            setError(signUpError.message);
            setAdding(false);
            return;
        }

        const newUserId = data?.user?.id;

        if (!newUserId) {
            setError(
                "Account created, but no user id was returned — check your Supabase " +
                "'Confirm email' setting under Authentication > Providers."
            );
            setAdding(false);
            return;
        }

        const table = form.type === "Restaurant" ? "restaurants" : "shelters";

        const { error: insertError } = await supabase.from(table).insert({
            id: newUserId,
            name: form.name,
            email: form.email,
            status: "Pending",
        });

        if (adminSession) {
            await supabase.auth.setSession({
                access_token: adminSession.access_token,
                refresh_token: adminSession.refresh_token,
            });
        }

        if (insertError) {
            setError(`Login was created, but saving to "${table}" failed: ${insertError.message}`);
            setAdding(false);
            return;
        }

        setForm({ name: "", email: "", password: "", type: "Shelter" });
        setShowAddForm(false);
        setAdding(false);
        loadUsers();
    };

    return (

        <div>

            <button onClick={() => navigate("/admin")}>
                ← Back to Dashboard
            </button>


            <h1>User Management</h1>

            <p>
                Approve, suspend, and manage users here.
            </p>

            <button
                onClick={() => setShowAddForm(!showAddForm)}
                style={{ margin: "12px 0" }}
            >
                {showAddForm ? "Cancel" : "+ Add User"}
            </button>

            {showAddForm && (
                <form
                    onSubmit={handleAddUser}
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        maxWidth: 320,
                        padding: 16,
                        border: "1px solid #E5E7EB",
                        borderRadius: 12,
                        marginBottom: 20,
                    }}
                >
                    <label>
                        Organization name
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            style={{ display: "block", width: "100%" }}
                        />
                    </label>

                    <label>
                        Type
                        <select
                            value={form.type}
                            onChange={(e) => setForm({ ...form, type: e.target.value })}
                            style={{ display: "block", width: "100%" }}
                        >
                            <option value="Shelter">Shelter</option>
                            <option value="Restaurant">Restaurant</option>
                        </select>
                    </label>

                    <label>
                        Email
                        <input
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            style={{ display: "block", width: "100%" }}
                        />
                    </label>

                    <label>
                        Password
                        <input
                            type="text"
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                            style={{ display: "block", width: "100%" }}
                        />
                    </label>

                    {error && (
                        <div style={{ color: "#991B1B", fontSize: 13 }}>{error}</div>
                    )}

                    <button type="submit" disabled={adding}>
                        {adding ? "Creating..." : "Create Login"}
                    </button>
                </form>
            )}

            {loading ? (
                <div>Loading users...</div>
            ) : (
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

                        {users.map((user) => (

                            <tr key={`${user.type}-${user.id}`}>

                                <td>{user.name}</td>

                                <td>{user.type}</td>

                                <td>{user.status}</td>

                                <td>

                                    <button
                                        onClick={() => handleStatusChange(user, "Approved")}
                                        disabled={updatingId === user.id || user.status === "Approved"}
                                    >
                                        Approve
                                    </button>


                                    <button
                                        onClick={() => handleStatusChange(user, "Suspended")}
                                        disabled={updatingId === user.id || user.status === "Suspended"}
                                    >
                                        Suspend
                                    </button>


                                    <button
                                        onClick={() => handleStatusChange(user, "Approved")}
                                        disabled={updatingId === user.id || user.status !== "Suspended"}
                                    >
                                        Reactivate
                                    </button>

                                </td>

                            </tr>

                        ))}

                    </tbody>

                </table>
            )}

        </div>

    );
}