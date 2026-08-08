const express = require("express");
const bcrypt = require("bcrypt");
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const { supabase } = require("../config/supabase");
const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    // Query user from Supabase
    const { data: users, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username)
      .single();

    if (error || !users) {
      return res.status(401).json({ error: "Invalid username" });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, users.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password" });
    }

    // Return user data without password hash
    const { password_hash, ...safeUser } = users;
    res.json(safeUser);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/google-login", async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: "Google credential is required" });
    }

    // Verify the Google JWT token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const email = payload.email;

    if (!email) {
      return res.status(400).json({ error: "Google account missing email" });
    }

    // Query user from Supabase to see if the email matches a staff account
    const { data: users, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", email)
      .single();

    if (error || !users) {
      // Don't auto-register random Google accounts, only allow existing staff
      return res.status(401).json({ error: "Unauthorized Google account. Please use a registered staff account." });
    }

    // Return user data without password hash
    const { password_hash, ...safeUser } = users;
    res.json(safeUser);
  } catch (error) {
    console.error("Google Login error:", error);
    res.status(500).json({ error: "Internal server error during Google login" });
  }
});
module.exports = router;
