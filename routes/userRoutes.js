const express = require("express");
const bcrypt = require("bcrypt");
const { supabase } = require("../config/supabase");
const router = express.Router();

// GET all users (excluding password hashes)
router.get("/", async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from("users")
      .select("id, username, role, created_at, updated_at")
      .order("created_at", { ascending: true });

    if (error) {
      return res.status(500).json({ error: "Failed to fetch users" });
    }

    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST a new user
router.post("/", async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ error: "Username, password, and role are required" });
    }

    // Check if user exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("username", username)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: "Username already exists" });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Insert user
    const { data: newUser, error } = await supabase
      .from("users")
      .insert([{ username, password_hash, role }])
      .select("id, username, role, created_at, updated_at")
      .single();

    if (error) {
      console.error("Error inserting user:", error);
      return res.status(500).json({ error: "Failed to create user" });
    }

    res.status(201).json(newUser);
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT update a user (role or password)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { role, password } = req.body;

    const updates = {};
    if (role) updates.role = role;
    if (password) {
      updates.password_hash = await bcrypt.hash(password, 10);
    }
    updates.updated_at = new Date().toISOString();

    if (Object.keys(updates).length === 1 && updates.updated_at) {
        return res.status(400).json({ error: "No update fields provided" });
    }

    const { data: updatedUser, error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", id)
      .select("id, username, role, created_at, updated_at")
      .single();

    if (error) {
      console.error("Error updating user:", error);
      return res.status(500).json({ error: "Failed to update user" });
    }

    res.json(updatedUser);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE a user
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from("users")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting user:", error);
      return res.status(500).json({ error: "Failed to delete user" });
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
