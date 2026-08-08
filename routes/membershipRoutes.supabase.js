// routes/membershipRoutes.supabase.js
// Handles: Membership Plans (CRUD), Memberships (assign/renew), RFID lookup

const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid");
const { supabase } = require("../config/supabase");

// ─── Helper: camelCase conversion ──────────────────────────────────────────
const toCamel = (str) => str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

function transformToCamelCase(obj) {
  if (Array.isArray(obj)) return obj.map(transformToCamelCase);
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [toCamel(k), transformToCamelCase(v)])
    );
  }
  return obj;
}

// ══════════════════════════════════════════════════════════════════════════
// MEMBERSHIP PLANS (superadmin manages these)
// ══════════════════════════════════════════════════════════════════════════

// GET /api/memberships/plans — list all plans
router.get("/plans", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("membership_plans")
      .select("*")
      .order("price", { ascending: true });
    if (error) throw error;
    res.json(transformToCamelCase(data));
  } catch (err) {
    console.error("Error fetching plans:", err);
    res.status(500).json({ error: "Failed to fetch membership plans" });
  }
});

// POST /api/memberships/plans — create a plan (superadmin)
router.post("/plans", async (req, res) => {
  try {
    const {
      name, durationType, price, entryFeeOverride,
      foodDiscountPercent, description, monthlyCreditAmount,
      creditRedeemableOn, unlimitedSitting, maxGuests,
      guestEntryDiscountPercent, autoRenew, sortOrder,
    } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: "name and price are required" });
    }
    const { data, error } = await supabase
      .from("membership_plans")
      .insert({
        id: uuidv4(),
        name,
        description: description || null,
        duration_type: durationType || "monthly",
        price: Number(price),
        entry_fee_override: entryFeeOverride !== undefined ? Number(entryFeeOverride) : null,
        food_discount_percent: Number(foodDiscountPercent) || 0,
        monthly_credit_amount: Number(monthlyCreditAmount) || 0,
        credit_redeemable_on: creditRedeemableOn || "beverages",
        unlimited_sitting: unlimitedSitting !== undefined ? unlimitedSitting : true,
        max_guests: Number(maxGuests) || 0,
        guest_entry_discount_percent: Number(guestEntryDiscountPercent) || 0,
        auto_renew: autoRenew || false,
        sort_order: Number(sortOrder) || 99,
        is_active: true,
      })
      .select()
      .single();
    if (error) throw error;
    res.json(transformToCamelCase(data));
  } catch (err) {
    console.error("Error creating plan:", err);
    res.status(500).json({ error: "Failed to create plan" });
  }
});

// PUT /api/memberships/plans/:id — update a plan (superadmin)
router.put("/plans/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, durationType, price, entryFeeOverride, foodDiscountPercent,
      isActive, description, monthlyCreditAmount, creditRedeemableOn,
      unlimitedSitting, maxGuests, guestEntryDiscountPercent, autoRenew, sortOrder,
    } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    if (name !== undefined)                     updateData.name = name;
    if (description !== undefined)              updateData.description = description;
    if (durationType !== undefined)             updateData.duration_type = durationType;
    if (price !== undefined)                    updateData.price = Number(price);
    if (entryFeeOverride !== undefined)         updateData.entry_fee_override = Number(entryFeeOverride);
    if (foodDiscountPercent !== undefined)      updateData.food_discount_percent = Number(foodDiscountPercent);
    if (monthlyCreditAmount !== undefined)      updateData.monthly_credit_amount = Number(monthlyCreditAmount);
    if (creditRedeemableOn !== undefined)       updateData.credit_redeemable_on = creditRedeemableOn;
    if (unlimitedSitting !== undefined)         updateData.unlimited_sitting = unlimitedSitting;
    if (maxGuests !== undefined)               updateData.max_guests = Number(maxGuests);
    if (guestEntryDiscountPercent !== undefined) updateData.guest_entry_discount_percent = Number(guestEntryDiscountPercent);
    if (autoRenew !== undefined)               updateData.auto_renew = autoRenew;
    if (sortOrder !== undefined)               updateData.sort_order = Number(sortOrder);
    if (isActive !== undefined)                updateData.is_active = isActive;

    const { data, error } = await supabase
      .from("membership_plans")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    res.json(transformToCamelCase(data));
  } catch (err) {
    console.error("Error updating plan:", err);
    res.status(500).json({ error: "Failed to update plan" });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// MEMBERSHIPS (customer <-> plan links)
// ══════════════════════════════════════════════════════════════════════════

// GET /api/memberships — list all memberships with customer + plan info
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("memberships")
      .select(`
        *,
        membership_plans (*)
      `)
      .order("created_at", { ascending: false });
    if (error) throw error;

    // Enrich with customer data
    const enriched = await Promise.all(data.map(async (m) => {
      if (!m.customer_id) return transformToCamelCase(m);
      const { data: customer } = await supabase
        .from("customers")
        .select("id, name, mobile_number")
        .eq("id", m.customer_id)
        .single();
      return transformToCamelCase({ ...m, customer });
    }));

    res.json(enriched);
  } catch (err) {
    console.error("Error fetching memberships:", err);
    res.status(500).json({ error: "Failed to fetch memberships" });
  }
});

