// ============================================
// Customer Routes (Supabase Version)
// ============================================

const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { supabase } = require("../config/supabase");
const { transformToCamelCase, transformToSnakeCase } = require("../utils/dbTransform");

// Get all customers
router.get("/", async (req, res) => {
  try {
    const { date } = req.query;
    
    // If date is provided, fetch customers and filter their orders by date
    if (date) {
      // Convert IST date to UTC range
      const startOfDay = new Date(date + 'T00:00:00.000+05:30');
      const endOfDay = new Date(date + 'T23:59:59.999+05:30');
      
      // Fetch customers who checked in on this date
      const { data: customers, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .gte('check_in_time', startOfDay.toISOString())
        .lte('check_in_time', endOfDay.toISOString())
        .order('check_in_time', { ascending: false })
        .limit(100);

      if (customersError) throw customersError;

      if (!customers || customers.length === 0) {
        return res.json([]);
      }

      // Get customer IDs
      const customerIds = customers.map(c => c.id);

      // Fetch ONLY orders placed on this date for these customers
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select(`
          *,
          order_items (*)
        `)
        .in('customer_id', customerIds)
        .gte('timestamp', startOfDay.toISOString())
        .lte('timestamp', endOfDay.toISOString())
        .order('timestamp', { ascending: false });

      if (ordersError) throw ordersError;

      // Group orders by customer
      const ordersByCustomer = {};
      (orders || []).forEach(order => {
        if (!ordersByCustomer[order.customer_id]) {
          ordersByCustomer[order.customer_id] = [];
        }
        ordersByCustomer[order.customer_id].push(order);
      });

      // Attach orders to customers
      const customersWithOrders = customers.map(customer => ({
        ...customer,
        orders: ordersByCustomer[customer.id] || []
      }));

      return res.json(transformToCamelCase(customersWithOrders));
    }

    // If no date filter, fetch all customers with all orders (original behavior)
    const { data, error } = await supabase
      .from('customers')
      .select(`
        *,
        orders (
          *,
          order_items (*)
        )
      `)
      .order('check_in_time', { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json(transformToCamelCase(data));
  } catch (err) {
    console.error('Error fetching customers:', err);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});
router.get("/by-date-range", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        error: "startDate and endDate parameters are required" 
      });
    }

    // Convert IST dates to UTC ranges
    const start = new Date(startDate + 'T00:00:00.000+05:30');
    const end = new Date(endDate + 'T23:59:59.999+05:30');
    
    console.log('Fetching customers for date range:', 
      startDate, 'to', endDate,
      'UTC range:', start.toISOString(), 'to', end.toISOString()
    );
    
    // Fetch customers who checked in within this date range
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('*')
      .gte('check_in_time', start.toISOString())
      .lte('check_in_time', end.toISOString())
      .order('check_in_time', { ascending: false })
      .limit(100);

    if (customersError) throw customersError;

    if (!customers || customers.length === 0) {
      return res.json([]);
    }

    // Get customer IDs
    const customerIds = customers.map(c => c.id);

    // Fetch orders placed within this date range for these customers
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .in('customer_id', customerIds)
      .gte('timestamp', start.toISOString())
      .lte('timestamp', end.toISOString())
      .order('timestamp', { ascending: false });

    if (ordersError) throw ordersError;

    // Group orders by customer
    const ordersByCustomer = {};
    (orders || []).forEach(order => {
      if (!ordersByCustomer[order.customer_id]) {
        ordersByCustomer[order.customer_id] = [];
      }
      ordersByCustomer[order.customer_id].push(order);
    });

    // Attach orders to customers
    const customersWithOrders = customers.map(customer => ({
      ...customer,
      orders: ordersByCustomer[customer.id] || []
    }));

    console.log(`Returning ${customersWithOrders.length} customers with orders`);
    return res.json(transformToCamelCase(customersWithOrders));
  } catch (err) {
    console.error('Error fetching customers by date range:', err);
    res.status(500).json({ error: "Failed to fetch customers by date range" });
  }
});
// Get all data dump for Superadmin Export
router.get("/all-data", async (req, res) => {
  try {
    const { data: customers, error } = await supabase
      .from('customers')
      .select('*, customer_history(id)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(transformToCamelCase(customers || []));
  } catch (err) {
    console.error('Error fetching all customers data:', err);
    res.status(500).json({ error: "Failed to fetch unrestricted data" });
  }
});

// Get active customers (only today's check-ins, with today's orders only)
router.get("/active", async (req, res) => {
  try {
    // Get today's start in IST (UTC+05:30)
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffset);
    const todayIST = istNow.toISOString().split('T')[0]; // e.g. "2026-08-08"
    const startOfDayIST = new Date(todayIST + 'T00:00:00.000+05:30');

    // Fetch only active customers who checked in today
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('*')
      .eq('is_active', true)
      .gte('check_in_time', startOfDayIST.toISOString())
      .order('check_in_time', { ascending: false });

    if (customersError) throw customersError;

    if (!customers || customers.length === 0) {
      return res.json([]);
    }

    // Fetch ONLY today's orders for these active customers
    // This prevents old visit orders from leaking in for returning customers
    const endOfDayIST = new Date(todayIST + 'T23:59:59.999+05:30');
    const customerIds = customers.map(c => c.id);

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .in('customer_id', customerIds)
      .gte('timestamp', startOfDayIST.toISOString())
      .lte('timestamp', endOfDayIST.toISOString())
      .order('timestamp', { ascending: false });

    if (ordersError) throw ordersError;

    // Group orders by customer
    const ordersByCustomer = {};
    (orders || []).forEach(order => {
      if (!ordersByCustomer[order.customer_id]) {
        ordersByCustomer[order.customer_id] = [];
      }
      ordersByCustomer[order.customer_id].push(order);
    });

    // Attach only today's orders to each customer
    const customersWithOrders = customers.map(customer => ({
      ...customer,
      orders: ordersByCustomer[customer.id] || []
    }));

    res.json(transformToCamelCase(customersWithOrders));
  } catch (err) {
    console.error('Error fetching active customers:', err);
    res.status(500).json({ error: "Failed to fetch active customers" });
  }
});

