// ============================================
// Inventory Routes - Supabase Version
// Migrated from JSON file storage to PostgreSQL
// ============================================

const express = require("express");
const router = express.Router();
const { supabase } = require("../config/supabase");

// ============================================
// GET /full-data - Main endpoint for frontend
// Returns all inventory data in one object
// ============================================
router.get("/full-data", async (req, res) => {
  try {
    console.log("📦 Fetching full inventory data...");
    
    // Fetch all data in parallel
    const [
      settingsResult,
      categoriesResult,
      unitsResult,
      ingredientsResult,
      suppliersResult,
      recipesResult,
      recipeIngredientsResult,
      transactionsResult,
      purchaseOrdersResult,
      wasteRecordsResult,
      alertsResult,
      inventoryUsersResult,
      menuItemsResult
    ] = await Promise.all([
      supabase.from("inventory_settings").select("*").single(),
      supabase.from("categories").select("*"),
      supabase.from("units").select("*"),
      supabase.from("ingredients").select("*"),
      supabase.from("suppliers").select("*"),
      supabase.from("recipes").select("*"),
      supabase.from("recipe_ingredients").select("*"),
      supabase.from("inventory_transactions").select("*").order("date", { ascending: false }).limit(100),
      supabase.from("purchase_orders").select("*").order("date", { ascending: false }).limit(50),
      supabase.from("waste_records").select("*").order("date", { ascending: false }).limit(50),
      supabase.from("inventory_alerts").select("*").eq("is_resolved", false),
      supabase.from("inventory_users").select("*"),
      supabase.from("menu_items").select("*")
    ]);

    // Check for errors
    if (settingsResult.error) throw settingsResult.error;
    if (categoriesResult.error) throw categoriesResult.error;
    if (unitsResult.error) throw unitsResult.error;
    if (ingredientsResult.error) throw ingredientsResult.error;
    if (suppliersResult.error) throw suppliersResult.error;
    if (recipesResult.error) throw recipesResult.error;

    // Fetch batches for ingredients with expiry
    const ingredientsWithBatches = await Promise.all(
      (ingredientsResult.data || []).map(async (ingredient) => {
        if (ingredient.has_expiry) {
          const { data: batches } = await supabase
            .from("ingredient_batches")
            .select("*")
            .eq("ingredient_id", ingredient.id)
            .order("expiry_date", { ascending: true });
          
          return {
            ...ingredient,
            batches: batches || []
          };
        }
        return { ...ingredient, batches: [] };
      })
    );

    // Build response object matching old JSON structure
    const fullData = {
      settings: {
        lowStockThreshold: settingsResult.data?.low_stock_threshold || 0.2,
        defaultUnit: settingsResult.data?.default_unit || "grams",
        costPrecision: settingsResult.data?.cost_precision || 2,
        expiryAlertDays: settingsResult.data?.expiry_alert_days || 3,
        inventoryMode: settingsResult.data?.inventory_mode || "manual",
        backupFrequency: settingsResult.data?.backup_frequency || "daily"
      },
      categories: (categoriesResult.data || []).map(c => ({
        id: c.id,
        name: c.name,
        description: c.description
      })),
      units: (unitsResult.data || []).map(u => ({
        id: u.id,
        name: u.name,
        symbol: u.symbol
      })),
      ingredients: ingredientsWithBatches.map(ing => ({
        id: ing.id,
        name: ing.name,
        categoryId: ing.category_id,
        unitId: ing.unit_id,
        currentStock: ing.current_stock,
        minStock: ing.min_stock,
        costPerUnit: ing.cost_per_unit,
        supplierId: ing.supplier_id,
        notes: ing.notes,
        hasExpiry: ing.has_expiry,
        lastUpdated: ing.last_updated,
        batches: (ing.batches || []).map(b => ({
          id: b.id,
          quantity: b.quantity,
          expiryDate: b.expiry_date,
          addedDate: b.added_date
        }))
      })),
      readyMadeItems: [], // Not implemented yet
      suppliers: (suppliersResult.data || []).map(s => ({
        id: s.id,
        name: s.name,
        contactPerson: s.contact_person,
        phone: s.phone,
        email: s.email,
        address: s.address,
        paymentTerms: s.payment_terms,
        notes: s.notes,
        isActive: s.is_active,
        currentStock: s.current_stock,
        lastUpdated: s.last_updated
      })),
      recipes: (recipesResult.data || []).map(r => {
        const recipeIngredients = (recipeIngredientsResult.data || [])
          .filter(ri => ri.recipe_id === r.id)
          .map(ri => ({
            ingredientId: ri.ingredient_id,
            quantity: ri.quantity,
            unit: ri.unit
          }));
        
        return {
          id: r.id,
          name: r.name,
          menuItemId: r.menu_item_id,
          yield: r.yield,
          instructions: r.instructions,
          preparationTime: r.preparation_time,
          totalCost: r.total_cost,
          lastUpdated: r.last_updated,
          ingredients: recipeIngredients
        };
      }),
      inventoryTransactions: (transactionsResult.data || []).map(t => ({
        id: t.id,
        date: t.date,
        type: t.type,
        itemType: t.item_type,
        itemId: t.item_id,
        quantity: t.quantity,
        reason: t.reason,
        recordedBy: t.recorded_by,
        remainingStock: t.remaining_stock,
        batchId: t.batch_id
      })),
      purchaseOrders: (purchaseOrdersResult.data || []).map(po => ({
        id: po.id,
        supplierId: po.supplier_id,
        date: po.date,
        expectedDelivery: po.expected_delivery,
        notes: po.notes,
        status: po.status,
        totalAmount: po.total_amount
      })),
      wasteRecords: (wasteRecordsResult.data || []).map(w => ({
        id: w.id,
        date: w.date,
        itemType: w.item_type,
        itemId: w.item_id,
        ingredientName: w.ingredient_name,
        quantity: w.quantity,
        unitId: w.unit_id,
        unitName: w.unit_name,
        batchId: w.batch_id,
        expiryDate: w.expiry_date,
        reason: w.reason,
        cost: w.cost,
        recordedBy: w.recorded_by
      })),
      inventoryAlerts: (alertsResult.data || []).map(a => ({
        id: a.id,
        alertType: a.alert_type,
        itemType: a.item_type,
        itemId: a.item_id,
        message: a.message,
        severity: a.severity,
        isResolved: a.is_resolved,
        createdAt: a.created_at
      })),
      batchHistory: [], // Can be added if needed
      users: (inventoryUsersResult.data || []).map(u => ({
        id: u.id,
        name: u.name,
        role: u.role,
        permissions: u.permissions
      })),
      menuItems: (menuItemsResult.data || []).map(m => ({
        id: m.id,
        name: m.name,
        price: m.price,
        category: m.category,
        isRedeemable: m.is_redeemable
      }))
    };

    console.log(`✅ Returned ${fullData.ingredients.length} ingredients, ${fullData.recipes.length} recipes`);
    res.json(fullData);
  } catch (err) {
    console.error("Failed to get full data:", err);
    res.status(500).json({ error: "Failed to load inventory data", details: err.message });
  }
});

