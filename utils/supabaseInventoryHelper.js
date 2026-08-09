const { v4: uuidv4 } = require("uuid");

async function tryDeductInventorySupabase(supabase, orderItems) {
  const results = [];
  const warnings = [];

  try {
    let inventoryUpdated = false;

    // We process each item sequentially to avoid race conditions with stock updates
    for (const item of orderItems) {
      try {
        // 1. Find recipe for this menu item
        const { data: recipe, error: recipeError } = await supabase
          .from("recipes")
          .select("*")
          .eq("menu_item_id", item.id)
          .single();

        if (recipeError || !recipe) {
          warnings.push(`No recipe found for menu item ${item.id} (${item.name || 'unknown'})`);
          continue;
        }

        // 2. Fetch recipe ingredients
        const { data: recipeIngredients, error: riError } = await supabase
          .from("recipe_ingredients")
          .select("*")
          .eq("recipe_id", recipe.id);

        if (riError || !recipeIngredients || recipeIngredients.length === 0) {
          warnings.push(`Recipe for menu item ${item.id} has no ingredients`);
          continue;
        }

        // 3. Process each ingredient
        for (const recipeIng of recipeIngredients) {
          try {
            // Fetch the inventory item
            const { data: inventoryItem, error: invError } = await supabase
              .from("ingredients")
              .select("*")
              .eq("id", recipeIng.ingredient_id)
              .single();

            if (invError || !inventoryItem) {
              warnings.push(`Ingredient ${recipeIng.ingredient_id} not found in inventory`);
              continue;
            }

            // Calculate quantity to deduct based on recipe yield and order item quantity
            // Standardizing: recipe yield tells us how many servings this recipe makes.
            // If yield is 1, and we ordered 1 item, we deduct the exact recipe quantities.
            const quantityToDeduct = parseFloat(
              ((recipeIng.quantity / (recipe.yield || 1)) * item.quantity).toFixed(4)
            );

            if (inventoryItem.current_stock < quantityToDeduct) {
              warnings.push(
                `Insufficient ${inventoryItem.name} (needed ${quantityToDeduct}, has ${inventoryItem.current_stock})`
              );
              continue;
            }

            let remainingToDeduct = quantityToDeduct;
            const batchDeductions = [];

            // 4. Handle batches if item has expiry
            if (inventoryItem.has_expiry) {
              const { data: batches, error: batchesError } = await supabase
                .from("ingredient_batches")
                .select("*")
                .eq("ingredient_id", inventoryItem.id)
                .order("expiry_date", { ascending: true });

              if (!batchesError && batches && batches.length > 0) {
                for (const batch of batches) {
                  if (remainingToDeduct <= 0) break;

                  const deductFromBatch = Math.min(remainingToDeduct, batch.quantity);
                  const newBatchQuantity = parseFloat((batch.quantity - deductFromBatch).toFixed(4));
                  remainingToDeduct = parseFloat((remainingToDeduct - deductFromBatch).toFixed(4));

                  batchDeductions.push({
                    batchId: batch.id,
                    quantity: deductFromBatch,
                    expiryDate: batch.expiry_date,
                    remainingInBatch: newBatchQuantity,
                  });

                  if (newBatchQuantity <= 0) {
                    // Delete empty batch
                    await supabase.from("ingredient_batches").delete().eq("id", batch.id);
                  } else {
                    // Update batch quantity
                    await supabase.from("ingredient_batches")
                      .update({ quantity: newBatchQuantity })
                      .eq("id", batch.id);
                  }
                }
              }
              
              if (remainingToDeduct > 0) {
                warnings.push(
                  `Couldn't fully deduct ${inventoryItem.name} from batches (remaining: ${remainingToDeduct})`
                );
              }
            }

            // 5. Update overall current stock
            const newStock = parseFloat((inventoryItem.current_stock - quantityToDeduct).toFixed(4));
            await supabase.from("ingredients")
              .update({ 
                current_stock: newStock,
                last_updated: new Date().toISOString()
              })
              .eq("id", inventoryItem.id);

            // 6. Record transaction
            await supabase.from("inventory_transactions").insert({
              type: "stock-out",
              item_type: "ingredient",
              item_id: inventoryItem.id,
              quantity: quantityToDeduct,
              reason: `Order deduction: ${item.name || `item ${item.id}`} (${item.quantity}x)`,
              recorded_by: "system (auto-deduction)",
              remaining_stock: newStock,
              batch_id: batchDeductions.length > 0 ? batchDeductions[0].batchId : null
            });

            // 7. Check for low stock and create alert
            if (newStock < inventoryItem.min_stock) {
              // Check if an unresolved alert already exists
              const { data: existingAlerts } = await supabase
                .from("inventory_alerts")
                .select("*")
                .eq("item_id", inventoryItem.id)
                .eq("alert_type", "low_stock")
                .eq("is_resolved", false);
                
              if (!existingAlerts || existingAlerts.length === 0) {
                await supabase.from("inventory_alerts").insert({
                  alert_type: "low_stock",
                  item_type: "ingredient",
                  item_id: inventoryItem.id,
                  message: `Low stock alert: ${inventoryItem.name} has fallen below minimum stock level (${newStock} < ${inventoryItem.min_stock})`,
                  severity: "warning",
                  is_resolved: false
                });
              }
            }

            results.push({
              menuItemId: item.id,
              ingredientId: inventoryItem.id,
              quantityDeducted: quantityToDeduct,
              success: true
            });

            inventoryUpdated = true;
          } catch (ingredientError) {
            warnings.push(`Error processing ingredient: ${ingredientError.message}`);
          }
        }
      } catch (itemError) {
        warnings.push(`Error processing menu item ${item.id}: ${itemError.message}`);
      }
    }
  } catch (error) {
    warnings.push(`Inventory system error: ${error.message}`);
  }

  return { results, warnings };
}

module.exports = {
  tryDeductInventorySupabase
};
