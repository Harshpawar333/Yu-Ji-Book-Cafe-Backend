// ============================================
// Customer Routes (Supabase Version)
// ============================================

const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { supabase } = require("../config/supabase");
const { transformToCamelCase, transformToSnakeCase } = require("../utils/dbTransform");

// Get all customers
// When ?date= is provided, uses customer_history as the immutable source of truth.
// This prevents past-date sales totals from changing when a repeat customer
// visits again on a later date (which would overwrite customers.check_in_time).
router.get("/", async (req, res) => {
  try {
    const { date } = req.query;
    
    // If date is provided, fetch via customer_history (immutable per-visit records)
    if (date) {
      // Convert IST date to UTC range
      const startOfDay = new Date(date + 'T00:00:00.000+05:30');
      const endOfDay = new Date(date + 'T23:59:59.999+05:30');

      // ─── SOURCE OF TRUTH: customer_history ───────────────────────────────
      // customer_history rows are append-only. Each visit creates a permanent
      // record whose check_in_time never changes — even when the same customer
      // returns next week and their customers.check_in_time gets overwritten.
      const { data: historyRows, error: historyError } = await supabase
        .from('customer_history')
        .select('*')
        .gte('check_in_time', startOfDay.toISOString())
        .lte('check_in_time', endOfDay.toISOString())
        .order('check_in_time', { ascending: false })
        .limit(200);

      if (historyError) throw historyError;

      if (!historyRows || historyRows.length === 0) {
        return res.json([]);
      }

      // Collect the unique customer IDs from these history rows
      const customerIds = [...new Set(historyRows.map(h => h.customer_id))];

      // Fetch static profile data from customers table (name, mobile, membership, etc.)
      const { data: profiles, error: profilesError } = await supabase
        .from('customers')
        .select('id, name, mobile_number, is_member, total_discount_given, entry_fee_per_person, entry_duration')
        .in('id', customerIds);

      if (profilesError) throw profilesError;

      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.id] = p; });

      // Fetch ONLY orders placed on this specific date — keyed by customer_id.
      // orders.timestamp is immutable; it is never updated after creation.
      const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('*, order_items (*)')
        .in('customer_id', customerIds)
        .gte('timestamp', startOfDay.toISOString())
        .lte('timestamp', endOfDay.toISOString())
        .order('timestamp', { ascending: false });

      if (ordersError) throw ordersError;

      // Group orders by customer_id for quick lookup
      const ordersByCustomer = {};
      (orders || []).forEach(order => {
        if (!ordersByCustomer[order.customer_id]) {
          ordersByCustomer[order.customer_id] = [];
        }
        ordersByCustomer[order.customer_id].push(order);
      });

      // Build the response: merge history row data + profile + orders.
      // Use history row fields (people, payment_method, redeemable_credit,
      // renewal_number, token_number, entry_fee_per_person, entry_duration)
      // because they were captured AT visit time and are permanently accurate.
      const customersWithOrders = historyRows.map(h => {
        const profile = profileMap[h.customer_id] || {};

        // ── CRITICAL: scope orders to THIS visit's time window ────────────
        // A customer can visit multiple times in the same day.
        // Without this filter, ALL of today's orders for that customer would
        // appear on EVERY visit row — doubling/tripling order totals.
        // We include an order if its timestamp falls between this visit's
        // check_in_time and (check_out_time OR now for active sessions).
        const visitStart = new Date(h.check_in_time).getTime();
        const visitEnd   = h.check_out_time
          ? new Date(h.check_out_time).getTime()
          : Date.now(); // still active — include orders up to now

        const visitOrders = (ordersByCustomer[h.customer_id] || []).filter(o => {
          const t = new Date(o.timestamp).getTime();
          return t >= visitStart && t <= visitEnd;
        });

        return {
          // Static profile (never changes)
          id: h.customer_id,
          name: profile.name,
          mobile_number: profile.mobile_number,
          is_member: profile.is_member || false,
          total_discount_given: profile.total_discount_given || 0,
          // Per-visit state — taken from history row, NOT from customers table
          check_in_time: h.check_in_time,
          check_out_time: h.check_out_time,
          people: h.people,
          payment_method: h.payment_method,
          redeemable_credit: h.redeemable_credit,
          token_number: h.token_number,
          is_renewal: h.is_renewal || false,
          renewal_count: h.renewal_number || 0,
          // Use fee stored in history row; fall back to current customer profile value
          entry_fee_per_person: h.entry_fee_per_person || profile.entry_fee_per_person,
          entry_duration: h.entry_duration || profile.entry_duration || '2hr',
          // isActive: customer is still active if they haven't checked out yet
          is_active: !h.check_out_time,
          // Only orders placed during this specific visit
          orders: visitOrders
        };
      });

      return res.json(transformToCamelCase(customersWithOrders));
    }

    // If no date filter, fetch all customers with all orders (original live-view behavior)
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
// GET /by-date-range — used by BillingPage for multi-day reporting.
// Same fix: uses customer_history as the immutable source of truth so that
// repeat customer visits on later dates do not alter historical totals.
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

    // ─── SOURCE OF TRUTH: customer_history ───────────────────────────────
    // Query history rows whose check_in_time falls within the requested range.
    // These rows are append-only and are NEVER updated, so past-date totals
    // remain accurate regardless of future repeat visits.
    const { data: historyRows, error: historyError } = await supabase
      .from('customer_history')
      .select('*')
      .gte('check_in_time', start.toISOString())
      .lte('check_in_time', end.toISOString())
      .order('check_in_time', { ascending: false })
      .limit(500);

    if (historyError) throw historyError;

    if (!historyRows || historyRows.length === 0) {
      return res.json([]);
    }

    // Collect unique customer IDs
    const customerIds = [...new Set(historyRows.map(h => h.customer_id))];

    // Fetch static profile data (name, mobile, membership flags)
    const { data: profiles, error: profilesError } = await supabase
      .from('customers')
      .select('id, name, mobile_number, is_member, total_discount_given, entry_fee_per_person, entry_duration')
      .in('id', customerIds);

    if (profilesError) throw profilesError;

    const profileMap = {};
    (profiles || []).forEach(p => { profileMap[p.id] = p; });

    // Fetch orders within this date range by their immutable timestamp
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('*, order_items (*)')
      .in('customer_id', customerIds)
      .gte('timestamp', start.toISOString())
      .lte('timestamp', end.toISOString())
      .order('timestamp', { ascending: false });

    if (ordersError) throw ordersError;

    // Group orders by customer_id for quick lookup
    const ordersByCustomer = {};
    (orders || []).forEach(order => {
      if (!ordersByCustomer[order.customer_id]) {
        ordersByCustomer[order.customer_id] = [];
      }
      ordersByCustomer[order.customer_id].push(order);
    });

    // Build response from history rows (immutable per-visit state) + profile + orders
    const customersWithOrders = historyRows.map(h => {
      const profile = profileMap[h.customer_id] || {};

      // ── CRITICAL: scope orders to THIS visit's time window ────────────
      // A customer can visit multiple times on the same day (or across the date
      // range). Without this filter, ALL orders for that customer_id in the
      // date range would appear on every visit row — doubling/tripling totals.
      const visitStart = new Date(h.check_in_time).getTime();
      const visitEnd   = h.check_out_time
        ? new Date(h.check_out_time).getTime()
        : Date.now();

      const visitOrders = (ordersByCustomer[h.customer_id] || []).filter(o => {
        const t = new Date(o.timestamp).getTime();
        return t >= visitStart && t <= visitEnd;
      });

      return {
        id: h.customer_id,
        name: profile.name,
        mobile_number: profile.mobile_number,
        is_member: profile.is_member || false,
        total_discount_given: profile.total_discount_given || 0,
        check_in_time: h.check_in_time,
        check_out_time: h.check_out_time,
        people: h.people,
        payment_method: h.payment_method,
        redeemable_credit: h.redeemable_credit,
        token_number: h.token_number,
        is_renewal: h.is_renewal || false,
        renewal_count: h.renewal_number || 0,
        entry_fee_per_person: h.entry_fee_per_person || profile.entry_fee_per_person,
        entry_duration: h.entry_duration || profile.entry_duration || '2hr',
        is_active: !h.check_out_time,
        // Only orders placed during this specific visit
        orders: visitOrders
      };
    });

    console.log(`Returning ${customersWithOrders.length} visit records with orders`);
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

