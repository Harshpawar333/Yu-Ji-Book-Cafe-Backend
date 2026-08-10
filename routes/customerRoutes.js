const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { readDataFile, writeDataFile } = require("../utils/fileUtils");
const { getNextToken } = require("../utils/tokenUtils");
const { tryDeductInventory } = require("../utils/inventoryHelper");
// Get all customers
router.get("/", (req, res) => {
  try {
    const data = readDataFile();
    if (!data) return res.status(500).json({ error: "Failed to read data" });
    res.json(data.customers);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get active customers
router.get("/active", (req, res) => {
  try {
    const data = readDataFile();
    if (!data) return res.status(500).json({ error: "Failed to read data" });

    const activeCustomers = data.customers.filter((c) => c.isActive);
    res.json(activeCustomers);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});
// Get customer stats (Global KPIs)
router.get("/stats", (req, res) => {
  try {
    const data = readDataFile();
    if (!data) return res.status(500).json({ error: "Failed to read data" });

    const totalCustomers = data.customers.length;
    let repeatedCustomers = 0;
    let activeThisMonth = 0;
    let totalVisits = 0;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    data.customers.forEach((c) => {
      const visits = c.history ? c.history.length : 1; // Fallback to 1 if no history array
      totalVisits += visits;
      if (visits > 1) {
        repeatedCustomers++;
      }

      // Check if visited this month
      if (c.history && c.history.length > 0) {
        const hasVisitThisMonth = c.history.some(h => {
          const d = new Date(h.checkInTime);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });
        if (hasVisitThisMonth) activeThisMonth++;
      } else {
        // Fallback to checkInTime or createdAt
        const d = new Date(c.checkInTime || c.createdAt);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          activeThisMonth++;
        }
      }
    });

    res.json({
      totalCustomers,
      repeatedCustomers,
      activeThisMonth,
      totalVisits
    });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get paginated customers
router.get("/paginated", (req, res) => {
  try {
    const data = readDataFile();
    if (!data) return res.status(500).json({ error: "Failed to read data" });

    let { page = 1, pageSize = 10, search = "", sortBy = "date", sortDirection = "desc" } = req.query;
    page = parseInt(page);
    pageSize = parseInt(pageSize);
    search = search.toLowerCase();

    let customers = data.customers;

    // Filter
    if (search) {
      customers = customers.filter(c => 
        (c.name && c.name.toLowerCase().includes(search)) || 
        (c.mobileNumber && c.mobileNumber.includes(search))
      );
    }

    const filteredCount = customers.length;
    const totalCount = data.customers.length;

    // Sort
    customers.sort((a, b) => {
      let aVal, bVal;
      if (sortBy === "name") {
        aVal = (a.name || "").toLowerCase();
        bVal = (b.name || "").toLowerCase();
      } else if (sortBy === "visits") {
        aVal = a.history ? a.history.length : 1;
        bVal = b.history ? b.history.length : 1;
      } else { // default date
        aVal = new Date(a.createdAt || a.checkInTime).getTime();
        bVal = new Date(b.createdAt || b.checkInTime).getTime();
      }

      if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    // Paginate
    const start = (page - 1) * pageSize;
    const paginatedItems = customers.slice(start, start + pageSize);

    // Format items for lightweight transport
    const items = paginatedItems.map(c => ({
      id: c.id,
      name: c.name,
      mobileNumber: c.mobileNumber,
      visits: c.history ? c.history.length : 1,
      lastVisit: c.checkInTime, // The most recent checkInTime
      dateJoined: c.createdAt || c.checkInTime
    }));

    res.json({
      items,
      filteredCount,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(filteredCount / pageSize)
    });

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Customer check-in
router.post("/", (req, res) => {
  const data = readDataFile();
  if (!data) return res.status(500).json({ error: "Failed to read data" });

  const { name, mobileNumber, people, paymentMethod = "cash" } = req.body;
  const checkInTime = new Date().toISOString();
  const redeemableCredit = 60 * people;
  const tokenNumber = getNextToken(); // Get new token for check-in

  if (!mobileNumber) {
    return res.status(400).json({ error: "Mobile number is required" });
  }

  const existingCustomer = data.customers.find(
    (c) => c.mobileNumber === mobileNumber
  );

  if (existingCustomer) {
    Object.assign(existingCustomer, {
      isActive: true,
      checkInTime,
      people,
      paymentMethod,
      redeemableCredit,
      tokenNumber, // Assign new token
      orders: [],
      checkOutTime: null,
    });

    existingCustomer.history.unshift({
      checkInTime,
      people,
      paymentMethod,
      redeemableCredit,
      tokenNumber, // Include token in history
      orders: [],
    });

    writeDataFile(data);
    return res.json(existingCustomer);
  }

  const newCustomer = {
    id: uuidv4(),
    name,
    mobileNumber,
    isActive: true,
    checkInTime,
    people,
    paymentMethod,
    redeemableCredit,
    tokenNumber, // Assign new token
    orders: [],
    checkOutTime: null,
    history: [
      {
        checkInTime,
        people,
        paymentMethod,
        redeemableCredit,
        tokenNumber, // Include token in history
        orders: [],
      },
    ],
  };

  data.customers.push(newCustomer);
  writeDataFile(data);
  res.status(201).json(newCustomer);
});

// Update customer
router.patch("/:id", (req, res) => {
  try {
    const data = readDataFile();
    if (!data) return res.status(500).json({ error: "Failed to read data" });

    const customer = data.customers.find((c) => c.id === req.params.id);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    if (req.body.isActive === false) {
      const checkOutTime = new Date().toISOString();
      const currentVisit = customer.history.find(
        (h) => h.checkInTime === customer.checkInTime
      );

      if (currentVisit) {
        currentVisit.orders = customer.orders;
        currentVisit.checkOutTime = checkOutTime;
        currentVisit.redeemableCreditUsed =
          currentVisit.redeemableCredit - (customer.redeemableCredit || 0);
      }

      Object.assign(customer, {
        isActive: false,
        checkOutTime,
        orders: [],
        renewalCount: 0,
      });
    } else {
      Object.assign(customer, req.body);
    }

    writeDataFile(data);
    res.json(customer);
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({
      error: "Server error",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

// Redeem credit
router.patch("/:id/redeem", (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;

    const data = readDataFile();
    if (!data) return res.status(500).json({ error: "Failed to read data" });

    const customer = data.customers.find((c) => c.id === id);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    if (customer.redeemableCredit < amount) {
      return res.status(400).json({ error: "Insufficient credit" });
    }

    customer.redeemableCredit -= amount;
    customer.additionalRedeemableSpent =
      (customer.additionalRedeemableSpent || 0) + amount;

    if (!writeDataFile(data)) {
      return res.status(500).json({ error: "Failed to save data" });
    }

    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});
router.get("/get-token", (req, res) => {
  try {
    const tokenNumber = getNextToken(); // Use your existing token utility
    res.json({ tokenNumber });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate token" });
  }
});
// Lookup customer by mobile number
router.get("/lookup", (req, res) => {
  try {
    const { mobileNumber } = req.query;

    if (!mobileNumber || !/^\d{10}$/.test(mobileNumber)) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Valid 10-digit mobile number required",
      });
    }

    const data = readDataFile();
    if (!data) {
      return res.status(500).json({
        error: "SERVER_ERROR",
        message: "Failed to read data",
      });
    }

    const customer = data.customers.find(
      (c) => c.mobileNumber === mobileNumber
    );

    if (!customer) {
      return res.status(404).json({
        error: "NOT_FOUND",
        message: "Customer not found",
      });
    }

    res.json({
      customer: {
        id: customer.id,
        name: customer.name,
        mobileNumber: customer.mobileNumber,
      },
    });
  } catch (err) {
    res.status(500).json({
      error: "SERVER_ERROR",
      message: "Internal server error",
    });
  }
});

// Get customer history
router.get("/history", (req, res) => {
  try {
    const { mobileNumber } = req.query;
    if (!mobileNumber) {
      return res.status(400).json({ error: "Mobile number required" });
    }

    const data = readDataFile();
    if (!data) return res.status(500).json({ error: "Failed to read data" });

    const history = data.customers
      .filter((c) => c.mobileNumber === mobileNumber)
      .sort((a, b) => new Date(b.checkInTime) - new Date(a.checkInTime));

    res.json(history);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Create order
router.post("/:id/orders", async (req, res) => {
  try {
    const { id } = req.params;
    const { items, paymentMethod = "cash" } = req.body;

    // Validate input - keep all your existing validation
    if (!id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: "Invalid request data",
        details: "Missing customer ID or empty items array",
      });
    }

    for (const item of items) {
      if (
        !item.id ||
        typeof item.price !== "number" ||
        typeof item.quantity !== "number"
      ) {
        return res.status(400).json({
          error: "Invalid item format",
          details: `Item ${JSON.stringify(item)} is missing required fields`,
        });
      }
    }

    const data = readDataFile();
    if (!data) {
      return res.status(500).json({
        error: "Server error",
        details: "Failed to read data file",
      });
    }

    const customer = data.customers.find((c) => c.id === id);
    if (!customer) {
      return res.status(404).json({
        error: "Customer not found",
        details: `Customer ID ${id} not found`,
      });
    }

    // Keep all your existing credit validation logic
    const checkInTime = new Date(customer.checkInTime);
    const now = new Date();
    const expiryTime = new Date(checkInTime.getTime() + 2 * 60 * 60 * 1000);
    const creditValid = now <= expiryTime;
    const validCredit = creditValid ? customer.redeemableCredit : 0;

    // Keep all your existing order total calculation
    const orderTotal = items.reduce((sum, item) => {
      if (item.price < 0 || item.quantity < 1) {
        throw new Error(`Invalid price or quantity for item ${item.id}`);
      }
      return sum + item.price * item.quantity;
    }, 0);

    const redeemableItemsTotal = items
      .filter((item) => item.isRedeemable)
      .reduce((sum, item) => sum + item.price * item.quantity, 0);

    const redeemAmount = Math.min(redeemableItemsTotal, validCredit);
    const payableAmount = orderTotal - redeemAmount;
    const orderTokenNumber = getNextToken();

    // Keep your existing order creation logic
    const newOrder = {
      id: uuidv4(),
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        isRedeemable: item.isRedeemable,
      })),
      total: orderTotal,
      redeemed: redeemAmount,
      payable: payableAmount,
      paymentMethod,
      tokenNumber: orderTokenNumber,
      timestamp: now.toISOString(),
    };

    // Update customer as before
    customer.redeemableCredit = validCredit - redeemAmount;
    customer.orders = customer.orders || [];
    customer.orders.push(newOrder);

    // Save the order as before
    if (!writeDataFile(data)) {
      throw new Error("Failed to save order data");
    }

    // NEW: Try to deduct inventory (non-blocking)
    const { results, warnings } = await tryDeductInventory(items);

    // Prepare response with all existing fields
    const response = {
      success: true,
      customer: {
        id: customer.id,
        name: customer.name,
        redeemableCredit: customer.redeemableCredit,
        tokenNumber: customer.tokenNumber,
      },
      order: newOrder,
      // Add inventory warnings if any (won't fail the order)
      ...(warnings.length > 0 && { inventoryWarnings: warnings }),
    };

    res.json(response);
  } catch (err) {
    // Keep your existing error handling
    res.status(500).json({
      error: "ORDER_FAILED",
      message: "Failed to process order",
      ...(process.env.NODE_ENV === "development" && { details: err.message }),
    });
  }
});

// Renew customer
router.patch("/:id/renew", (req, res) => {
  try {
    const { id } = req.params;
    const { people, paymentMethod } = req.body;
    const data = readDataFile();
    if (!data) return res.status(500).json({ error: "Failed to read data" });

    const customer = data.customers.find((c) => c.id === id);
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    // Initialize renewalCount if it doesn't exist
    if (typeof customer.renewalCount !== "number") {
      customer.renewalCount = 0;
    }

    const renewalAmount = 60 * people;
    const checkInTime = new Date().toISOString();
    const tokenNumber = getNextToken();

    // Increment renewal count
    customer.renewalCount += 1;

    // Find current active session (if exists)
    const currentSession = customer.history.find(
      (session) => session.checkInTime === customer.checkInTime
    );

    if (currentSession) {
      // Replace existing credit with new renewal amount instead of adding
      currentSession.redeemableCredit = renewalAmount; // Changed from += to =
      currentSession.checkInTime = checkInTime;
      currentSession.paymentMethod =
        paymentMethod || currentSession.paymentMethod || "cash";
      currentSession.tokenNumber = tokenNumber;
      currentSession.isRenewal = true;
      currentSession.renewalNumber = customer.renewalCount;
      currentSession.people = people; // Update people count
    } else {
      // Fallback: create new session if none exists
      customer.history.unshift({
        checkInTime,
        people,
        paymentMethod: paymentMethod || customer.paymentMethod || "cash",
        redeemableCredit: renewalAmount,
        orders: [],
        isRenewal: true,
        tokenNumber,
        renewalNumber: customer.renewalCount,
      });
    }

    // Update customer record - replace credit instead of adding
    Object.assign(customer, {
      redeemableCredit: renewalAmount, // Changed from (customer.redeemableCredit || 0) + renewalAmount
      paymentMethod: paymentMethod || customer.paymentMethod || "cash",
      checkInTime: checkInTime,
      isActive: true,
      checkOutTime: null,
      tokenNumber,
      isRenewal: true,

      people: people, // Update people count
    });

    if (!writeDataFile(data)) {
      return res.status(500).json({ error: "Failed to save renewal" });
    }

    res.json({
      success: true,
      customer: {
        ...customer,
        tokenNumber,
        renewalCount: customer.renewalCount,
      },
      renewal: {
        amount: renewalAmount,
        newExpiry: new Date(
          new Date(
            currentSession ? customer.checkInTime : checkInTime
          ).getTime() +
            2 * 60 * 60 * 1000
        ),
        tokenNumber,
        paymentMethod: paymentMethod || customer.paymentMethod || "cash",
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Server error during renewal" });
  }
});
module.exports = router;
