import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import logo from "../assets/logo.png";


export default function Login() {
  const navigate = useNavigate();

  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [signupForm, setSignupForm] = useState({
    name: "",
    email: "",
    password: "",
    type: "Shelter",
  });

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setSuccessMessage("");
  };

  // ---- LOG IN ----
  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: loginForm.email,
      password: loginForm.password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    const userEmail = data?.user?.email?.trim().toLowerCase();

    const { data: shelterRow, error: shelterLookupError } = await supabase
      .from("shelters")
      .select("id, name, email, status")
      .ilike("email", userEmail)
      .maybeSingle();

    if (shelterLookupError) {
      setError(shelterLookupError.message);
      setLoading(false);
      return;
    }

    const { data: restaurantRow, error: restaurantLookupError } = await supabase
      .from("restaurants")
      .select("id, name, email, status")
      .ilike("email", userEmail)
      .maybeSingle();

    if (restaurantLookupError) {
      setError(restaurantLookupError.message);
      setLoading(false);
      return;
    }

    const matchedRow = shelterRow || restaurantRow;

    if (matchedRow && matchedRow.status === "Pending") {
      await supabase.auth.signOut();
      setError("Your account is still pending admin approval. Please check back soon.");
      setLoading(false);
      return;
    }

    if (matchedRow && matchedRow.status === "Suspended") {
      await supabase.auth.signOut();
      setError("Your account has been suspended. Contact an administrator for help.");
      setLoading(false);
      return;
    }

    if (matchedRow && matchedRow.status === "Declined") {
      await supabase.auth.signOut();
      setError("Your account application was declined. Contact an administrator for more information.");
      setLoading(false);
      return;
    }

    setLoading(false);

    if (shelterRow) {
      navigate("/shelter");
    } else if (restaurantRow) {
      navigate("/restaurant");
    } else {
      navigate("/admin");
    }
  };

  // ---- SIGN UP ----
  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");

    if (!signupForm.name || !signupForm.email || !signupForm.password) {
      setError("Please fill in all fields.");
      return;
    }

    if (signupForm.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: signupForm.email,
      password: signupForm.password,
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    const newUserId = data?.user?.id;

    if (!newUserId) {
      setError(
        "Account created, but no user id was returned — check your Supabase " +
        "'Confirm email' setting under Authentication > Providers."
      );
      setLoading(false);
      return;
    }

    const table = signupForm.type === "Restaurant" ? "restaurants" : "shelters";

    // NOTE: assumes "id" matches the auth user's id — change to "user_id" if
    // that's how your schema links them.
    const { error: insertError } = await supabase.from(table).insert({
      id: newUserId,
      name: signupForm.name,
      email: signupForm.email,
      status: "Pending",
    });

    // New accounts start as Pending, so sign them straight back out — they
    // shouldn't have access until an admin approves them in User Management.
    await supabase.auth.signOut();

    if (insertError) {
      setError(`Account created, but saving your details failed: ${insertError.message}`);
      setLoading(false);
      return;
    }

    setSignupForm({ name: "", email: "", password: "", type: "Shelter" });
    setLoading(false);
    setSuccessMessage(
      "Account created! An admin will review your details, and you'll be able to " +
      "log in once approved. You'll receive an email when that happens — please " +
      "check your spam/junk folder if you don't see it in your inbox."
    );
    setMode("login");
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <img src={logo} alt="FoodBridge Detroit" style={{ width: 250, display: "block", margin: "0 auto 10px" }} />
        <div style={s.subtitle}>
          {mode === "login" ? "Sign in to your account" : "Create a new account"}
        </div>

        <div style={s.tabs}>
          <button
            onClick={() => switchMode("login")}
            style={mode === "login" ? s.tabActive : s.tab}
          >
            Log In
          </button>
          <button
            onClick={() => switchMode("signup")}
            style={mode === "signup" ? s.tabActive : s.tab}
          >
            Sign Up
          </button>
        </div>

        {successMessage && <div style={s.success}>{successMessage}</div>}
        {error && <div style={s.error}>{error}</div>}

        {mode === "login" ? (
          <form onSubmit={handleLogin} style={s.form}>
            <label style={s.label}>
              Email
              <input
                type="email"
                required
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                style={s.input}
              />
            </label>

            <label style={s.label}>
              Password
              <input
                type="password"
                required
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                style={s.input}
              />
            </label>

            <button type="submit" disabled={loading} style={s.submit}>
              {loading ? "Signing in..." : "Log In"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup} style={s.form}>
            <label style={s.label}>
              Organization name
              <input
                type="text"
                required
                value={signupForm.name}
                onChange={(e) => setSignupForm({ ...signupForm, name: e.target.value })}
                style={s.input}
              />
            </label>

            <label style={s.label}>
              I am a
              <select
                value={signupForm.type}
                onChange={(e) => setSignupForm({ ...signupForm, type: e.target.value })}
                style={s.input}
              >
                <option value="Shelter">Shelter</option>
                <option value="Restaurant">Restaurant</option>
              </select>
            </label>

            <label style={s.label}>
              Email
              <input
                type="email"
                required
                value={signupForm.email}
                onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                style={s.input}
              />
            </label>

            <label style={s.label}>
              Password
              <input
                type="password"
                required
                value={signupForm.password}
                onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                style={s.input}
              />
            </label>

            <button type="submit" disabled={loading} style={s.submit}>
              {loading ? "Creating account..." : "Sign Up"}
            </button>

            <div style={s.note}>
              Your account will need admin approval before you can log in.
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: "100vh",
    background: "#F4F8F4",
    fontFamily: "system-ui, sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: "32px 28px",
    width: "100%",
    maxWidth: 380,
    boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
  },
  brand: {
    fontSize: 13,
    fontWeight: 600,
    color: "#2C5F2D",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#111827",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 20,
  },
  tabs: {
    display: "flex",
    background: "#F4F8F4",
    borderRadius: 10,
    padding: 4,
    marginBottom: 18,
  },
  tab: {
    flex: 1,
    padding: "8px 0",
    border: "none",
    background: "transparent",
    color: "#6B7280",
    fontWeight: 600,
    fontSize: 13,
    borderRadius: 8,
    cursor: "pointer",
  },
  tabActive: {
    flex: 1,
    padding: "8px 0",
    border: "none",
    background: "#2C5F2D",
    color: "#fff",
    fontWeight: 600,
    fontSize: 13,
    borderRadius: 8,
    cursor: "pointer",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "#374151",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  input: {
    fontSize: 14,
    fontWeight: 400,
    color: "#111827",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    outline: "none",
  },
  submit: {
    marginTop: 6,
    background: "#2C5F2D",
    color: "#fff",
    border: "none",
    borderRadius: 10,
    padding: "12px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  error: {
    background: "#FEF2F2",
    color: "#991B1B",
    fontSize: 13,
    padding: "10px 12px",
    borderRadius: 8,
    marginBottom: 14,
  },
  success: {
    background: "#F0FDF4",
    color: "#166534",
    fontSize: 13,
    padding: "10px 12px",
    borderRadius: 8,
    marginBottom: 14,
  },
  note: {
    fontSize: 11,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 2,
  },
};