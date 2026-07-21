export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, name } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: "Missing recipient email" });
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
        to: [email],
        subject: "Your FoodBridge account has been approved!",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #2C5F2D;">You're approved!</h2>
            <p>Hi ${name || "there"},</p>
            <p>
              Good news — your FoodBridge Detroit account has been approved by an
              administrator. You can now log in and start using the platform.
            </p>
            <p>
              <a href="https://food-bridge-b6dr.vercel.app"
                 style="background: #2C5F2D; color: #fff; padding: 10px 18px;
                        border-radius: 8px; text-decoration: none; display: inline-block;">
                Log in to FoodBridge
              </a>
            </p>
            <p style="color: #6B7280; font-size: 13px;">
              If you weren't expecting this, you can safely ignore this email.
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
    console.error("Send approval email error:", error);
    return res.status(500).json({ error: error.message || "Failed to send email" });
  }
}