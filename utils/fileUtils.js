const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../data");
const DATA_FILE = path.join(DATA_DIR, "bookcafe-data.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const TOKEN_FILE = path.join(DATA_DIR, "token-counter.json");

// Configuration
const MAX_BACKUPS = 30; // Keep last 30 backups
const MIN_BACKUP_INTERVAL = 3600000; // 1 hour between backups (in milliseconds)

// Initialize directories
const initializeDirectories = () => {
  [DATA_DIR, BACKUP_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

// Initialize token counter
const initializeTokenCounter = () => {
  if (!fs.existsSync(TOKEN_FILE)) {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ nextToken: 1 }));
  }
};

// Get next token number
const getNextToken = () => {
  try {
    const tokenData = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
    const currentToken = tokenData.nextToken;
    tokenData.nextToken = currentToken + 1;
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData));
    return currentToken;
  } catch (error) {
    console.error("Token error:", error);
    return Date.now().toString().slice(-6);
  }
};

// Clean up old backups
const cleanupOldBackups = () => {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((file) => file.startsWith("backup-") && file.endsWith(".json"))
      .map((file) => ({
        name: file,
        time: fs.statSync(path.join(BACKUP_DIR, file)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time); // Newest first

    // Delete oldest backups if we exceed MAX_BACKUPS
    if (files.length > MAX_BACKUPS) {
      files.slice(MAX_BACKUPS).forEach((file) => {
        fs.unlinkSync(path.join(BACKUP_DIR, file.name));
        console.log(`Deleted old backup: ${file.name}`);
      });
    }
  } catch (error) {
    console.error("Backup cleanup error:", error.message);
  }
};

// Check if we should create a new backup
const shouldCreateBackup = () => {
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((file) => file.startsWith("backup-") && file.endsWith(".json"))
      .sort()
      .reverse();

    if (files.length === 0) return true;

    const latestBackup = files[0];
    const stats = fs.statSync(path.join(BACKUP_DIR, latestBackup));
    return Date.now() - stats.mtime.getTime() > MIN_BACKUP_INTERVAL;
  } catch (error) {
    console.error("Backup check error:", error.message);
    return true;
  }
};

// Create backup if needed
const createBackup = () => {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;

    // Check if we need a new backup
    if (!shouldCreateBackup()) return null;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.json`);

    fs.copyFileSync(DATA_FILE, backupFile);
    console.log(`Created backup: ${backupFile}`);

    // Clean up old backups
    cleanupOldBackups();

    return backupFile;
  } catch (error) {
    console.error("Backup failed:", error.message);
    return null;
  }
};

// Read data file with token migration
const readDataFile = () => {
  try {
    if (!fs.existsSync(DATA_FILE)) return null;
    const rawData = fs.readFileSync(DATA_FILE, "utf8");
    const data = JSON.parse(rawData);

    // Migration logic remains the same
    if (data.externalOrders) {
      for (const date in data.externalOrders) {
        data.externalOrders[date] = data.externalOrders[date].map((order) => ({
          ...order,
          paymentMethod: order.paymentMethod || "cash",
          tokenNumber: order.tokenNumber || getNextToken(),
        }));
      }
    }

    if (data.customers) {
      data.customers = data.customers.map((customer) => ({
        ...customer,
        tokenNumber: customer.tokenNumber || getNextToken(),
      }));
    }

    return data;
  } catch (error) {
    console.error("Read error:", error.message);
    return null;
  }
};

// Write data file with safe backup
const writeDataFile = (data) => {
  try {
    // Create backup first (without reading/writing data)
    createBackup();

    // Write new data
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error("Write error:", error.message);
    return false;
  }
};

module.exports = {
  initializeData: () => {
    initializeDirectories();
    initializeTokenCounter();

    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(
        DATA_FILE,
        JSON.stringify(
          {
            customers: [],
            menuItems: [
              { id: 1, name: "Coffee", price: 60, isRedeemable: true },
              { id: 2, name: "Tea", price: 40, isRedeemable: true },
              { id: 3, name: "Sandwich", price: 120, isRedeemable: false },
              { id: 4, name: "Cake", price: 80, isRedeemable: false },
              { id: 5, name: "Cold Coffee", price: 80, isRedeemable: true },
              { id: 6, name: "Cookies", price: 30, isRedeemable: false },
            ],
            settings: {
              entryFee: 60,
              timePerEntry: 2,
              paymentMethods: ["cash", "online"],
              lastTokenNumber: 0,
            },
            externalOrders: {},
          },
          null,
          2
        )
      );
    }
  },
  readDataFile,
  writeDataFile,
  createBackup,
  getNextToken,
};
