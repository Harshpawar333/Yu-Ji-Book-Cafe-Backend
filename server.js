require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const path = require("path");

// Import Supabase configuration
const { supabase, testConnection } = require("./config/supabase");

// Import routes (Supabase versions)
// const dataRoutes = require("./routes/dataRoutes"); // Not needed for Lambda
const customerRoutes = require("./routes/customerRoutes.supabase");
const menuRoutes = require("./routes/menuRoutes.supabase");
const settingsRoutes = require("./routes/settingsRoutes.supabase");
// const backupRoutes = require("./routes/backupRoutes"); // Not needed for Lambda - uses fileUtils
const externalOrderRoutes = require("./routes/externalOrderRoutes.supabase");
const inventoryRoutes = require("./routes/inventoryRoutes.supabase"); // Migrated to Supabase!
const membershipRoutes = require("./routes/membershipRoutes.supabase"); // Memberships + RFID
// const inventoryIntegrationRoutes = require("./routes/inventoryIntegrationRoutes");

const authRoutes = require("./routes/auth");

// Import middleware
const errorHandler = require("./middlewares/errorHandler");
const inventoryWebhook = require("./middlewares/inventoryWebhook");

const app = express();
const PORT = process.env.PORT || 3001;

// Test Supabase connection on startup
testConnection().then(connected => {
  if (!connected) {
    console.error('⚠️  Server starting without database connection');
  }
});

// Enhanced CORS configuration
const corsOptions = {
  origin: [
    "http://localhost:5173", 
    "http://localhost:5174",
    "https://pos-cafe.emacrontechnologies.com"
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 200,
};

// Middleware
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "10mb" })); // Increased for inventory reports
app.use(helmet());
app.use(morgan("dev"));
app.use(inventoryWebhook); // Handle inventory real-time updates

// Routes
// app.use("/api/data", dataRoutes); // Not needed for Lambda - legacy file operations
app.use("/api/customers", customerRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/settings", settingsRoutes);
// app.use("/api/backups", backupRoutes); // Not needed for Lambda - uses fileUtils
app.use("/api/external-orders", externalOrderRoutes);
app.use("/api/inventory", inventoryRoutes); // ✅ Now Supabase-based!
app.use("/api/memberships", membershipRoutes); // ✅ Membership + RFID
// app.use("/api/integration", inventoryIntegrationRoutes); // POS-Inventory integration
app.use("/api", authRoutes);

// Health check with database status
app.get("/api/health", async (req, res) => {
  try {
    const dbConnected = await testConnection();
    res.json({
      status: dbConnected ? "healthy" : "degraded",
      uptime: process.uptime(),
      services: {
        database: dbConnected ? "operational" : "unavailable",
        supabase: dbConnected ? "connected" : "disconnected"
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: "degraded",
      uptime: process.uptime(),
      error: "Database service unavailable",
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling
app.use(errorHandler);

// Export app for Lambda handler
module.exports = app;

// Only start server if not in Lambda environment
if (!process.env.AWS_EXECUTION_ENV && !process.env.LAMBDA_TASK_ROOT) {
  // Start server for local development
  const server = app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log(`🚀 Yu-Ji Book Café POS Backend`);
    console.log('='.repeat(60));
    console.log(`📍 Server: http://localhost:${PORT}`);
    console.log(`🗄️  Database: Supabase PostgreSQL`);
    console.log(`📊 API Endpoints:`);
    console.log(`   - Customers: /api/customers`);
    console.log(`   - Menu: /api/menu`);
    console.log(`   - Orders: /api/external-orders`);
    console.log(`   - Settings: /api/settings`);
    console.log(`   - Inventory: /api/inventory`);
    console.log(`   - Memberships: /api/memberships`);
    console.log(`   - Health: /api/health`);
    console.log('='.repeat(60) + '\n');
  });

  // Handle server errors
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`❌ Port ${PORT} is already in use`);
    } else {
      console.error("❌ Server error:", error);
    }
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (err) => {
    console.error("❌ Unhandled Rejection:", err);
    server.close(() => process.exit(1));
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log('\n🛑 SIGTERM received, shutting down gracefully...');
    server.close(() => {
      console.log('✅ Server closed');
      process.exit(0);
    });
  });
}
