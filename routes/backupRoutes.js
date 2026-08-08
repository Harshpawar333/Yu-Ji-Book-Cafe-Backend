const express = require("express");
const router = express.Router();
const path = require("path");
const { createBackup, readDataFile } = require("../utils/fileUtils");

// Create backup
router.post("/", (req, res) => {
  const backup = createBackup();
  if (!backup)
    return res.status(500).json({ error: "Failed to create backup" });
  res.json({ backup: path.basename(backup) });
});

// List backups
router.get("/", (req, res) => {
  try {
    const data = readDataFile();
    if (!data) return res.status(500).json({ error: "Failed to read data" });

    const backups = data.backups || [];
    res.json(backups);
  } catch (error) {
    res.status(500).json({ error: "Failed to list backups" });
  }
});

module.exports = router;
