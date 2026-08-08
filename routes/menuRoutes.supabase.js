// ============================================
// Menu Routes (Supabase Version)
// ============================================

const express = require("express");
const router = express.Router();
const { supabase } = require("../config/supabase");
const { transformToCamelCase, transformToSnakeCase } = require("../utils/dbTransform");

// Get all menu items
router.get("/", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .order('category', { ascending: true });

    if (error) throw error;

    res.json(transformToCamelCase(data));
  } catch (err) {
    console.error('Error fetching menu items:', err);
    res.status(500).json({ error: "Failed to fetch menu items" });
  }
});

// Get single menu item
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('id', parseInt(id))
      .single();

    if (error) throw error;

    const menuItem = {
      id: data.id,
      name: data.name,
      price: data.price,
      category: data.category,
      isRedeemable: data.is_redeemable,
      isAvailable: data.is_available,
      imageUrl: data.image_url,
      description: data.description
    };

    res.json(menuItem);
  } catch (err) {
    console.error('Error fetching menu item:', err);
    res.status(404).json({ error: "Menu item not found" });
  }
});

// Add new menu item
router.post("/", async (req, res) => {
  try {
    const { name, price, category, isRedeemable, isAvailable, imageUrl, description } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: "Name and price are required" });
    }

    // Get max ID
    const { data: maxData, error: maxError } = await supabase
      .from('menu_items')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);

    if (maxError) throw maxError;

    const newId = maxData && maxData.length > 0 ? maxData[0].id + 1 : 1;

    const { data, error } = await supabase
      .from('menu_items')
      .insert({
        id: newId,
        name,
        price: Number(price),
        category: category || 'Other',
        is_redeemable: isRedeemable !== false,
        is_available: isAvailable !== false,
        image_url: imageUrl || null,
        description: description || null
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      id: data.id,
      name: data.name,
      price: data.price,
      category: data.category,
      isRedeemable: data.is_redeemable,
      isAvailable: data.is_available,
      imageUrl: data.image_url,
      description: data.description
    });
  } catch (err) {
    console.error('Error creating menu item:', err);
    res.status(500).json({ error: "Failed to create menu item" });
  }
});

// Update menu item
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, category, isRedeemable, isAvailable, imageUrl, description } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (price !== undefined) updateData.price = Number(price);
    if (category !== undefined) updateData.category = category;
    if (isRedeemable !== undefined) updateData.is_redeemable = Boolean(isRedeemable);
    if (isAvailable !== undefined) updateData.is_available = Boolean(isAvailable);
    if (imageUrl !== undefined) updateData.image_url = imageUrl;
    if (description !== undefined) updateData.description = description;

    const { data, error } = await supabase
      .from('menu_items')
      .update(updateData)
      .eq('id', parseInt(id))
      .select()
      .single();

    if (error) throw error;

    res.json({
      id: data.id,
      name: data.name,
      price: data.price,
      category: data.category,
      isRedeemable: data.is_redeemable,
      isAvailable: data.is_available,
      imageUrl: data.image_url,
      description: data.description
    });
  } catch (err) {
    console.error('Error updating menu item:', err);
    res.status(500).json({ error: "Failed to update menu item" });
  }
});

// Delete menu item
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', parseInt(id));

    if (error) throw error;

    res.json({ message: "Menu item deleted successfully" });
  } catch (err) {
    console.error('Error deleting menu item:', err);
    res.status(500).json({ error: "Failed to delete menu item" });
  }
});

module.exports = router;
