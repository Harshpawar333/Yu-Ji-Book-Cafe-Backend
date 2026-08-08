// routes/externalOrderRoutes.js
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();
const { readDataFile, writeDataFile } = require("../utils/fileUtils");
const { getNextToken } = require("../utils/tokenUtils");
const { tryDeductInventory } = require("../utils/inventoryHelper");

// POST /api/external-orders - Create new external order
router.post("/", async (req, res) => {
  try {
    let { source, items, paymentMethod = "online" } = req.body;

    // Keep all your existing validation
    if (!source || typeof source !== "string") {
      return res.status(400).json({ error: "Valid source is required" });
    }

    // Special handling for Owner orders
    if (source.startsWith("Owner-")) {
      const ownerName = source.replace("Owner-", "").trim();
      if (!ownerName) {
        return res.status(400).json({ error: "Owner name is required" });
      }
      source = `Owner- ${ownerName}`;
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "At least one item is required" });
    }

    // Force online payment for Zomato/Swiggy
    const finalPaymentMethod = ["zomato", "swiggy"].includes(
      source.toLowerCase()
    )
      ? "online"
      : paymentMethod;

    // Validate payment method
    if (!["cash", "online"].includes(finalPaymentMethod)) {
      return res.status(400).json({ error: "Invalid payment method" });
    }

    // Calculate totals (keep existing logic)
    const now = new Date();
    const dateKey = now.toISOString().split("T")[0];
    const orderTotal = items.reduce((sum, item) => {
      if (!item.id || !item.price || !item.quantity) {
        throw new Error("Invalid item format");
      }
      return sum + item.price * item.quantity;
    }, 0);

    const orderTokenNumber = getNextToken();

    // Create order object (keep existing structure)
    const newOrder = {
      id: uuidv4(),
      source,
      items: items.map((item) => ({
        id: item.id,
        name: item.name || `Item ${item.id}`,
        price: item.price,
        quantity: item.quantity,
        isRedeemable: item.isRedeemable || false,
      })),
      total: orderTotal,
      redeemed: 0,
      payable: orderTotal,
      paymentMethod: finalPaymentMethod,
      tokenNumber: orderTokenNumber,
      timestamp: now.toISOString(),
    };

    // Save to data file (keep existing logic)
    const data = readDataFile() || {};
    if (!data.externalOrders) data.externalOrders = {};
    if (!data.externalOrders[dateKey]) data.externalOrders[dateKey] = [];

    data.externalOrders[dateKey].push(newOrder);

    if (!writeDataFile(data)) {
      throw new Error("Failed to save data");
    }

    // NEW: Try to deduct inventory (non-blocking)
    const { warnings } = await tryDeductInventory(items);

    // Prepare response (keep all existing fields)
    const response = {
      success: true,
      message: `External order from ${source} saved`,
      order: newOrder,
      token: orderTokenNumber,
      // Add inventory warnings if any (won't fail the order)
      ...(warnings.length > 0 && { inventoryWarnings: warnings }),
    };

    res.status(201).json(response);
  } catch (error) {
    console.error("External order error:", error);
    res.status(500).json({
      error: "Failed to process external order",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// GET /api/external-orders - Get external orders
router.get("/", (req, res) => {
  try {
    const { date, source, paymentMethod } = req.query;
    const data = readDataFile() || {};

    if (!data.externalOrders) {
      return res.json([]);
    }

    // Filter by date if provided
    let results = {};
    if (date) {
      if (data.externalOrders[date]) {
        results[date] = data.externalOrders[date];
      }
    } else {
      results = data.externalOrders;
    }

    // Filter by source if provided
    if (source) {
      for (const dateKey in results) {
        results[dateKey] = results[dateKey].filter((order) =>
          order.source.toLowerCase().includes(source.toLowerCase())
        );
      }
    }

    // Filter by payment method if provided
    if (paymentMethod) {
      for (const dateKey in results) {
        results[dateKey] = results[dateKey].filter(
          (order) => order.paymentMethod === paymentMethod
        );
      }
    }

    res.json(results);
  } catch (error) {
    console.error("Get external orders error:", error);
    res.status(500).json({
      error: "Failed to fetch external orders",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

module.exports = router;
