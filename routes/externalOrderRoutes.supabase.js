// ============================================
// External Order Routes (Supabase Version)
// ============================================

const express = require("express");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();
const { supabase } = require("../config/supabase");
const { transformToCamelCase, transformToSnakeCase } = require("../utils/dbTransform");

// Get all external orders
router.get("/", async (req, res) => {
  try {
    const { date } = req.query;

    let query = supabase
      .from('external_orders')
      .select('*')
      .order('timestamp', { ascending: false });

    // If date is provided, filter by that date
    if (date) {
      query = query.eq('order_date', date);
    }

    const { data, error } = await query;

    if (error) throw error;

    // If date is provided, return array for that date
    if (date) {
      const orders = data.map(order => ({
        id: order.id,
        type: 'external',
        source: order.source,
        items: order.items || [],
        total: order.total,
        redeemed: order.redeemed,
        payable: order.payable,
        discountPercent: order.discount_percent || 0,
        discountAmount: order.discount_amount || 0,
        discount_percent: order.discount_percent || 0,
        discount_amount: order.discount_amount || 0,
        paymentMethod: order.payment_method,
        tokenNumber: order.token_number,
        timestamp: order.timestamp.includes('Z') ? order.timestamp : order.timestamp + 'Z'
      }));
      return res.json(orders);
    }

    // Group by date for frontend compatibility
    const groupedOrders = {};
    data.forEach(order => {
      const dateKey = order.order_date;
      if (!groupedOrders[dateKey]) {
        groupedOrders[dateKey] = [];
      }
      
      groupedOrders[dateKey].push({
        id: order.id,
        type: 'external',
        source: order.source,
        items: order.items || [],
        total: order.total,
        redeemed: order.redeemed,
        payable: order.payable,
        discountPercent: order.discount_percent || 0,
        discountAmount: order.discount_amount || 0,
        discount_percent: order.discount_percent || 0,
        discount_amount: order.discount_amount || 0,
        paymentMethod: order.payment_method,
        tokenNumber: order.token_number,
        timestamp: order.timestamp.includes('Z') ? order.timestamp : order.timestamp + 'Z'
      });
    });

    res.json(groupedOrders);
  } catch (err) {
    console.error('Error fetching external orders:', err);
    res.status(500).json({ error: "Failed to fetch external orders" });
  }
});
// Get external orders by date range (for billing page)
router.get("/by-date-range", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        error: "startDate and endDate parameters are required" 
      });
    }

    console.log('Fetching external orders for date range:', 
      startDate, 'to', endDate
    );

    // Convert IST dates to UTC ranges
    const start = new Date(startDate + 'T00:00:00.000+05:30');
    const end = new Date(endDate + 'T23:59:59.999+05:30');
    
    console.log('UTC time range for external orders:', 
      start.toISOString(), 'to', end.toISOString()
    );

    // Fetch external orders within the timestamp range
    const { data, error } = await supabase
      .from('external_orders')
      .select('*')
      .gte('timestamp', start.toISOString())
      .lte('timestamp', end.toISOString())
      .order('timestamp', { ascending: false });

    if (error) throw error;

    // Transform the data to match frontend expectations
    const orders = (data || []).map(order => ({
      id: order.id,
      type: 'external',
      source: order.source,
      items: Array.isArray(order.items) ? order.items : [],
      total: order.total || 0,
      redeemed: order.redeemed || 0,
      payable: order.payable || order.total || 0,
      discountPercent: order.discount_percent || 0,
      discountAmount: order.discount_amount || 0,
      discount_percent: order.discount_percent || 0,
      discount_amount: order.discount_amount || 0,
      paymentMethod: order.payment_method,
      tokenNumber: order.token_number,
      timestamp: order.timestamp.includes('Z') ? order.timestamp : order.timestamp + 'Z',
      orderDate: order.order_date
    }));

    console.log(`Returning ${orders.length} external orders for date range`);
    
    res.json(orders);
  } catch (err) {
    console.error('Error fetching external orders by date range:', err);
    res.status(500).json({ error: "Failed to fetch external orders by date range" });
  }
});
// Create new external order
router.post("/", async (req, res) => {
  try {
    let { source, items, paymentMethod = "online", discountPercent = 0, discountAmount = 0 } = req.body;

    // Validation
    if (!source || typeof source !== "string") {
      return res.status(400).json({ error: "Valid source is required" });
    }

    // Handle Owner orders
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
    const finalPaymentMethod = ["zomato", "swiggy"].includes(source.toLowerCase())
      ? "online"
      : paymentMethod;

    if (!["cash", "online"].includes(finalPaymentMethod)) {
      return res.status(400).json({ error: "Invalid payment method" });
    }

    // Calculate totals
    const now = new Date();
    // Get IST date (UTC+5:30)
    const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
    const istDate = new Date(now.getTime() + istOffset);
    const dateKey = istDate.toISOString().split("T")[0];
    const orderTotal = items.reduce((sum, item) => {
      if (!item.id || !item.price || !item.quantity) {
        throw new Error("Invalid item format");
      }
      return sum + item.price * item.quantity;
    }, 0);
    
    // Calculate payable securely on server
    const serverPayable = orderTotal - discountAmount;

    // Get next token
    const { data: tokenData, error: tokenError } = await supabase
      .from('token_counter')
      .select('next_token, last_reset_date')
      .eq('id', 1)
      .single();

    if (tokenError) throw tokenError;

    const today = now.toISOString().split('T')[0];
    let tokenNumber = tokenData.next_token;

    if (tokenData.last_reset_date !== today) {
      tokenNumber = 1;
      await supabase
        .from('token_counter')
        .update({ next_token: 2, last_reset_date: today })
        .eq('id', 1);
    } else {
      await supabase
        .from('token_counter')
        .update({ next_token: tokenData.next_token + 1 })
        .eq('id', 1);
    }

    // Create order with items as JSONB
    const orderId = uuidv4();
    const orderItems = items.map(item => ({
      id: item.id,
      name: item.name || `Item ${item.id}`,
      price: item.price,
      quantity: item.quantity,
      isRedeemable: item.isRedeemable || false
    }));

    const { error: orderError } = await supabase
      .from('external_orders')
      .insert({
        id: orderId,
        order_date: dateKey,
        source,
        total: orderTotal,
        redeemed: 0,
        payable: serverPayable,
        payment_method: finalPaymentMethod,
        token_number: tokenNumber,
        timestamp: now.toISOString(),
        items: orderItems,
        discount_percent: discountPercent,
        discount_amount: discountAmount
      });

    if (orderError) throw orderError;

    // Auto-deduct inventory based on recipes (non-blocking — order always succeeds)
    const { tryDeductInventorySupabase } = require("../utils/supabaseInventoryHelper");
    tryDeductInventorySupabase(supabase, items).then(({ warnings }) => {
      if (warnings && warnings.length > 0) {
        console.warn("⚠️ Inventory deduction warnings:", warnings);
      }
    }).catch(err => {
      console.error("❌ Inventory deduction failed (non-blocking):", err.message);
    });

    res.status(201).json({
      success: true,
      message: `External order from ${source} saved`,
      order: {
        id: orderId,
        type: 'external',
        source,
        items: orderItems,
        total: orderTotal,
        redeemed: 0,
        payable: serverPayable,          // ✅ FIXED: was incorrectly returning orderTotal
        discountPercent: discountPercent,
        discountAmount: discountAmount,
        discount_percent: discountPercent,
        discount_amount: discountAmount,
        paymentMethod: finalPaymentMethod,
        tokenNumber: tokenNumber,
        timestamp: now.toISOString()
      },
      token: tokenNumber
    });
  } catch (err) {
    console.error('Error creating external order:', err);
    res.status(500).json({ error: "Failed to create external order" });
  }
});

// Delete external order
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('external_orders')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: "External order deleted successfully" });
  } catch (err) {
    console.error('Error deleting external order:', err);
    res.status(500).json({ error: "Failed to delete external order" });
  }
});

module.exports = router;