// ──────────────────────────────────────────────────────────────────────────────
// GET /stats  — global KPI summary for System Data Center (all customers)
// ──────────────────────────────────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    // Total customer count (cheap row estimate)
    const { count: totalCustomers, error: countErr } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true });
    if (countErr) throw countErr;

    // Active this month: customers whose check_in_time is within current calendar month (IST)
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const { count: activeThisMonth, error: activeErr } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .gte('check_in_time', monthStart.toISOString())
      .lte('check_in_time', monthEnd.toISOString());
    if (activeErr) throw activeErr;

    // Total visits = total rows in customer_history
    const { count: totalVisits, error: visitsErr } = await supabase
      .from('customer_history')
      .select('*', { count: 'exact', head: true });
    if (visitsErr) throw visitsErr;

    // Repeated customers = customers with more than 1 history row
    // Use a raw count via RPC or approximate via visits > total customers
    // Simple approximation: customers who have at least 2 history entries
    const { data: repeatData, error: repeatErr } = await supabase
      .rpc('count_repeated_customers');

    let repeatedCustomers = 0;
    if (repeatErr) {
      // Fallback: estimate from totalVisits vs totalCustomers
      repeatedCustomers = Math.max(0, (totalVisits || 0) - (totalCustomers || 0));
    } else {
      repeatedCustomers = repeatData || 0;
    }

    res.json({
      totalCustomers: totalCustomers || 0,
      repeatedCustomers,
      activeThisMonth: activeThisMonth || 0,
      totalVisits: totalVisits || 0,
    });
  } catch (err) {
    console.error('Error fetching customer stats:', err);
    res.status(500).json({ error: "Failed to fetch customer stats" });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// GET /paginated  — paginated, searchable, sortable customer roster
// ──────────────────────────────────────────────────────────────────────────────
router.get("/paginated", async (req, res) => {
  try {
    let { page = 1, pageSize = 10, search = "", sortBy = "date", sortDirection = "desc" } = req.query;
    page     = parseInt(page, 10);
    pageSize = parseInt(pageSize, 10);
    const from = (page - 1) * pageSize;
    const to   = from + pageSize - 1;

    // Total count for the response header (before search filter)
    const { count: totalCount, error: totalErr } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true });
    if (totalErr) throw totalErr;

    // Map frontend sortBy keys → DB columns
    const sortColumnMap = {
      name:   'name',
      date:   'created_at',
      visits: 'created_at',   // fallback — true visit count requires join
    };
    const dbSortColumn = sortColumnMap[sortBy] || 'created_at';
    const ascending    = sortDirection === 'asc';

    // Build query
    let query = supabase
      .from('customers')
      .select(`
        id,
        name,
        mobile_number,
        created_at,
        check_in_time
      `, { count: 'exact' })
      .order(dbSortColumn, { ascending })
      .range(from, to);

    if (search && search.trim() !== '') {
      const s = search.trim().toLowerCase();
      // Supabase ilike for partial match on name or mobile_number
      query = query.or(`name.ilike.%${s}%,mobile_number.ilike.%${s}%`);
    }

    const { data, count: filteredCount, error } = await query;
    if (error) throw error;

    // For each customer, get their visit count from customer_history
    const customerIds = (data || []).map(c => c.id);
    let visitCounts = {};
    if (customerIds.length > 0) {
      const { data: histData, error: histErr } = await supabase
        .from('customer_history')
        .select('customer_id')
        .in('customer_id', customerIds);
      if (!histErr && histData) {
        histData.forEach(h => {
          visitCounts[h.customer_id] = (visitCounts[h.customer_id] || 0) + 1;
        });
      }
    }

    const items = (data || []).map(c => ({
      id:          c.id,
      name:        c.name,
      mobileNumber: c.mobile_number,
      visits:      visitCounts[c.id] || 1,
      lastVisit:   c.check_in_time,
      dateJoined:  c.created_at || c.check_in_time,
    }));

    res.json({
      items,
      filteredCount: filteredCount || 0,
      totalCount:    totalCount    || 0,
      page,
      pageSize,
      totalPages: Math.ceil((filteredCount || 0) / pageSize),
    });
  } catch (err) {
    console.error('Error fetching paginated customers:', err);
    res.status(500).json({ error: "Failed to fetch paginated customers" });
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

      // Add fresh visit to history — store fee and duration so past-date
      // billing remains accurate even if the fee changes in the future.
      await supabase
        .from('customer_history')
        .insert({
          customer_id: existingCustomer.id,
          check_in_time: checkInTime,
          people,
          payment_method: paymentMethod,
          redeemable_credit: redeemableCredit,
          token_number: tokenNumber,
          entry_fee_per_person: entryFeePerPerson,
          entry_duration: entryDuration
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

    // Add to history — store fee and duration so past-date billing remains
    // accurate even if the entry fee is changed in system settings later.
    await supabase
      .from('customer_history')
      .insert({
        customer_id: newCustomer.id,
        check_in_time: checkInTime,
        people,
        payment_method: paymentMethod,
        redeemable_credit: redeemableCredit,
        token_number: tokenNumber,
        entry_fee_per_person: entryFeePerPerson,
        entry_duration: entryDuration
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

    // Update customer live state
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

    // Also update the current open history row so that historical billing reads
    // the correct accumulated renewal_number and redeemable_credit for this visit.
    // We update the most-recent history row that has no checkout time.
    await supabase
      .from('customer_history')
      .update({
        renewal_number: newRenewalCount,
        is_renewal: true,
        redeemable_credit: newRedeemableCredit
      })
      .eq('customer_id', id)
      .is('check_out_time', null)
      .order('check_in_time', { ascending: false })
      .limit(1);

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
    // finalPaymentMethod is provided by the frontend when the customer originally
    // chose "pay_later" — staff selects cash or online at checkout time.
    const { finalPaymentMethod } = req.body || {};
    const checkOutTime = new Date().toISOString();

    // Get current customer data before checkout
    const { data: currentCustomer, error: fetchError } = await supabase
      .from('customers')
      .select('renewal_count, payment_method')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    // Resolve final payment method:
    //   - If customer was pay_later and staff provided a method → use it
    //   - Otherwise keep whatever was stored at check-in
    const resolvedPaymentMethod = (currentCustomer.payment_method === 'pay_later' && finalPaymentMethod)
      ? finalPaymentMethod
      : currentCustomer.payment_method;

    // Build history update payload
    const historyUpdate = {
      check_out_time: checkOutTime,
      renewal_number: currentCustomer.renewal_count || 0,
      is_renewal: (currentCustomer.renewal_count || 0) > 0,
    };
    if (resolvedPaymentMethod) {
      historyUpdate.payment_method = resolvedPaymentMethod;
    }

    // Update latest open history entry
    const { error: historyError } = await supabase
      .from('customer_history')
      .update(historyUpdate)
      .eq('customer_id', id)
      .is('check_out_time', null)
      .order('check_in_time', { ascending: false })
      .limit(1);

    if (historyError) throw historyError;

    // Build customer update payload
    const customerUpdate = {
      is_active: false,
      check_out_time: checkOutTime,
      redeemable_credit: 0,
    };
    if (resolvedPaymentMethod) {
      customerUpdate.payment_method = resolvedPaymentMethod;
    }

    // Update customer — mark as checked out
    const { data: customer, error: updateError } = await supabase
      .from('customers')
      .update(customerUpdate)
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

// ─── PATCH /:id/payment-method — update customer's payment method ─────────────
router.patch("/:id/payment-method", async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentMethod } = req.body;
    if (!["cash", "online", "pay_later"].includes(paymentMethod)) {
      return res.status(400).json({ error: "Invalid payment method" });
    }

    const { data: customer, error } = await supabase
      .from("customers")
      .update({ payment_method: paymentMethod })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    // Also update history row for this session so reports are accurate
    await supabase
      .from("visit_history")
      .update({ payment_method: paymentMethod })
      .eq("customer_id", id)
      .is("check_out_time", null); // only the open (active) session

    res.json(transformToCamelCase(customer));
  } catch (err) {
    console.error("Error updating payment method:", err);
    res.status(500).json({ error: "Failed to update payment method" });
  }
});

// ─── DELETE /:id/orders/:orderId — cancel/delete an order (admin/superadmin) ──
router.delete("/:id/orders/:orderId", async (req, res) => {
  try {
    const { id: customerId, orderId } = req.params;

    // 1. Fetch the order to know redeemed amount to restore
    const { data: order, error: orderFetchError } = await supabase
      .from("orders")
      .select("id, customer_id, redeemed, total, payable, payment_method")
      .eq("id", orderId)
      .eq("customer_id", customerId)
      .single();

    if (orderFetchError || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    // 2. Delete order_items first (FK constraint)
    const { error: itemsDeleteError } = await supabase
      .from("order_items")
      .delete()
      .eq("order_id", orderId);

    if (itemsDeleteError) throw itemsDeleteError;

    // 3. Delete the order itself
    const { error: orderDeleteError } = await supabase
      .from("orders")
      .delete()
      .eq("id", orderId);

    if (orderDeleteError) throw orderDeleteError;

    // 4. Restore redeemed credit back to customer (if any credit was used)
    const redeemedToRestore = order.redeemed || 0;
    let updatedCustomer = null;
    if (redeemedToRestore > 0) {
      const { data: current } = await supabase
        .from("customers")
        .select("redeemable_credit")
        .eq("id", customerId)
        .single();

      const restoredCredit = (current?.redeemable_credit || 0) + redeemedToRestore;

      const { data: updated, error: updateError } = await supabase
        .from("customers")
        .update({ redeemable_credit: restoredCredit })
        .eq("id", customerId)
        .select(`*, orders(*, order_items(*))`)
        .single();

      if (updateError) throw updateError;
      updatedCustomer = updated;
    } else {
      const { data: updated } = await supabase
        .from("customers")
        .select(`*, orders(*, order_items(*))`)
        .eq("id", customerId)
        .single();
      updatedCustomer = updated;
    }

    res.json({
      success: true,
      creditRestored: redeemedToRestore,
      customer: transformToCamelCase(updatedCustomer),
    });
  } catch (err) {
    console.error("Error deleting order:", err);
    res.status(500).json({ error: "Failed to delete order" });
  }
});

// Add order to customer
router.post("/:id/orders", async (req, res) => {
  try {
    const { id } = req.params;
    const { items, total, redeemed, paymentMethod, discountPercent = 0, discountAmount = 0 } = req.body;

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

    // Calculate payable securely on server
    const serverPayable = total - actualRedeemed - discountAmount;

    // Create order
    const { error: orderError } = await supabase
      .from('orders')
      .insert({
        id: orderId,
        customer_id: id,
        total,
        redeemed: actualRedeemed,
        payable: serverPayable,
        payment_method: paymentMethod,
        token_number: customer.token_number,
        timestamp,
        discount_percent: discountPercent,
        discount_amount: discountAmount
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
    const newTotalDiscount = (Number(customer.total_discount_given) || 0) + Number(discountAmount);
    
    const { data: updatedCustomer, error: updateError } = await supabase
      .from('customers')
      .update({ 
        redeemable_credit: newCredit,
        total_discount_given: newTotalDiscount
      })
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

// ─── SUPERADMIN: Edit a specific dine-in order ──────────────────────────────
// PATCH /customers/:customerId/orders/:orderId
router.patch("/:customerId/orders/:orderId", async (req, res) => {
  try {
    const { customerId, orderId } = req.params;
    const { paymentMethod, discountPercent, discountAmount, payable, total } = req.body;

    // Fetch existing orders JSONB
    const { data: customer, error: fetchErr } = await supabase
      .from("customers")
      .select("orders")
      .eq("id", customerId)
      .single();

    if (fetchErr) throw fetchErr;

    const orders = (customer.orders || []).map(o => {
      if (o.id !== orderId) return o;
      return {
        ...o,
        ...(paymentMethod  !== undefined && { paymentMethod }),
        ...(discountPercent !== undefined && { discount_percent: discountPercent, discountPercent }),
        ...(discountAmount  !== undefined && { discount_amount:  discountAmount,  discountAmount  }),
        ...(payable        !== undefined && { payable }),
        ...(total          !== undefined && { total }),
      };
    });

    const { error: updateErr } = await supabase
      .from("customers")
      .update({ orders })
      .eq("id", customerId);

    if (updateErr) throw updateErr;

    res.json({ success: true, orderId });
  } catch (err) {
    console.error("Patch customer order failed:", err);
    res.status(500).json({ error: err.message || "Failed to update order" });
  }
});

// ─── SUPERADMIN: Delete a customer entry (full session) ──────────────────────
// DELETE /customers/:id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error("Delete customer entry failed:", err);
    res.status(500).json({ error: err.message || "Failed to delete entry" });
  }
});

module.exports = router;
