const express = require("express");
const router = express.Router();
const {
  readDataFile,
  writeDataFile,
  createBackup,
} = require("../utils/fileUtils");

// Get all data
router.get("/", (req, res) => {
  const data = readDataFile();
  if (!data) return res.status(500).json({ error: "Failed to read data" });
  res.json(data);
});

// Save all data
router.post("/", (req, res) => {
  if (!req.body) return res.status(400).json({ error: "No data provided" });

  const backup = createBackup();
  if (!backup) console.warn("Backup failed, proceeding with save anyway");

  const success = writeDataFile(req.body);
  if (!success) return res.status(500).json({ error: "Failed to save data" });

  res.json({
    message: "Data saved successfully",
    backup: backup ? path.basename(backup) : null,
  });
});

module.exports = router;
