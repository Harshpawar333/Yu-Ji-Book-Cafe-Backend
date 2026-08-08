const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const DATA_PATH = path.join(__dirname, "../data/inventory.json");
const BACKUP_DIR = path.join(__dirname, "../data/backups/inventory");
const BOOKCAFE_PATH = path.join(__dirname, "../data/bookcafe-data.json");
const MAX_BACKUPS = 30; // Keep last 30 backups

class InventoryModel {
  constructor() {
    this.ensureDataFile();
    this.ensureBackupDir();
  }

  // Helper methods for file operations
  ensureDataFile() {
    if (!fs.existsSync(DATA_PATH)) {
      const initialData = {
        settings: {
          lowStockThreshold: 0.2,
          defaultUnit: "grams",
          costPrecision: 2,
          expiryAlertDays: 3,
          inventoryMode: "manual",
          backupFrequency: "daily",
        },
        categories: [
          {
            id: uuidv4(),
            name: "Beverage Ingredients",
            description: "Coffee, tea, syrups",
          },
        ],
        units: [{ id: uuidv4(), name: "grams", symbol: "g" }],
        ingredients: [],
        readyMadeItems: [],
        suppliers: [],
        recipes: [],
        inventoryTransactions: [],
        purchaseOrders: [],
        wasteRecords: [],
        inventoryAlerts: [],
        batchHistory: [],
        users: [
          {
            id: uuidv4(),
            name: "Admin",
            role: "admin",
            permissions: {
              viewInventory: true,
              editInventory: true,
              createPurchaseOrders: true,
              approveOrders: true,
              viewReports: true,
            },
          },
        ],
      };
      this.writeData(initialData);
    }
  }

  ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
  }

  readData() {
    const rawData = fs.readFileSync(DATA_PATH, "utf8");
    return JSON.parse(rawData);
  }

  writeData(data) {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
    this.maybeCreateBackup(data);
  }
  recordWaste(wasteData) {
    const data = this.readData();

    // Validate required fields
    if (!wasteData.ingredientId || !wasteData.quantity || !wasteData.reason) {
      throw new Error("Missing required waste record fields");
    }

    // Find the ingredient
    const ingredient = data.ingredients.find(
      (i) => i.id === wasteData.ingredientId
    );
    if (!ingredient) {
      throw new Error("Ingredient not found");
    }

    // Create the waste record
    const wasteRecord = {
      id: uuidv4(),
      date: new Date().toISOString(),
      itemType: "ingredient",
      itemId: wasteData.ingredientId,
      ingredientName: ingredient.name,
      quantity: wasteData.quantity,
      unitId: ingredient.unitId,
      unitName: data.units.find((u) => u.id === ingredient.unitId)?.name || "",
      batchId: wasteData.batchId || null,
      expiryDate: wasteData.expiryDate || null,
      reason: wasteData.reason,
      cost: wasteData.cost || wasteData.quantity * ingredient.costPerUnit,
      recordedBy: wasteData.recordedBy || "system",
      notes: wasteData.notes || "",
    };

    // Add to waste records
    data.wasteRecords.unshift(wasteRecord);
    this.writeData(data);

    return wasteRecord;
  }
  // Backup management (unchanged except removed lock references)
  updatePurchaseOrder(id, updateData) {
    const data = this.readData();
    const poIndex = data.purchaseOrders.findIndex((po) => po.id === id);

    if (poIndex === -1) {
      throw new Error("Purchase order not found");
    }

    // Preserve existing fields that aren't being updated
    const updatedPO = {
      ...data.purchaseOrders[poIndex],
      ...updateData,
      updatedAt: new Date().toISOString(),
    };

    // Validate items structure
    if (updateData.items) {
      updatedPO.items = updateData.items.map((item) => ({
        itemType: item.itemType,
        itemId: item.itemId,
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost),
        ...(item.receivedQuantity && {
          receivedQuantity: Number(item.receivedQuantity),
        }),
      }));
    }

    data.purchaseOrders[poIndex] = updatedPO;
    this.writeData(data);
    return updatedPO;
  }
  maybeCreateBackup(data) {
    const now = new Date();
    const lastBackup = this.getLastBackupTime();
    const frequency = data.settings?.backupFrequency || "daily";

    let shouldBackup = false;

    if (!lastBackup) {
      shouldBackup = true;
    } else {
      const timeDiff = now - lastBackup;

      switch (frequency) {
        case "daily":
          shouldBackup = timeDiff >= 24 * 60 * 60 * 1000;
          break;
        case "weekly":
          shouldBackup = timeDiff >= 7 * 24 * 60 * 60 * 1000;
          break;
        case "monthly":
          shouldBackup = timeDiff >= 30 * 24 * 60 * 60 * 1000;
          break;
        default:
          shouldBackup = timeDiff >= 24 * 60 * 60 * 1000;
      }
    }

    if (shouldBackup) {
      this.createBackup();
    }
  }

  getLastBackupTime() {
    const backups = this.listBackups();
    if (backups.length === 0) return null;

    const lastBackupFile = backups[0];
    const stats = fs.statSync(path.join(BACKUP_DIR, lastBackupFile));
    return stats.mtime;
  }

  createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(
      BACKUP_DIR,
      `inventory-backup-${timestamp}.json`
    );

    fs.copyFileSync(DATA_PATH, backupPath);
    this.cleanupOldBackups();
  }

  listBackups() {
    if (!fs.existsSync(BACKUP_DIR)) return [];

    return fs
      .readdirSync(BACKUP_DIR)
      .filter(
        (file) => file.startsWith("inventory-backup-") && file.endsWith(".json")
      )
      .sort()
      .reverse();
  }
  // Add this method to your InventoryModel
  // Add this method to your InventoryModel class
  deleteItem(collection, id) {
    const data = this.readData();

    if (!data[collection]) {
      throw new Error(`Collection ${collection} not found`);
    }

    const index = data[collection].findIndex((item) => item.id === id);
    if (index === -1) {
      throw new Error(`Item with id ${id} not found in ${collection}`);
    }

    // Remove the item from the collection
    data[collection].splice(index, 1);

    // Also remove any related transactions or alerts
    data.inventoryTransactions = data.inventoryTransactions.filter(
      (t) => !(t.itemId === id && t.itemType === collection.slice(0, -1)) // removes 's' from end (ingredients -> ingredient)
    );

    data.inventoryAlerts = data.inventoryAlerts.filter(
      (a) => !(a.itemId === id && a.itemType === collection.slice(0, -1))
    );

    this.writeData(data);
    return data;
  }
  cleanupOldBackups() {
    const backups = this.listBackups();

    if (backups.length > MAX_BACKUPS) {
      const toDelete = backups.slice(MAX_BACKUPS);

      toDelete.forEach((file) => {
        try {
          fs.unlinkSync(path.join(BACKUP_DIR, file));
        } catch (err) {
          console.error(`Failed to delete old backup ${file}:`, err);
        }
      });
    }
  }

  restoreBackup(backupFile) {
    const backupPath = path.join(BACKUP_DIR, backupFile);

    if (!fs.existsSync(backupPath)) {
      throw new Error("Backup file not found");
    }

    fs.copyFileSync(backupPath, DATA_PATH);
    return true;
  }

  // Core inventory operations (unchanged except removed lock references)
  getFullData() {
    const inventoryData = this.readData();

    // Read book cafe data (file exists as per your confirmation)
    const bookCafeRaw = fs.readFileSync(BOOKCAFE_PATH, "utf8");
    const bookCafeData = JSON.parse(bookCafeRaw);

    // Return merged data with menuItems
    return {
      ...inventoryData, // Spread all inventory data
      menuItems: bookCafeData.menuItems || [], // Explicitly add menuItems
    };
  }

  adjustStock({
    itemType,
    itemId,
    quantityChange,
    reason,
    recordedBy,
    expiryDate,
    fifo = false,
    batchId = null,
    isWaste = false,
  }) {
    const data = this.readData();
    const collection =
      itemType === "ingredient" ? "ingredients" : "readyMadeItems";
    const itemIndex = data[collection].findIndex((item) => item.id === itemId);

    if (itemIndex === -1) throw new Error("Item not found");

    const item = data[collection][itemIndex];
    const now = new Date().toISOString();
    let batchHistoryEntries = [];
    let wasteRecord = null;

    // For stock reduction that's marked as waste
    if (quantityChange < 0 && isWaste) {
      const amountToDeduct = Math.abs(quantityChange);

      // Create waste record first
      wasteRecord = {
        ingredientId: itemId,
        quantity: amountToDeduct,
        reason: reason || "waste",
        expiryDate,
        batchId,
        cost: amountToDeduct * (item.costPerUnit || 0),
        recordedBy,
      };

      this.recordWaste(wasteRecord);
    }

    // For stock addition
    if (quantityChange > 0) {
      if (expiryDate) {
        const expiry = new Date(expiryDate);
        if (expiry < new Date()) {
          const err = new Error("Expiry date cannot be in the past");
          err.expiryDate = expiryDate;
          throw err;
        }

        // Add to existing batch or create new one
        const existingBatch = item.batches?.find(
          (b) => b.expiryDate === expiryDate
        );

        if (existingBatch) {
          existingBatch.quantity += quantityChange;
        } else {
          if (!item.batches) item.batches = [];
          item.batches.push({
            id: uuidv4(),
            quantity: quantityChange,
            expiryDate,
            addedDate: now,
          });
        }
      }
      item.currentStock += quantityChange;
    }
    // For stock reduction
    else if (quantityChange < 0) {
      const amountToDeduct = Math.abs(quantityChange);

      if (item.currentStock < amountToDeduct) {
        const err = new Error(
          `Insufficient stock. Only ${item.currentStock} available`
        );
        err.requested = amountToDeduct;
        err.available = item.currentStock;
        throw err;
      }

      // Case 1: Specific batch reduction
      if (batchId) {
        const batchIndex = item.batches?.findIndex((b) => b.id === batchId);
        if (batchIndex === -1) {
          const err = new Error("Specified batch not found");
          err.batchId = batchId;
          err.availableBatches = item.batches?.map((b) => b.id) || [];
          throw err;
        }

        const batch = item.batches[batchIndex];
        if (batch.quantity < amountToDeduct) {
          const err = new Error(`Batch only has ${batch.quantity} available`);
          err.batchId = batchId;
          err.available = batch.quantity;
          err.requested = amountToDeduct;
          throw err;
        }

        // Record history before modification
        batchHistoryEntries.push({
          batchId: batch.id,
          originalQuantity: batch.quantity,
          quantityChange: -amountToDeduct,
          remainingQuantity: batch.quantity - amountToDeduct,
          date: now,
          itemId,
          itemType,
          reason,
          recordedBy,
        });

        batch.quantity -= amountToDeduct;

        // Remove if empty
        if (batch.quantity <= 0) {
          item.batches.splice(batchIndex, 1);
        }
      }
      // Case 2: FIFO reduction
      else if (fifo && item.hasExpiry && item.batches?.length > 0) {
        let remaining = amountToDeduct;
        const sortedBatches = [...item.batches].sort(
          (a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)
        );

        for (const batch of sortedBatches) {
          if (remaining <= 0) break;

          const deduct = Math.min(remaining, batch.quantity);

          batchHistoryEntries.push({
            batchId: batch.id,
            originalQuantity: batch.quantity,
            quantityChange: -deduct,
            remainingQuantity: batch.quantity - deduct,
            date: now,
            itemId,
            itemType,
            reason,
            recordedBy,
          });

          batch.quantity -= deduct;
          remaining -= deduct;

          // Remove if empty
          if (batch.quantity <= 0) {
            const index = item.batches.findIndex((b) => b.id === batch.id);
            if (index !== -1) item.batches.splice(index, 1);
          }
        }

        if (remaining > 0) {
          const err = new Error(
            `Only ${amountToDeduct - remaining} could be deducted`
          );
          err.requested = amountToDeduct;
          err.deducted = amountToDeduct - remaining;
          throw err;
        }
      }
      // Case 3: Simple reduction (no batches)
      else if (item.hasExpiry && item.batches?.length > 0) {
        const err = new Error(
          "Cannot perform simple reduction on batched items"
        );
        err.solution = "Provide batchId or set fifo:true";
        throw err;
      }

      // Update current stock
      item.currentStock = item.hasExpiry
        ? item.batches?.reduce((sum, b) => sum + b.quantity, 0) || 0
        : item.currentStock - amountToDeduct;
    }

    // Update last modified
    item.lastUpdated = now;

    // Create transaction
    const transaction = {
      id: uuidv4(),
      date: now,
      type: quantityChange > 0 ? "stock-in" : "stock-out",
      itemType,
      itemId,
      quantity: Math.abs(quantityChange),
      reason,
      recordedBy,
      expiryDate,
      batchId,
      remainingStock: item.currentStock,
      isWaste: quantityChange < 0 && isWaste, // Mark if this was a waste transaction
    };

    data.inventoryTransactions.unshift(transaction);

    // Add batch history
    if (batchHistoryEntries.length > 0) {
      if (!data.batchHistory) data.batchHistory = [];
      data.batchHistory.unshift(...batchHistoryEntries);
    }

    this.writeData(data);

    return {
      updatedIngredient: item,
      newTransaction: transaction,
      batchHistoryEntries,
      wasteRecord,
    };
  }
  // Add these methods to your InventoryModel class

  // Get batch consumption history for a specific item
  getItemBatchHistory(itemType, itemId, timePeriod = "all") {
    const data = this.readData();
    if (!data.batchHistory) return [];

    const now = new Date();
    let cutoffDate;

    switch (timePeriod) {
      case "1m":
        cutoffDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case "2m":
        cutoffDate = new Date(now.setMonth(now.getMonth() - 2));
        break;
      case "3m":
        cutoffDate = new Date(now.setMonth(now.getMonth() - 3));
        break;
      case "6m":
        cutoffDate = new Date(now.setMonth(now.getMonth() - 6));
        break;
      case "1y":
        cutoffDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      case "all":
      default:
        cutoffDate = new Date(0); // Beginning of time
    }

    return data.batchHistory.filter(
      (entry) =>
        entry.itemType === itemType &&
        entry.itemId === itemId &&
        new Date(entry.date) >= cutoffDate
    );
  }

  // Get batch consumption history for a specific batch (even if deleted)
  getBatchHistory(batchId) {
    const data = this.readData();
    if (!data.batchHistory) return [];

    return data.batchHistory.filter((entry) => entry.batchId === batchId);
  }

  // Get all batch consumption within a time period
  getAllBatchHistory(timePeriod = "3m") {
    const data = this.readData();
    if (!data.batchHistory) return [];

    const now = new Date();
    let cutoffDate;

    switch (timePeriod) {
      case "1m":
        cutoffDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case "2m":
        cutoffDate = new Date(now.setMonth(now.getMonth() - 2));
        break;
      case "3m":
        cutoffDate = new Date(now.setMonth(now.getMonth() - 3));
        break;
      case "6m":
        cutoffDate = new Date(now.setMonth(now.getMonth() - 6));
        break;
      case "1y":
        cutoffDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      case "all":
      default:
        cutoffDate = new Date(0); // Beginning of time
    }

    return data.batchHistory.filter(
      (entry) => new Date(entry.date) >= cutoffDate
    );
  }
  addItem(collection, newItem) {
    const data = this.readData();

    const item = {
      ...newItem,
      id: uuidv4(),
      currentStock: Number(newItem.currentStock) || 0, // Convert to number, default to 0
      lastUpdated: new Date().toISOString(),
    };

    data[collection].push(item);
    this.writeData(data);
    return data;
  }
  // Add batch with expiry date
  addBatch(itemType, itemId, quantity, expiryDate) {
    const data = this.readData();
    const collection =
      itemType === "ingredient" ? "ingredients" : "readyMadeItems";
    const itemIndex = data[collection].findIndex((item) => item.id === itemId);

    if (itemIndex === -1) {
      throw new Error("Item not found");
    }

    const batch = {
      id: uuidv4(),
      quantity,
      expiryDate,
      addedDate: new Date().toISOString(),
    };

    if (!data[collection][itemIndex].batches) {
      data[collection][itemIndex].batches = [];
    }

    data[collection][itemIndex].batches.push(batch);
    data[collection][itemIndex].currentStock += quantity;
    data[collection][itemIndex].lastUpdated = new Date().toISOString();

    this.writeData(data);
    return data;
  }

  // Check for expired items
  checkExpiredItems() {
    const data = this.readData();
    const now = new Date();
    const expiryAlertDays = data.settings.expiryAlertDays || 3;
    const alertThreshold = new Date();
    alertThreshold.setDate(alertThreshold.getDate() + expiryAlertDays);

    data.ingredients.forEach((ingredient) => {
      if (!ingredient.batches) return;

      ingredient.batches.forEach((batch) => {
        if (!batch.expiryDate) return;

        const expiryDate = new Date(batch.expiryDate);
        const isExpired = expiryDate <= now;
        const isNearExpiry = expiryDate <= alertThreshold && expiryDate > now;
        const batchId = batch.id;

        // Remove existing alerts for this batch
        data.inventoryAlerts = data.inventoryAlerts.filter(
          (alert) =>
            !(alert.itemId === ingredient.id && alert.batchId === batchId)
        );

        if (isExpired || isNearExpiry) {
          const alertType = isExpired ? "expired" : "nearExpiry";
          data.inventoryAlerts.push({
            id: uuidv4(),
            date: new Date().toISOString(),
            itemType: "ingredient",
            itemId: ingredient.id,
            batchId,
            alertType,
            expiryDate: batch.expiryDate,
            quantity: batch.quantity,
            status: "unresolved",
          });
        }
      });
    });

    this.writeData(data);
    return data;
  }

  // Get items by expiry status
  removeExpiredBatches(ingredientId, recordedBy = "system") {
    const data = this.readData();
    const ingredient = data.ingredients.find((i) => i.id === ingredientId);

    if (!ingredient) {
      throw new Error("Ingredient not found");
    }

    if (!ingredient.batches || ingredient.batches.length === 0) {
      throw new Error("No batches found for this ingredient");
    }

    const now = new Date();
    const expiredBatches = ingredient.batches.filter((batch) => {
      return batch.expiryDate && new Date(batch.expiryDate) <= now;
    });

    if (expiredBatches.length === 0) {
      throw new Error("No expired batches found");
    }

    const results = [];

    // Create a copy of batches before modification
    const originalBatches = [...ingredient.batches];

    for (const batch of expiredBatches) {
      try {
        // Record waste first
        const wasteRecord = {
          id: uuidv4(),
          date: new Date().toISOString(),
          itemType: "ingredient",
          itemId: ingredientId,
          ingredientName: ingredient.name,
          quantity: batch.quantity,
          unitId: ingredient.unitId,
          unitName:
            data.units.find((u) => u.id === ingredient.unitId)?.name || "",
          batchId: batch.id,
          expiryDate: batch.expiryDate,
          reason: "Expired",
          cost: batch.quantity * (ingredient.costPerUnit || 0),
          recordedBy,
        };

        data.wasteRecords.unshift(wasteRecord);

        // Remove the batch from ingredient's batches
        ingredient.batches = ingredient.batches.filter(
          (b) => b.id !== batch.id
        );

        // Update current stock
        ingredient.currentStock = ingredient.batches.reduce(
          (sum, b) => sum + b.quantity,
          0
        );

        // Create transaction record
        const transaction = {
          id: uuidv4(),
          date: new Date().toISOString(),
          type: "stock-out",
          itemType: "ingredient",
          itemId: ingredientId,
          quantity: batch.quantity,
          reason: "Removed expired items",
          recordedBy,
          expiryDate: batch.expiryDate,
          batchId: batch.id,
          remainingStock: ingredient.currentStock,
        };
        data.inventoryTransactions.unshift(transaction);

        results.push({
          success: true,
          message: `Removed ${
            batch.quantity
          } expired items from batch expiring ${new Date(
            batch.expiryDate
          ).toLocaleDateString()}`,
          wasteRecord,
        });
      } catch (error) {
        // If something went wrong, revert the batches
        ingredient.batches = originalBatches;
        ingredient.currentStock = originalBatches.reduce(
          (sum, b) => sum + b.quantity,
          0
        );

        results.push({
          success: false,
          message: `Failed to remove expired batch: ${error.message}`,
        });
      }
    }

    // Save the changes
    this.writeData(data);
    return results;
  }
  getItemsByExpiryStatus(status) {
    const data = this.readData();
    const now = new Date();
    const expiryAlertDays = data.settings.expiryAlertDays || 3;
    const alertThreshold = new Date();
    alertThreshold.setDate(alertThreshold.getDate() + expiryAlertDays);

    return data.ingredients.reduce((result, ingredient) => {
      if (!ingredient.batches) return result;

      const matchingBatches = ingredient.batches.filter((batch) => {
        if (!batch.expiryDate) return false;
        const expiryDate = new Date(batch.expiryDate);

        switch (status) {
          case "expired":
            return expiryDate <= now;
          case "nearExpiry":
            return expiryDate <= alertThreshold && expiryDate > now;
          case "good":
            return expiryDate > alertThreshold;
          default:
            return false;
        }
      });

      if (matchingBatches.length > 0) {
        result.push({
          ...ingredient,
          batches: matchingBatches,
        });
      }

      return result;
    }, []);
  }

  // FIFO (First-In-First-Out) consumption
  consumeItem(itemType, itemId, quantity) {
    const data = this.readData();
    const collection =
      itemType === "ingredient" ? "ingredients" : "readyMadeItems";
    const itemIndex = data[collection].findIndex((item) => item.id === itemId);

    if (itemIndex === -1) {
      throw new Error("Item not found");
    }

    const item = data[collection][itemIndex];

    if (!item.batches || item.batches.length === 0) {
      // Fallback to simple stock reduction if no batches
      item.currentStock -= quantity;
      item.lastUpdated = new Date().toISOString();
      this.writeData(data);
      return data;
    }

    // Sort batches by expiry date (oldest first)
    const sortedBatches = [...item.batches].sort(
      (a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)
    );

    let remaining = quantity;
    for (const batch of sortedBatches) {
      if (remaining <= 0) break;

      if (batch.quantity > remaining) {
        batch.quantity -= remaining;
        remaining = 0;
      } else {
        remaining -= batch.quantity;
        batch.quantity = 0;
      }
    }

    // Remove empty batches
    item.batches = item.batches.filter((batch) => batch.quantity > 0);
    item.currentStock = item.batches.reduce(
      (sum, batch) => sum + batch.quantity,
      0
    );
    item.lastUpdated = new Date().toISOString();

    if (remaining > 0) {
      throw new Error(`Not enough stock (short by ${remaining})`);
    }

    this.writeData(data);
    return data;
  }
  updateItem(collection, id, updatedFields) {
    const data = this.readData();
    const index = data[collection].findIndex((item) => item.id === id);

    if (index === -1) {
      throw new Error("Item not found");
    }

    data[collection][index] = {
      ...data[collection][index],
      ...updatedFields,
      lastUpdated: new Date().toISOString(),
    };

    this.writeData(data);
    return data;
  }

  cleanupExpiredItems() {
    const data = this.readData();
    const now = new Date();
    let totalWaste = 0;

    data.ingredients.forEach((ingredient) => {
      if (!ingredient.batches) return;

      const expiredBatches = ingredient.batches.filter((batch) => {
        return batch.expiryDate && new Date(batch.expiryDate) <= now;
      });

      expiredBatches.forEach((batch) => {
        // Record waste
        const wasteCost = batch.quantity * (ingredient.costPerUnit || 0);
        totalWaste += wasteCost;

        data.wasteRecords.unshift({
          id: uuidv4(),
          date: new Date().toISOString(),
          itemType: "ingredient",
          itemId: ingredient.id,
          quantity: batch.quantity,
          reason: "Expired",
          cost: wasteCost,
          recordedBy: "system",
        });

        // Remove from stock
        ingredient.currentStock -= batch.quantity;
      });

      // Remove expired batches
      ingredient.batches = ingredient.batches.filter((batch) => {
        return !batch.expiryDate || new Date(batch.expiryDate) > now;
      });
    });

    this.writeData(data);
    return {
      cleanedItems: data.ingredients.filter(
        (i) => i.batches && i.batches.some((b) => b.expiryDate <= now)
      ),
      totalWaste,
    };
  }

  createPurchaseOrder(orderData) {
    const data = this.readData();
    const po = {
      ...orderData,
      id: uuidv4(),
      date: new Date().toISOString(),
      status: "pending",
    };
    data.purchaseOrders.push(po);
    this.writeData(data);
    return data;
  }

  receivePurchaseOrder(orderId, receivedItems) {
    const data = this.readData();
    const poIndex = data.purchaseOrders.findIndex((po) => po.id === orderId);

    if (poIndex === -1) {
      throw new Error("Purchase order not found");
    }

    data.purchaseOrders[poIndex] = {
      ...data.purchaseOrders[poIndex],
      status: "received",
      receivedDate: new Date().toISOString(),
    };

    receivedItems.forEach((item) => {
      const collection =
        item.itemType === "ingredient" ? "ingredients" : "readyMadeItems";
      const itemIndex = data[collection].findIndex((i) => i.id === item.itemId);

      if (itemIndex !== -1) {
        data[collection][itemIndex] = {
          ...data[collection][itemIndex],
          currentStock:
            data[collection][itemIndex].currentStock + item.quantity,
          lastUpdated: new Date().toISOString(),
        };

        data.inventoryTransactions.unshift({
          id: uuidv4(),
          date: new Date().toISOString(),
          type: "stock-in",
          itemType: item.itemType,
          itemId: item.itemId,
          quantity: item.quantity,
          reason: `PO ${orderId} received`,
          recordedBy: "system",
          costImpact: item.quantity * (item.unitCost || 0),
        });
      }
    });

    this.writeData(data);
    return data;
  }

  resolveAlert(alertId, resolutionNotes) {
    const data = this.readData();
    const alertIndex = data.inventoryAlerts.findIndex((a) => a.id === alertId);

    if (alertIndex !== -1) {
      data.inventoryAlerts[alertIndex] = {
        ...data.inventoryAlerts[alertIndex],
        status: "resolved",
        resolvedAt: new Date().toISOString(),
        resolutionNotes,
      };
      this.writeData(data);
    }

    return data;
  }
}

module.exports = new InventoryModel();
