const InventoryModel = require("../models/InventoryModel");
const { generateReports } = require("../utils/reportGenerator");

class InventoryService {
  // Core Inventory Operations

  static getFullData() {
    try {
      return InventoryModel.getFullData();
    } catch (error) {
      console.error("Failed to fetch inventory data:", error);
      throw new Error("Failed to load inventory data");
    }
  }

  static adjustStock(params) {
    try {
      const { itemType, itemId, quantityChange } = params;

      // Additional business logic validation
      if (typeof quantityChange !== "number") {
        throw new Error("Invalid quantity change");
      }

      const data = InventoryModel.adjustStock(params);

      // Generate low stock alert if needed
      if (quantityChange < 0) {
        this.checkLowStockLevels(data);
      }

      return data;
    } catch (error) {
      console.error("Stock adjustment failed:", error);
      throw error;
    }
  }

  static addItem(collection, itemData) {
    try {
      if (
        !["ingredients", "readyMadeItems", "suppliers"].includes(collection)
      ) {
        throw new Error("Invalid collection specified");
      }

      // Set default values
      const itemWithDefaults = {
        ...itemData,
        lastUpdated: new Date().toISOString(),
      };

      return InventoryModel.addItem(collection, itemWithDefaults);
    } catch (error) {
      console.error("Add item failed:", error);
      throw error;
    }
  }

  static updateItem(collection, id, updates) {
    try {
      // Prevent certain fields from being updated
      const restrictedFields = ["id", "createdAt"];
      const filteredUpdates = Object.keys(updates)
        .filter((key) => !restrictedFields.includes(key))
        .reduce((obj, key) => {
          obj[key] = updates[key];
          return obj;
        }, {});

      return InventoryModel.updateItem(collection, id, {
        ...filteredUpdates,
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Update item failed:", error);
      throw error;
    }
  }

  // Purchase Order Management

  static createPurchaseOrder(orderData) {
    try {
      // Validate required fields
      if (!orderData.items || orderData.items.length === 0) {
        throw new Error("Purchase order must contain items");
      }

      return InventoryModel.createPurchaseOrder({
        ...orderData,
        createdAt: new Date().toISOString(),
        status: "pending",
      });
    } catch (error) {
      console.error("PO creation failed:", error);
      throw error;
    }
  }

  static receivePurchaseOrder(orderId, receivedItems) {
    try {
      if (!receivedItems || receivedItems.length === 0) {
        throw new Error("Must specify received items");
      }

      return InventoryModel.receivePurchaseOrder(orderId, receivedItems);
    } catch (error) {
      console.error("PO receiving failed:", error);
      throw error;
    }
  }

  // Waste Management

  static recordWaste(wasteData) {
    try {
      if (wasteData.quantity <= 0) {
        throw new Error("Waste quantity must be positive");
      }

      return InventoryModel.recordWaste({
        ...wasteData,
        recordedBy: wasteData.recordedBy || "system",
      });
    } catch (error) {
      console.error("Waste recording failed:", error);
      throw error;
    }
  }

  // Alert Management

  static resolveAlert(alertId, resolutionNotes = "") {
    try {
      return InventoryModel.resolveAlert(alertId, resolutionNotes);
    } catch (error) {
      console.error("Alert resolution failed:", error);
      throw error;
    }
  }

  // Reporting

  static generateInventoryReport(type, params = {}) {
    try {
      const data = InventoryModel.getFullData();
      return generateReports(type, data, params);
    } catch (error) {
      console.error("Report generation failed:", error);
      throw error;
    }
  }

  // Helper Methods

  static checkLowStockLevels(inventoryData) {
    const threshold = inventoryData.settings.lowStockThreshold || 0.2;
    const now = new Date().toISOString();

    // Check ingredients
    inventoryData.ingredients.forEach((item) => {
      const isLowStock = item.currentStock < item.minStock * (1 + threshold);
      const existingAlertIndex = inventoryData.inventoryAlerts.findIndex(
        (a) => a.itemId === item.id && a.alertType === "lowStock"
      );

      if (isLowStock) {
        const alert = {
          id: `alert-${Date.now()}`,
          date: now,
          itemType: "ingredient",
          itemId: item.id,
          alertType: "lowStock",
          currentLevel: item.currentStock,
          minimumLevel: item.minStock,
          status: "unresolved",
        };

        if (existingAlertIndex >= 0) {
          inventoryData.inventoryAlerts[existingAlertIndex] = alert;
        } else {
          inventoryData.inventoryAlerts.push(alert);
        }
      } else if (existingAlertIndex >= 0) {
        inventoryData.inventoryAlerts.splice(existingAlertIndex, 1);
      }
    });

    // Repeat for readyMadeItems if needed
  }
}

module.exports = InventoryService;
