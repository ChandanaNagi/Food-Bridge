export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { name, email, type } = req.body || {};
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!adminEmail) {
    console.error("ADMIN_EMAIL environment variable is not set");
    return res.status(500).json({ error: "Admin email not configured" });
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "FoodBridge Detroit <onboarding@resend.dev>",
        to: [adminEmail],
        subject: "New FoodBridge signup awaiting approval",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #2C5F2D;">New account pending approval</h2>
            <p>A new ${type || "account"} just signed up and needs review:</p>
            <ul>
              <li><strong>Name:</strong> ${name || "Not provided"}</li>
              <li><strong>Email:</strong> ${email || "Not provided"}</li>
              <li><strong>Type:</strong> ${type || "Not provided"}</li>
            </ul>
            <p>
              <a href="https://food-bridge-b6dr.vercel.app/admin/users"
                 style="background: #2C5F2D; color: #fff; padding: 10px 18px;
                        border-radius: 8px; text-decoration: none; display: inline-block;">
                Review in User Management
              </a>
            </p>
          </div>
        `,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Resend API error:", data);
      return res.status(500).json({ error: data.message || "Failed to send email" });
    }

    return res.status(200).json({ success: true, id: data.id });
  } catch (error) {
    console.error("Send admin alert error:", error);
    return res.status(500).json({ error: error.message || "Failed to send email" });
  }
}