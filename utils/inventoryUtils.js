const fs = require("fs");
const path = require("path");

const DATA_PATH = path.join(__dirname, "../data/inventory.json");

module.exports.initializeInventory = () => {
  if (!fs.existsSync(DATA_PATH)) {
    const initialData = {
      settings: {
        lowStockThreshold: 0.2,
        defaultUnit: "grams",
        costPrecision: 2,
        expiryAlertDays: 3,
        inventoryMode: "auto",
      },
      categories: [],
      ingredients: [],
      readyMadeItems: [],
      suppliers: [],
      inventoryTransactions: [],
      purchaseOrders: [],
      wasteRecords: [],
      inventoryAlerts: [],
    };
    fs.writeFileSync(DATA_PATH, JSON.stringify(initialData, null, 2));
  }
};