// GET /api/memberships/by-rfid/:uid — fast RFID card lookup
router.get("/by-rfid/:uid", async (req, res) => {
  try {
    const { uid } = req.params;
    const { data: membership, error } = await supabase
      .from("memberships")
      .select(`*, membership_plans (*)`)
      .eq("rfid_uid", uid)
      .eq("status", "active")
      .single();

    if (error || !membership) {
      return res.status(404).json({ error: "No active membership found for this card" });
    }

    // Fetch customer
    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, mobile_number, is_active, check_in_time")
      .eq("id", membership.customer_id)
      .single();

    // Check if membership is expired
    if (membership.end_date && new Date(membership.end_date) < new Date()) {
      // Auto-update status
      await supabase
        .from("memberships")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", membership.id);
      return res.status(410).json({ error: "Membership has expired", membership: transformToCamelCase(membership) });
    }

    res.json(transformToCamelCase({ ...membership, customer }));
  } catch (err) {
    console.error("Error in RFID lookup:", err);
    res.status(500).json({ error: "Failed to lookup RFID card" });
  }
});

// GET /api/memberships/by-phone/:mobile — lookup member by phone
router.get("/by-phone/:mobile", async (req, res) => {
  try {
    const { mobile } = req.params;
    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, mobile_number, is_member, rfid_uid")
      .eq("mobile_number", mobile)
      .single();

    if (!customer || !customer.is_member) {
      return res.status(404).json({ found: false, message: "Not a member" });
    }

    const { data: membership } = await supabase
      .from("memberships")
      .select(`*, membership_plans (*)`)
      .eq("customer_id", customer.id)
      .eq("status", "active")
      .single();

    res.json(transformToCamelCase({ ...membership, customer }));
  } catch (err) {
    console.error("Error in phone lookup:", err);
    res.status(500).json({ error: "Failed to lookup member" });
  }
});