// Lookup customer by mobile number
router.get("/lookup", async (req, res) => {
  try {
    const { mobileNumber } = req.query;

    if (!mobileNumber) {
      return res.status(400).json({ error: "Mobile number is required" });
    }

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('mobile_number', mobileNumber)
      .order('check_in_time', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json(transformToCamelCase(data[0]));
  } catch (err) {
    console.error('Error looking up customer:', err);
    res.status(500).json({ error: "Failed to lookup customer" });
  }
});

// Get customer history by mobile number
router.get("/history", async (req, res) => {
  try {
    const { mobileNumber } = req.query;

    if (!mobileNumber) {
      return res.status(400).json({ error: "Mobile number is required" });
    }

    // Get customer
    const { data: customers, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('mobile_number', mobileNumber)
      .limit(1);

    if (customerError) throw customerError;

    if (!customers || customers.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const customerId = customers[0].id;

    // Get customer history
    const { data: history, error: historyError } = await supabase
      .from('customer_history')
      .select('*')
      .eq('customer_id', customerId)
      .order('check_in_time', { ascending: false });

    if (historyError) throw historyError;

    res.json(transformToCamelCase(history || []));
  } catch (err) {
    console.error('Error fetching customer history:', err);
    res.status(500).json({ error: "Failed to fetch customer history" });
  }
});

// Get customer by ID with history and orders
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Get customer
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();

    if (customerError) throw customerError;

    // Get customer history
    const { data: history, error: historyError } = await supabase
      .from('customer_history')
      .select('*')
      .eq('customer_id', id)
      .order('check_in_time', { ascending: false });

    if (historyError) throw historyError;

    // Get current orders
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .eq('customer_id', id)
      .is('history_id', null);

    if (ordersError) throw ordersError;

    res.json(transformToCamelCase({
      ...customer,
      history: history || [],
      orders: orders || []
    }));
  } catch (err) {
    console.error('Error fetching customer:', err);
    res.status(500).json({ error: "Failed to fetch customer" });
  }
});

