const express = require("express");
const { supabase } = require("../config/supabase");
const router = express.Router();

const OA_API_KEY = process.env.OUTREACH_AGENT_API_KEY;
const OA_BASE = "https://api.crm.emacronai.com/api/v1";

/**
 * POST /api/auth/whatsapp/init
 * Calls OutreachAgent magic-link/init from the server (API key never exposed to browser).
 * Returns { session_id, wa_link, scan_url, expires_at } to the frontend.
 */
router.post("/whatsapp/init", async (req, res) => {
  try {
    const response = await fetch(`${OA_BASE}/whatsapp/magic-link/init`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OA_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        context: "login",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OutreachAgent init error:", err);
      return res.status(502).json({ error: "Failed to create WhatsApp session" });
    }

    const data = await response.json();

    // Only forward what the frontend needs — never forward the raw session body
    // that could leak internal details. session_id is safe; the token is invisible.
    res.json({
      session_id: data.session_id,
      wa_link: data.wa_link,
      scan_url: data.scan_url,
      expires_at: data.expires_at,
      expires_in: data.expires_in,
    });
  } catch (error) {
    console.error("WhatsApp init error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/auth/whatsapp/status/:session_id
 * Polls OutreachAgent for session status. When verified=true, looks up the user
 * by phone number and returns the same user object shape as /login.
 */
router.get("/whatsapp/status/:session_id", async (req, res) => {
  try {
    const { session_id } = req.params;

    const response = await fetch(
      `${OA_BASE}/whatsapp/magic-link/${session_id}/status`,
      {
        headers: { Authorization: `Bearer ${OA_API_KEY}` },
      }
    );

    if (!response.ok) {
      const err = await response.text();
      // 400 means session expired
      if (response.status === 400) {
        return res.status(400).json({ error: "Session expired" });
      }
      console.error("OutreachAgent status error:", err);
      return res.status(502).json({ error: "Failed to check session status" });
    }

    const data = await response.json();

    // Not verified yet — just forward polling state
    if (!data.verified) {
      return res.json({ verified: false, expires_at: data.expires_at });
    }

    // ✅ Verified — match phone to a staff user in the DB
    const phone = data.phone; // E.164 e.g. "+917840985216"

    const { data: user, error } = await supabase
      .from("users")
      .select("*")
      .eq("phone", phone)
      .single();

    if (error || !user) {
      return res.status(401).json({
        verified: true,
        authorized: false,
        error: `No staff account linked to ${phone}. Contact your admin.`,
      });
    }

    // Return same shape as /login — strip password hash
    const { password_hash, ...safeUser } = user;
    return res.json({ verified: true, authorized: true, user: safeUser });
  } catch (error) {
    console.error("WhatsApp status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