// POST /api/memberships — assign membership to customer
router.post("/", async (req, res) => {
  try {
    const { customerId, planId, mobileNumber, rfidUid, rfidCardNumber, durationMonths } = req.body;

    if (!planId) return res.status(400).json({ error: "planId is required" });

    // Resolve customer
    let resolvedCustomerId = customerId;
    if (!resolvedCustomerId && mobileNumber) {
      // Find or create customer by mobile
      const { data: existing } = await supabase
        .from("customers")
        .select("id")
        .eq("mobile_number", mobileNumber)
        .single();
      if (existing) resolvedCustomerId = existing.id;
    }
    if (!resolvedCustomerId) {
      return res.status(400).json({ error: "customerId or mobileNumber required" });
    }

    // Fetch plan to determine end date
    const { data: plan } = await supabase
      .from("membership_plans")
      .select("*")
      .eq("id", planId)
      .single();
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    // Calculate end date
    const startDate = new Date();
    let endDate = null;
    if (plan.duration_type === "monthly") {
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + (durationMonths || 1));
    } else if (plan.duration_type === "annual") {
      endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    // Cancel any existing active membership
    await supabase
      .from("memberships")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("customer_id", resolvedCustomerId)
      .eq("status", "active");

    // Create new membership
    const { data: membership, error } = await supabase
      .from("memberships")
      .insert({
        id: uuidv4(),
        customer_id: resolvedCustomerId,
        plan_id: planId,
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDate ? endDate.toISOString().split("T")[0] : null,
        status: "active",
        rfid_uid: rfidUid || null,
        rfid_card_number: rfidCardNumber || null,
        total_visits: 0,
      })
      .select(`*, membership_plans (*)`)
      .single();
    if (error) throw error;

    // Update customer: mark as member, store RFID
    await supabase
      .from("customers")
      .update({
        is_member: true,
        rfid_uid: rfidUid || null,
        membership_id: membership.id,
      })
      .eq("id", resolvedCustomerId);

    res.json(transformToCamelCase(membership));
  } catch (err) {
    console.error("Error assigning membership:", err);
    res.status(500).json({ error: "Failed to assign membership: " + err.message });
  }
});

// PUT /api/memberships/:id — update membership (assign RFID, renew, cancel)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { rfidUid, rfidCardNumber, status, endDate } = req.body;

    const updateData = { updated_at: new Date().toISOString() };
    if (rfidUid !== undefined) updateData.rfid_uid = rfidUid;
    if (rfidCardNumber !== undefined) updateData.rfid_card_number = rfidCardNumber;
    if (status !== undefined) updateData.status = status;
    if (endDate !== undefined) updateData.end_date = endDate;

    const { data: membership, error } = await supabase
      .from("memberships")
      .update(updateData)
      .eq("id", id)
      .select(`*, membership_plans (*)`)
      .single();
    if (error) throw error;

    // If assigning RFID, also update the customer
    if (rfidUid !== undefined && membership.customer_id) {
      await supabase
        .from("customers")
        .update({ rfid_uid: rfidUid })
        .eq("id", membership.customer_id);
    }

    res.json(transformToCamelCase(membership));
  } catch (err) {
    console.error("Error updating membership:", err);
    res.status(500).json({ error: "Failed to update membership" });
  }
});

