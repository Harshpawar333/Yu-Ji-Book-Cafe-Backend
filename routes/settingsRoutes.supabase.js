// routes/settingsRoutes.supabase.js
// Full system settings — entry fees, credit rules, all configurable by superadmin

const express = require("express");
const router = express.Router();
const { supabase } = require("../config/supabase");

// Map DB row → clean API response
function mapSettings(data) {
  return {
    // Entry fees (regular customers)
    entryFee: data.entry_fee,
    entryFee1hr: data.entry_fee_1hr ?? data.entry_fee ?? 40,
    entryFee2hr: data.entry_fee_2hr ?? data.entry_fee ?? 60,
    timePerEntry: data.time_per_entry ?? 2,

    // Credit rules for regular customers
    creditRedeemableOn: data.credit_redeemable_on ?? "beverages",
    // 'beverages' | 'food' | 'both'
    entryFeeRedeemablePercent: data.entry_fee_redeemable_percent ?? 100,
    // % of entry fee that becomes redeemable credit
  };
}

// GET /api/settings
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select("*")
      .eq("id", 1)
      .single();
    if (error) throw error;
    res.json(mapSettings(data));
  } catch (err) {
    console.error("Error fetching settings:", err);
    // Sensible defaults so app never crashes
    res.json({
      entryFee: 60,
      entryFee1hr: 40,
      entryFee2hr: 60,
      timePerEntry: 2,
      creditRedeemableOn: "beverages",
      entryFeeRedeemablePercent: 100,
    });
  }
});

// PUT /api/settings — superadmin only
router.put("/", async (req, res) => {
  try {
    const {
      entryFee1hr, entryFee2hr, timePerEntry,
      creditRedeemableOn, entryFeeRedeemablePercent,
    } = req.body;

    const updateData = { updated_at: new Date().toISOString() };

    if (entryFee1hr !== undefined)              updateData.entry_fee_1hr = Number(entryFee1hr);
    if (entryFee2hr !== undefined)              updateData.entry_fee_2hr = Number(entryFee2hr);
    if (timePerEntry !== undefined)             updateData.time_per_entry = Number(timePerEntry);
    if (creditRedeemableOn !== undefined)       updateData.credit_redeemable_on = creditRedeemableOn;
    if (entryFeeRedeemablePercent !== undefined) updateData.entry_fee_redeemable_percent = Number(entryFeeRedeemablePercent);

    // Keep legacy entry_fee in sync with 2hr fee
    if (entryFee2hr !== undefined) updateData.entry_fee = Number(entryFee2hr);

    const { data, error } = await supabase
      .from("system_settings")
      .update(updateData)
      .eq("id", 1)
      .select()
      .single();
    if (error) throw error;

    res.json(mapSettings(data));
  } catch (err) {
    console.error("Error updating settings:", err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

module.exports = router;