// ============================================
// POST /adjust-stock - Adjust ingredient stock
// ============================================
router.post("/adjust-stock", async (req, res) => {
  try {
    const {
      itemType,
      itemId,
      quantityChange,
      reason,
      recordedBy,
      expiryDate,
      batchId
    } = req.body;

    console.log(`📊 Adjusting stock for ${itemId}: ${quantityChange}`);

    // Get current ingredient
    const { data: ingredient, error: getError } = await supabase
      .from("ingredients")
      .select("*")
      .eq("id", itemId)
      .single();

    if (getError) throw getError;

    const newStock = parseFloat(ingredient.current_stock) + parseFloat(quantityChange);

    // Update ingredient stock
    const { error: updateError } = await supabase
      .from("ingredients")
      .update({
        current_stock: newStock,
        last_updated: new Date().toISOString()
      })
      .eq("id", itemId);

    if (updateError) throw updateError;

    // Record transaction
    const { error: transError } = await supabase
      .from("inventory_transactions")
      .insert({
        type: quantityChange > 0 ? "stock-in" : "stock-out",
        item_type: itemType,
        item_id: itemId,
        quantity: Math.abs(quantityChange),
        reason: reason,
        recorded_by: recordedBy,
        remaining_stock: newStock,
        batch_id: batchId
      });

    if (transError) throw transError;

    // If adding stock with expiry, create batch
    if (quantityChange > 0 && expiryDate && ingredient.has_expiry) {
      const { error: batchError } = await supabase
        .from("ingredient_batches")
        .insert({
          ingredient_id: itemId,
          quantity: quantityChange,
          expiry_date: expiryDate,
          added_date: new Date().toISOString()
        });

      if (batchError) console.error("Batch creation error:", batchError);
    }

    res.json({ success: true, newStock });
  } catch (err) {
    console.error("Stock adjustment failed:", err);
    res.status(500).json({ error: "Failed to adjust stock", details: err.message });
  }
});

// ============================================
// CRUD endpoints for ingredients
// ============================================

// POST /ingredients - Create new ingredient
router.post("/ingredients", async (req, res) => {
  try {
    const ingredient = req.body;
    
    const { data, error } = await supabase
      .from("ingredients")
      .insert({
        name: ingredient.name,
        category_id: ingredient.categoryId,
        unit_id: ingredient.unitId,
        current_stock: ingredient.currentStock || 0,
        min_stock: ingredient.minStock || 0,
        cost_per_unit: ingredient.costPerUnit || 0,
        supplier_id: ingredient.supplierId,
        notes: ingredient.notes,
        has_expiry: ingredient.hasExpiry || false
      })
      .select()
      .single();

    if (error) throw error;
    
    res.json(data);
  } catch (err) {
    console.error("Create ingredient failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /ingredients/:id - Update ingredient
router.put("/ingredients/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const ingredient = req.body;
    
    const { data, error } = await supabase
      .from("ingredients")
      .update({
        name: ingredient.name,
        category_id: ingredient.categoryId,
        unit_id: ingredient.unitId,
        min_stock: ingredient.minStock,
        cost_per_unit: ingredient.costPerUnit,
        supplier_id: ingredient.supplierId,
        notes: ingredient.notes,
        has_expiry: ingredient.hasExpiry,
        last_updated: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    
    res.json(data);
  } catch (err) {
    console.error("Update ingredient failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /ingredients/:id - Delete ingredient
router.delete("/ingredients/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabase
      .from("ingredients")
      .delete()
      .eq("id", id);

    if (error) throw error;
    
    res.json({ success: true });
  } catch (err) {
    console.error("Delete ingredient failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Export router
// ============================================
module.exports = router;
