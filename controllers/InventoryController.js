const InventoryModel = require("../models/InventoryModel");
const {
  validateItem,
  validateStockAdjustment,
} = require("../utils/validators");

class InventoryController {
  // Get complete inventory state
  static async getFullData(req, res) {
    try {
      const data = InventoryModel.getFullData();
      res.json(data);
    } catch (error) {
      console.error("Failed to fetch inventory data:", error);
      res.status(500).json({ error: "Failed to load inventory data" });
    }
  }

  // Adjust stock levels
  static async adjustStock(req, res) {
    try {
      const { error } = validateStockAdjustment(req.body);
      if (error)
        return res.status(400).json({ error: error.details[0].message });

      const data = InventoryModel.adjustStock(req.body);
      res.json(data);
    } catch (error) {
      console.error("Stock adjustment failed:", error);
      res.status(400).json({ error: error.message });
    }
  }

  // Add new inventory item
  static async addItem(req, res) {
    try {
      const { collection } = req.params;
      const { error } = validateItem(req.body, collection);
      if (error)
        return res.status(400).json({ error: error.details[0].message });

      const data = InventoryModel.addItem(collection, req.body);
      res.status(201).json(data);
    } catch (error) {
      console.error("Add item failed:", error);
      res.status(400).json({ error: error.message });
    }
  }

  // Update existing item
  static async updateItem(req, res) {
    try {
      const { collection, id } = req.params;
      const { error } = validateItem(req.body, collection);
      if (error)
        return res.status(400).json({ error: error.details[0].message });

      const data = InventoryModel.updateItem(collection, id, req.body);
      res.json(data);
    } catch (error) {
      console.error("Update item failed:", error);
      res.status(400).json({ error: error.message });
    }
  }

  // Record waste
  static async recordWaste(req, res) {
    try {
      const data = InventoryModel.recordWaste(req.body);
      res.status(201).json(data);
    } catch (error) {
      console.error("Waste recording failed:", error);
      res.status(400).json({ error: error.message });
    }
  }

  // Create purchase order
  static async createPurchaseOrder(req, res) {
    try {
      const data = InventoryModel.createPurchaseOrder(req.body);
      res.status(201).json(data);
    } catch (error) {
      console.error("PO creation failed:", error);
      res.status(400).json({ error: error.message });
    }
  }

  // Receive purchase order
  static async receivePurchaseOrder(req, res) {
    try {
      const { id } = req.params;
      const data = InventoryModel.receivePurchaseOrder(
        id,
        req.body.receivedItems
      );
      res.json(data);
    } catch (error) {
      console.error("PO receiving failed:", error);
      res.status(400).json({ error: error.message });
    }
  }

  // Resolve alert
  static async resolveAlert(req, res) {
    try {
      const { id } = req.params;
      const data = InventoryModel.resolveAlert(
        id,
        req.body.resolutionNotes || ""
      );
      res.json(data);
    } catch (error) {
      console.error("Alert resolution failed:", error);
      res.status(400).json({ error: error.message });
    }
  }

  // Get filtered transactions
  static async getTransactions(req, res) {
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
      console.error("Transaction fetch failed:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  }

  // Get low stock items
  static async getLowStockItems(req, res) {
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
      console.error("Low stock items fetch failed:", error);
      res.status(500).json({ error: "Failed to fetch low stock items" });
    }
  }
}

module.exports = InventoryController;
