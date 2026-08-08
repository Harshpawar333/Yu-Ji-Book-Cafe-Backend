const express = require("express");
const router = express.Router();
const InventoryController = require("../controllers/InventoryController");

// POS ↔ Inventory sync endpoints
router.post("/sync-stock", InventoryController.syncStockLevels);
router.post("/sync-waste", InventoryController.syncWasteRecords);

module.exports = router;
