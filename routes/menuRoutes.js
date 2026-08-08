const express = require("express");
const router = express.Router();
const { readDataFile, writeDataFile } = require("../utils/fileUtils");

// Get all menu items
router.get("/", (req, res) => {
  const data = readDataFile();
  if (!data) return res.status(500).json({ error: "Failed to read data" });
  res.json(data.menuItems);
});

// Add new menu item
router.post("/", (req, res) => {
  const data = readDataFile();
  if (!data) return res.status(500).json({ error: "Failed to read data" });

  const { name, price, isRedeemable } = req.body;
  if (!name || !price) {
    return res.status(400).json({ error: "Name and price are required" });
  }

  const newItem = {
    id:
      data.menuItems.length > 0
        ? Math.max(...data.menuItems.map((item) => item.id)) + 1
        : 1,
    name,
    price: Number(price),
    isRedeemable: Boolean(isRedeemable),
  };

  data.menuItems.push(newItem);
  writeDataFile(data);
  res.status(201).json(newItem);
});

// Update menu item
router.put("/:id", (req, res) => {
  const data = readDataFile();
  if (!data) return res.status(500).json({ error: "Failed to read data" });

  const itemId = Number(req.params.id);
  const itemIndex = data.menuItems.findIndex((item) => item.id === itemId);

  if (itemIndex === -1) {
    return res.status(404).json({ error: "Menu item not found" });
  }

  const { name, price, isRedeemable } = req.body;
  const updatedItem = {
    ...data.menuItems[itemIndex],
    name: name || data.menuItems[itemIndex].name,
    price:
      price !== undefined ? Number(price) : data.menuItems[itemIndex].price,
    isRedeemable:
      isRedeemable !== undefined
        ? Boolean(isRedeemable)
        : data.menuItems[itemIndex].isRedeemable,
  };

  data.menuItems[itemIndex] = updatedItem;
  writeDataFile(data);
  res.json(updatedItem);
});

// Delete menu item
router.delete("/:id", (req, res) => {
  const data = readDataFile();
  if (!data) return res.status(500).json({ error: "Failed to read data" });

  const itemId = Number(req.params.id);
  const itemIndex = data.menuItems.findIndex((item) => item.id === itemId);

  if (itemIndex === -1) {
    return res.status(404).json({ error: "Menu item not found" });
  }

  data.menuItems.splice(itemIndex, 1);
  writeDataFile(data);
  res.json({ message: "Menu item deleted successfully" });
});

module.exports = router;
