const express = require("express");
const router = express.Router();
const InventoryModel = require("../models/InventoryModel");
const { v4: uuidv4 } = require("uuid");
// GET full inventory state
router.get("/full-data", (req, res) => {
  try {
    const data = InventoryModel.getFullData();
    res.json(data);
  } catch (err) {
    console.error("Failed to get full data:", err);
    res.status(500).json({ error: "Failed to load inventory data" });
  }
});

// POST adjust stock level
router.post("/adjust-stock", (req, res) => {
  try {
    const {
      itemType,
      itemId,
      quantityChange,
      reason,
      recordedBy,
      expiryDate,
      fifo = false,
      batchId = null,
    } = req.body;

    // Validate required fields
    if (!itemType || !itemId || quantityChange === undefined) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate quantity is a number
    if (typeof quantityChange !== "number") {
      return res.status(400).json({ error: "quantityChange must be a number" });
    }

    const data = InventoryModel.adjustStock({
      itemType,
      itemId,
      quantityChange,
      reason: reason || "manual adjustment",
      recordedBy: recordedBy || "system",
      expiryDate: expiryDate || undefined,
      fifo,
      batchId,
    });

    res.json(data);
  } catch (error) {
    console.error("Adjust stock error:", error);
    res.status(400).json({
      error: error.message,
      details: error.stack,
      // Add more context for batch operations
      ...(error.batchId && { batchId: error.batchId }),
      ...(error.availableBatches && {
        availableBatches: error.availableBatches,
      }),
    });
  }
});
router.get("/batch-history/:itemType/:itemId", (req, res) => {
  try {
    const { itemType, itemId } = req.params;
    const { period = "3m" } = req.query;

    const history = InventoryModel.getItemBatchHistory(
      itemType,
      itemId,
      period
    );
    res.json(history);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get history for a specific batch
router.get("/batch-history/:batchId", (req, res) => {
  try {
    const { batchId } = req.params;
    const history = InventoryModel.getBatchHistory(batchId);
    res.json(history);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all batch history
router.get("/batch-history", (req, res) => {
  try {
    const { period = "3m" } = req.query;
    const history = InventoryModel.getAllBatchHistory(period);
    res.json(history);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
// inventoryRoutes.js
router.post("/purchaseOrder", (req, res) => {
  try {
    // Validate required fields
    if (!req.body.supplierId) {
      return res.status(400).json({ error: "Supplier ID is required" });
    }
    if (!req.body.items || !Array.isArray(req.body.items)) {
      return res.status(400).json({ error: "Items array is required" });
    }

    // Process the order
    const data = InventoryModel.createPurchaseOrder(req.body);


    return res.status(201).json(data);
  } catch (error) {
    console.error("PO Creation Error:", error);
    return res.status(400).json({
      error: error.message || "Failed to create purchase order",
      details: error.stack,
    });
  }
});

// PUT receive purchase order
router.put("/purchaseOrder/:id/receive", (req, res) => {
  try {
    const { id } = req.params;
    const { receivedItems } = req.body;
    const data = InventoryModel.receivePurchaseOrder(id, receivedItems);
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
// Add this PUT route for updating purchase orders
router.put("/purchaseOrder/:id", (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validate required fields
    if (!updateData.supplierId) {
      return res.status(400).json({ error: "Supplier ID is required" });
    }
    if (!updateData.items || !Array.isArray(updateData.items)) {
      return res.status(400).json({ error: "Items array is required" });
    }

    // Process the update
    const data = InventoryModel.updatePurchaseOrder(id, updateData);

    return res.json(data);
  } catch (error) {
    console.error("PO Update Error:", error);
    return res.status(400).json({
      error: error.message || "Failed to update purchase order",
      details: error.stack,
    });
  }
});

router.get("/recipes", (req, res) => {
  try {
    const data = InventoryModel.getFullData();
    res.json(data.recipes || []);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch recipes" });
  }
});

// GET single recipe by ID
router.get("/recipes/:id", (req, res) => {
  try {
    const { id } = req.params;
    const data = InventoryModel.getFullData();
    const recipe = data.recipes.find((r) => r.id === id);

    if (!recipe) {
      return res.status(404).json({ error: "Recipe not found" });
    }

    res.json(recipe);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch recipe" });
  }
});

// POST create new recipe
router.post("/recipes", (req, res) => {
  try {
    const data = InventoryModel.getFullData();
    const newRecipe = {
      ...req.body,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    data.recipes.push(newRecipe);
    InventoryModel.writeData(data);

    res.status(201).json(newRecipe);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update existing recipe
router.put("/recipes/:id", (req, res) => {
  try {
    const { id } = req.params;
    const data = InventoryModel.getFullData();
    const recipeIndex = data.recipes.findIndex((r) => r.id === id);

    if (recipeIndex === -1) {
      return res.status(404).json({ error: "Recipe not found" });
    }

    const updatedRecipe = {
      ...data.recipes[recipeIndex],
      ...req.body,
      updatedAt: new Date().toISOString(),
    };

    data.recipes[recipeIndex] = updatedRecipe;
    InventoryModel.writeData(data);

    res.json(updatedRecipe);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE recipe
router.delete("/recipes/:id", (req, res) => {
  try {
    const { id } = req.params;
    const data = InventoryModel.getFullData();
    const recipeIndex = data.recipes.findIndex((r) => r.id === id);

    if (recipeIndex === -1) {
      return res.status(404).json({ error: "Recipe not found" });
    }

    data.recipes.splice(recipeIndex, 1);
    InventoryModel.writeData(data);

    res.json({ success: true, message: "Recipe deleted successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
// POST add new item
router.post("/:collection", (req, res) => {
  try {
    const { collection } = req.params;
    const validCollections = [
      "ingredients",
      "readyMadeItems",
      "suppliers",
      "categories",
      "recipes",
    ];

    if (!validCollections.includes(collection)) {
      return res.status(400).json({ error: "Invalid collection" });
    }

    const data = InventoryModel.addItem(collection, req.body);
    res.status(201).json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update existing item
router.put("/:collection/:id", (req, res) => {
  try {
    const { collection, id } = req.params;
    const validCollections = [
      "ingredients",
      "readyMadeItems",
      "suppliers",
      "categories",
      "recipes",
    ];

    if (!validCollections.includes(collection)) {
      return res.status(400).json({ error: "Invalid collection" });
    }

    const data = InventoryModel.updateItem(collection, id, req.body);
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
// Add this route to your inventoryRoutes.js
// Add this route to your inventoryRoutes.js
router.delete("/ingredients/:id", (req, res) => {
  try {
    const { id } = req.params;
    const data = InventoryModel.deleteItem("ingredients", id);
    res.json({
      success: true,
      message: "Ingredient deleted successfully",
      data,
    });
  } catch (error) {
    console.error("Delete failed:", error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});
// POST record waste
router.post("/waste-records", (req, res) => {
  try {
    const data = InventoryModel.recordWaste(req.body);
    res.status(201).json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Add a new route for expired batch removal
router.post("/ingredients/:id/remove-expired", (req, res) => {
  try {
    console.log(
      "Removing expired batches for ingredient:",
      req.params.id,
      req.body
    );

    const results = InventoryModel.removeExpiredBatches(
      req.params.id,
      req.body.recordedBy || "system"
    );
    res.status(200).json(results);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST create purchase order

// PUT resolve alert
router.put("/alerts/:id/resolve", (req, res) => {
  try {
    const { id } = req.params;
    const { resolutionNotes } = req.body;
    const data = InventoryModel.resolveAlert(id, resolutionNotes || "");
    res.json(data);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Additional utility endpoints
router.get("/transactions", (req, res) => {
  try {
    const { startDate, endDate, itemId } = req.query;
    const data = InventoryModel.getFullData();

    let transactions = data.inventoryTransactions;

    if (startDate) {
      transactions = transactions.filter(
        (t) => new Date(t.date) >= new Date(startDate)
      );
    }

    if (endDate) {
      transactions = transactions.filter(
        (t) => new Date(t.date) <= new Date(endDate)
      );
    }

    if (itemId) {
      transactions = transactions.filter((t) => t.itemId === itemId);
    }

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

router.get("/low-stock-items", (req, res) => {
  try {
    const data = InventoryModel.getFullData();
    const threshold = data.settings.lowStockThreshold || 0.2;

    const lowStockItems = [
      ...data.ingredients.filter(
        (i) => i.currentStock < i.minStock * (1 + threshold)
      ),
      ...data.readyMadeItems.filter(
        (i) => i.currentStock < i.minStock * (1 + threshold)
      ),
    ];

    res.json(lowStockItems);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch low stock items" });
  }
});

module.exports = router;
