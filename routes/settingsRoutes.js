const express = require("express");
const router = express.Router();
const { readDataFile, writeDataFile } = require("../utils/fileUtils");

// Get settings
router.get("/", (req, res) => {
  const data = readDataFile();
  if (!data) return res.status(500).json({ error: "Failed to read data" });
  res.json(data.settings);
});

// Update settings
router.put("/", (req, res) => {
  const data = readDataFile();
  if (!data) return res.status(500).json({ error: "Failed to read data" });

  const { entryFee, timePerEntry } = req.body;

  if (entryFee !== undefined) {
    data.settings.entryFee = Number(entryFee);
  }

  if (timePerEntry !== undefined) {
    data.settings.timePerEntry = Number(timePerEntry);
  }

  writeDataFile(data);
  res.json(data.settings);
});

module.exports = router;
