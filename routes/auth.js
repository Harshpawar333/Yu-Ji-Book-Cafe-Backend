const express = require("express");
const bcrypt = require("bcrypt");
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

module.exports = router;