// POST /api/memberships/:id/renew — extend membership by 1 period
router.post("/:id/renew", async (req, res) => {
  try {
    const { id } = req.params;
    const { data: membership, error: fetchError } = await supabase
      .from("memberships")
      .select(`*, membership_plans (*)`)
      .eq("id", id)
      .single();
    if (fetchError || !membership) return res.status(404).json({ error: "Membership not found" });

    const plan = membership.membership_plans;
    const currentEnd = membership.end_date ? new Date(membership.end_date) : new Date();
    const newEnd = new Date(currentEnd);

    if (plan.duration_type === "monthly") {
      newEnd.setMonth(newEnd.getMonth() + 1);
    } else if (plan.duration_type === "annual") {
      newEnd.setFullYear(newEnd.getFullYear() + 1);
    }

    const { data: updated, error: updateError } = await supabase
      .from("memberships")
      .update({
        end_date: newEnd.toISOString().split("T")[0],
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (updateError) throw updateError;

    res.json(transformToCamelCase(updated));
  } catch (err) {
    console.error("Error renewing membership:", err);
    res.status(500).json({ error: "Failed to renew membership" });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// CREDIT SYSTEM
// ══════════════════════════════════════════════════════════════════════════

// POST /api/memberships/:id/reset-credit — manually reset monthly credit (or auto on month start)
router.post("/:id/reset-credit", async (req, res) => {
  try {
    const { id } = req.params;
    const { data: membership } = await supabase
      .from("memberships")
      .select("*, membership_plans(*)")
      .eq("id", id)
      .single();
    if (!membership) return res.status(404).json({ error: "Membership not found" });

    const creditAmount = membership.membership_plans?.monthly_credit_amount || 0;

    // Reset balance and log transaction
    const { data: updated, error } = await supabase
      .from("memberships")
      .update({
        monthly_credit_balance: creditAmount,
        monthly_credit_used: 0,
        last_credit_reset: new Date().toISOString().split("T")[0],
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    // Log in credit_transactions
    if (creditAmount > 0) {
      await supabase.from("credit_transactions").insert({
        id: uuidv4(),
        membership_id: id,
        customer_id: membership.customer_id,
        type: "monthly_reset",
        amount: creditAmount,
        balance_after: creditAmount,
        description: `Monthly credit reset — ₹${creditAmount} added`,
      });
    }

    res.json({ success: true, newBalance: creditAmount, membership: transformToCamelCase(updated) });
  } catch (err) {
    console.error("Error resetting credit:", err);
    res.status(500).json({ error: "Failed to reset credit" });
  }
});

// POST /api/memberships/:id/use-credit — deduct credit from member balance
// Body: { amount, type, description, orderId }
router.post("/:id/use-credit", async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, type = "beverages", description, orderId } = req.body;
    const deduct = Number(amount);
    if (!deduct || deduct <= 0) return res.status(400).json({ error: "amount must be positive" });

    // Fetch current balance
    const { data: membership, error: fetchErr } = await supabase
      .from("memberships")
      .select("*, membership_plans(*)")
      .eq("id", id)
      .single();
    if (fetchErr || !membership) return res.status(404).json({ error: "Membership not found" });

    // Auto-reset if new month
    const lastReset = membership.last_credit_reset;
    const now = new Date();
    const resetDate = lastReset ? new Date(lastReset) : null;
    const creditAmount = membership.membership_plans?.monthly_credit_amount || 0;

    let currentBalance = membership.monthly_credit_balance || 0;
    if (resetDate && (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear())) {
      // New month — auto-reset credit
      currentBalance = creditAmount;
      await supabase.from("memberships").update({
        monthly_credit_balance: creditAmount,
        monthly_credit_used: 0,
        last_credit_reset: now.toISOString().split("T")[0],
      }).eq("id", id);

      await supabase.from("credit_transactions").insert({
        id: uuidv4(),
        membership_id: id,
        customer_id: membership.customer_id,
        type: "monthly_reset",
        amount: creditAmount,
        balance_after: creditAmount,
        description: `Auto monthly credit reset — ₹${creditAmount}`,
      });
    }

    // Check what this plan allows credit on
    const allowedOn = membership.membership_plans?.credit_redeemable_on || "beverages";
    if (allowedOn !== "both" && allowedOn !== type) {
      return res.status(400).json({
        error: `Credit for this plan can only be used on ${allowedOn}`,
        allowedOn,
      });
    }

    const actualDeduct = Math.min(deduct, currentBalance);
    if (actualDeduct <= 0) {
      return res.status(400).json({ error: "No credit balance remaining", balance: currentBalance });
    }

    const newBalance = currentBalance - actualDeduct;
    const { data: updated } = await supabase
      .from("memberships")
      .update({
        monthly_credit_balance: newBalance,
        monthly_credit_used: (membership.monthly_credit_used || 0) + actualDeduct,
        lifetime_credit_used: (membership.lifetime_credit_used || 0) + actualDeduct,
        updated_at: now.toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    // Log transaction
    await supabase.from("credit_transactions").insert({
      id: uuidv4(),
      membership_id: id,
      customer_id: membership.customer_id,
      type,
      amount: -actualDeduct,
      balance_after: newBalance,
      description: description || `Credit used on ${type}`,
      order_id: orderId || null,
    });

    res.json({
      success: true,
      deducted: actualDeduct,
      requestedAmount: deduct,
      newBalance,
      membership: transformToCamelCase(updated),
    });
  } catch (err) {
    console.error("Error using credit:", err);
    res.status(500).json({ error: "Failed to use credit" });
  }
});

// GET /api/memberships/:id/credit-history — full credit transaction history
router.get("/:id/credit-history", async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from("credit_transactions")
      .select("*")
      .eq("membership_id", id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    res.json(transformToCamelCase(data));
  } catch (err) {
    console.error("Error fetching credit history:", err);
    res.status(500).json({ error: "Failed to fetch credit history" });
  }
});

// GET /api/memberships/checkin-info/:rfidOrPhone — full member info for check-in
// Used by POS when scanning card or entering phone at entry
router.get("/checkin-info/:identifier", async (req, res) => {
  try {
    const { identifier } = req.params;
    let membership = null;

    // Try RFID first
    const { data: byRfid } = await supabase
      .from("memberships")
      .select("*, membership_plans(*)")
      .eq("rfid_uid", identifier)
      .eq("status", "active")
      .single();

    if (byRfid) {
      membership = byRfid;
    } else if (/^\d{10}$/.test(identifier)) {
      // Try phone number
      const { data: customer } = await supabase
        .from("customers")
        .select("id")
        .eq("mobile_number", identifier)
        .single();
      if (customer) {
        const { data: byPhone } = await supabase
          .from("memberships")
          .select("*, membership_plans(*)")
          .eq("customer_id", customer.id)
          .eq("status", "active")
          .single();
        if (byPhone) membership = byPhone;
      }
    }

    if (!membership) {
      return res.status(404).json({ isMember: false, message: "Not a member or membership inactive" });
    }

    // Auto-reset credit if new month
    const plan = membership.membership_plans;
    const creditAmount = plan?.monthly_credit_amount || 0;
    const lastReset = membership.last_credit_reset;
    const now = new Date();
    let balance = membership.monthly_credit_balance || 0;

    if (creditAmount > 0 && lastReset) {
      const resetDate = new Date(lastReset);
      if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
        balance = creditAmount;
        await supabase.from("memberships").update({
          monthly_credit_balance: creditAmount,
          monthly_credit_used: 0,
          last_credit_reset: now.toISOString().split("T")[0],
          updated_at: now.toISOString(),
        }).eq("id", membership.id);
      }
    }

    // Fetch customer
    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, mobile_number, is_active, check_in_time")
      .eq("id", membership.customer_id)
      .single();

    // Check expiry
    const isExpired = membership.end_date && new Date(membership.end_date) < now;
    if (isExpired) {
      await supabase.from("memberships").update({ status: "expired", updated_at: now.toISOString() }).eq("id", membership.id);
      return res.status(410).json({ isMember: false, isExpired: true, message: "Membership expired", expiryDate: membership.end_date });
    }

    res.json({
      isMember: true,
      membership: transformToCamelCase({
        ...membership,
        monthly_credit_balance: balance,
        customer,
      }),
      // Flattened benefits for easy use in POS
      benefits: {
        planName: plan?.name,
        entryFee: plan?.entry_fee_override ?? null,       // null = use global rate
        isFreeEntry: plan?.entry_fee_override === 0,
        unlimitedSitting: plan?.unlimited_sitting ?? true,
        monthlyCreditBalance: balance,
        monthlyCreditAmount: creditAmount,
        creditRedeemableOn: plan?.credit_redeemable_on ?? "beverages",
        foodDiscountPercent: plan?.food_discount_percent ?? 0,
        maxGuests: plan?.max_guests ?? 0,
        guestEntryDiscountPercent: plan?.guest_entry_discount_percent ?? 0,
        autoRenew: plan?.auto_renew ?? false,
      },
    });
  } catch (err) {
    console.error("Error in checkin-info:", err);
    res.status(500).json({ error: "Check-in lookup failed" });
  }
});

module.exports = router;