// Customer check-in
router.post("/", async (req, res) => {
  try {
    const { name, mobileNumber, people, paymentMethod = "cash", entryDuration = "2hr" } = req.body;

    if (!mobileNumber) {
      return res.status(400).json({ error: "Mobile number is required" });
    }

    // Fetch entry fee from settings (dynamic, superadmin-configurable)
    let entryFeePerPerson = 60; // safe fallback
    try {
      const { data: settings } = await supabase
        .from('system_settings')
        .select('entry_fee_1hr, entry_fee_2hr, entry_fee')
        .eq('id', 1)
        .single();
      if (settings) {
        if (entryDuration === '1hr') {
          entryFeePerPerson = settings.entry_fee_1hr ?? settings.entry_fee ?? 40;
        } else {
          entryFeePerPerson = settings.entry_fee_2hr ?? settings.entry_fee ?? 60;
        }
      }
    } catch (settingsErr) {
      console.warn('Could not fetch settings, using default fee:', settingsErr.message);
    }

    const checkInTime = new Date().toISOString();
    const redeemableCredit = entryFeePerPerson * people;

    // Get next token number
    const { data: tokenData, error: tokenError } = await supabase
      .from('token_counter')
      .select('next_token, last_reset_date')
      .eq('id', 1)
      .single();

    if (tokenError) throw tokenError;

    const today = new Date().toISOString().split('T')[0];
    let tokenNumber = tokenData.next_token;

    // Reset token if new day
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

    // Check if customer exists
    const { data: existingCustomers, error: checkError } = await supabase
      .from('customers')
      .select('*')
      .eq('mobile_number', mobileNumber);

    if (checkError) throw checkError;

    if (existingCustomers && existingCustomers.length > 0) {
      const existingCustomer = existingCustomers[0];

      // Update existing customer — fresh re-entry
      const updatePayload = {
        is_active: true,
        check_in_time: checkInTime,
        people,
        payment_method: paymentMethod,
        redeemable_credit: redeemableCredit,
        token_number: tokenNumber,
        check_out_time: null,
        renewal_count: 0,
        is_renewal: false,
        entry_fee_per_person: entryFeePerPerson,
      };
      // Store entry_duration if column exists
      try { updatePayload.entry_duration = entryDuration; } catch (_) {}

      const { data: updatedCustomer, error: updateError } = await supabase
        .from('customers')
        .update(updatePayload)
        .eq('id', existingCustomer.id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Add fresh visit to history
      await supabase
        .from('customer_history')
        .insert({
          customer_id: existingCustomer.id,
          check_in_time: checkInTime,
          people,
          payment_method: paymentMethod,
          redeemable_credit: redeemableCredit,
          token_number: tokenNumber
        });

      return res.json(transformToCamelCase(updatedCustomer));
    }

    // Create new customer
    const newCustomerPayload = {
      id: uuidv4(),
      name,
      mobile_number: mobileNumber,
      is_active: true,
      check_in_time: checkInTime,
      people,
      payment_method: paymentMethod,
      redeemable_credit: redeemableCredit,
      token_number: tokenNumber,
      renewal_count: 0,
      is_renewal: false,
      entry_fee_per_person: entryFeePerPerson,
    };
    // Store entry_duration if column exists
    try { newCustomerPayload.entry_duration = entryDuration; } catch (_) {}

    const { data: newCustomer, error: createError } = await supabase
      .from('customers')
      .insert(newCustomerPayload)
      .select()
      .single();

    if (createError) throw createError;

    // Add to history
    await supabase
      .from('customer_history')
      .insert({
        customer_id: newCustomer.id,
        check_in_time: checkInTime,
        people,
        payment_method: paymentMethod,
        redeemable_credit: redeemableCredit,
        token_number: tokenNumber
      });

    res.json(transformToCamelCase(newCustomer));
  } catch (err) {
    console.error('Error checking in customer:', err);
    res.status(500).json({ error: "Failed to check in customer" });
  }
});

// Customer renewal
router.patch("/:id/renewal", async (req, res) => {
  try {
    const { id } = req.params;
    const { people, paymentMethod } = req.body;

    // Get current customer (includes entry_duration and entry_fee_per_person)
    const { data: customer, error: fetchError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    // Use stored fee per person (set at check-in), fall back to settings, then 60
    let renewalFeePerPerson = customer.entry_fee_per_person || 60;
    if (!customer.entry_fee_per_person) {
      // Fetch from settings using customer's entry_duration
      try {
        const { data: settings } = await supabase
          .from('system_settings')
          .select('entry_fee_1hr, entry_fee_2hr, entry_fee')
          .eq('id', 1)
          .single();
        if (settings) {
          const duration = customer.entry_duration || '2hr';
          renewalFeePerPerson = duration === '1hr'
            ? (settings.entry_fee_1hr ?? settings.entry_fee ?? 40)
            : (settings.entry_fee_2hr ?? settings.entry_fee ?? 60);
        }
      } catch (_) { /* use fallback */ }
    }

    const renewalCredit = renewalFeePerPerson * people;
    const newRedeemableCredit = customer.redeemable_credit + renewalCredit;
    const newRenewalCount = (customer.renewal_count || 0) + 1;

    // Calculate new expiry
    const checkInTime = new Date(customer.check_in_time);
    const newExpiry = new Date(checkInTime.getTime() + newRedeemableCredit * 60 * 1000);

    // Update customer
    const { data: updatedCustomer, error: updateError } = await supabase
      .from('customers')
      .update({
        redeemable_credit: newRedeemableCredit,
        renewal_count: newRenewalCount,
        is_renewal: true
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({
      customer: transformToCamelCase(updatedCustomer),
      renewal: {
        amount: renewalCredit,
        paymentMethod: paymentMethod || 'cash',
        tokenNumber: customer.token_number,
        newExpiry: newExpiry.toISOString()
      }
    });
  } catch (err) {
    console.error('Error renewing customer:', err);
    res.status(500).json({ error: "Failed to renew customer" });
  }
});

// Customer checkout
router.patch("/:id/checkout", async (req, res) => {
  try {
    const { id } = req.params;
    const checkOutTime = new Date().toISOString();

    // Get current customer data before checkout
    const { data: currentCustomer, error: fetchError } = await supabase
      .from('customers')
      .select('renewal_count')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    // Update latest history entry with renewal_count and checkout time
    const { error: historyError } = await supabase
      .from('customer_history')
      .update({ 
        check_out_time: checkOutTime,
        renewal_number: currentCustomer.renewal_count || 0,
        is_renewal: (currentCustomer.renewal_count || 0) > 0
      })
      .eq('customer_id', id)
      .is('check_out_time', null)
      .order('check_in_time', { ascending: false })
      .limit(1);

    if (historyError) throw historyError;

    // Update customer - mark as checked out, keep renewal_count for billing reference
    // renewal_count is preserved so billing/reports can read the actual renewal count
    // It will be reset to 0 on next check-in (in the POST / route)
    const { data: customer, error: updateError } = await supabase
      .from('customers')
      .update({
        is_active: false,
        check_out_time: checkOutTime,
        redeemable_credit: 0
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json(transformToCamelCase(customer));
  } catch (err) {
    console.error('Error checking out customer:', err);
    res.status(500).json({ error: "Failed to check out customer" });
  }
});

// Add order to customer
router.post("/:id/orders", async (req, res) => {
  try {
    const { id } = req.params;
    const { items, total, redeemed, payable, paymentMethod } = req.body;

    // Get customer
    const { data: customer, error: fetchError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    // Validate redeemed amount doesn't exceed available credit
    const actualRedeemed = Math.min(redeemed || 0, customer.redeemable_credit);
    if (actualRedeemed < 0) {
      return res.status(400).json({ error: "Invalid redeemed amount" });
    }

    const orderId = uuidv4();
    const timestamp = new Date().toISOString();

    // Create order
    const { error: orderError } = await supabase
      .from('orders')
      .insert({
        id: orderId,
        customer_id: id,
        total,
        redeemed: actualRedeemed,
        payable: total - actualRedeemed,
        payment_method: paymentMethod,
        token_number: customer.token_number,
        timestamp
      });

    if (orderError) throw orderError;

    // Create order items
    const orderItems = items.map(item => ({
      order_id: orderId,
      menu_item_id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      is_redeemable: item.isRedeemable !== false
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) throw itemsError;

    // Update customer credit - ensure it never goes negative
    const newCredit = Math.max(0, customer.redeemable_credit - actualRedeemed);
    const { data: updatedCustomer, error: updateError } = await supabase
      .from('customers')
      .update({ redeemable_credit: newCredit })
      .eq('id', id)
      .select(`
        *,
        orders (
          *,
          order_items (*)
        )
      `)
      .single();

    if (updateError) throw updateError;

    // Auto-deduct inventory based on recipes (non-blocking — order always succeeds)
    const { tryDeductInventorySupabase } = require("../utils/supabaseInventoryHelper");
    tryDeductInventorySupabase(supabase, items).then(({ warnings }) => {
      if (warnings && warnings.length > 0) {
        console.warn("⚠️ Inventory deduction warnings:", warnings);
      }
    }).catch(err => {
      console.error("❌ Inventory deduction failed (non-blocking):", err.message);
    });

    res.json(transformToCamelCase(updatedCustomer));
  } catch (err) {
    console.error('Error adding order:', err);
    res.status(500).json({ error: "Failed to add order" });
  }
});

// Delete customer
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Delete orders and items (cascade should handle this, but being explicit)
    const { error: deleteError } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    res.json({ message: "Customer deleted successfully" });
  } catch (err) {
    console.error('Error deleting customer:', err);
    res.status(500).json({ error: "Failed to delete customer" });
  }
});

// Cleanup old active customers (mark as inactive if check-in was before today)
router.post("/cleanup", async (req, res) => {
  try {
    // Get today's date at midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    // Mark all active customers from before today as inactive
    const { data, error } = await supabase
      .from('customers')
      .update({ is_active: false })
      .eq('is_active', true)
      .lt('check_in_time', todayISO)
      .select();

    if (error) throw error;

    res.json({ 
      message: "Cleanup completed", 
      updatedCount: data?.length || 0,
      customers: transformToCamelCase(data)
    });
  } catch (err) {
    console.error('Error cleaning up customers:', err);
    res.status(500).json({ error: "Failed to cleanup customers" });
  }
});
// Get customers by date range (for billing page)

// Get orders by date
router.get("/orders/by-date", async (req, res) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({ error: "Date parameter is required" });
    }

    // Convert IST date to UTC range
    // IST midnight is 18:30 UTC of previous day
    const startOfDay = new Date(date + 'T00:00:00.000+05:30');
    const endOfDay = new Date(date + 'T23:59:59.999+05:30');

    console.log('Fetching orders for IST date:', date);
    console.log('UTC date range:', startOfDay.toISOString(), 'to', endOfDay.toISOString());

    // Fetch all orders placed on this date (by order timestamp, not check-in time)
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .gte('timestamp', startOfDay.toISOString())
      .lte('timestamp', endOfDay.toISOString())
      .order('timestamp', { ascending: false });

    if (ordersError) throw ordersError;

    if (!orders || orders.length === 0) {
      return res.json([]);
    }

    // Get unique customer IDs from orders
    const customerIds = [...new Set(orders.map(o => o.customer_id))];

    // Fetch customer details for these orders
    const { data: customersData, error: customersError } = await supabase
      .from('customers')
      .select(`
        id,
        name,
        mobile_number,
        token_number,
        is_active,
        check_in_time
      `)
      .in('id', customerIds);

    if (customersError) throw customersError;

    // Map customer data to orders
    const customerMap = {};
    customersData.forEach(customer => {
      customerMap[customer.id] = customer;
    });

    // Transform and format orders
    const formattedOrders = orders.map(order => {
      const customer = customerMap[order.customer_id];
      const transformed = transformToCamelCase(order);
      return {
        ...transformed,
        customerName: customer?.name || 'Guest',
        tokenNumber: customer?.token_number || order.token_number,
        customerStatus: customer?.is_active ? 'active' : 'checkout',
        type: 'dine-in'
      };
    });

    res.json(formattedOrders);
  } catch (err) {
    console.error('Error fetching orders by date:', err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
});

module.exports = router;
