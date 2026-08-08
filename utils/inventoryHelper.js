// utils/inventoryHelper.js
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const DATA_PATH = path.join(__dirname, "../data/inventory.json");

function readInventoryData() {
  try {
    const rawData = fs.readFileSync(DATA_PATH, "utf8");
    return JSON.parse(rawData);
  } catch (error) {
    console.error("Error reading inventory data:", error);
    return null;
  }
}

function writeInventoryData(data) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error("Error writing inventory data:", error);
    return false;
  }
}

async function tryDeductInventory(orderItems) {
  const results = [];
  const warnings = [];

  try {
    let data = readInventoryData();
    if (!data) {
      warnings.push("Could not read inventory data");
      return { results, warnings };
    }

    // Make a working copy
    data = JSON.parse(JSON.stringify(data));
    let inventoryUpdated = false;

    for (const item of orderItems) {
      try {
        // Find recipe for this menu item
        const recipe = data.recipes.find((r) => r.menuItemId == item.id);
        if (!recipe) {
          warnings.push(`No recipe found for menu item ${item.id}`);
          continue;
        }

        // Process each ingredient
        for (const ingredient of recipe.ingredients) {
          try {
            const inventoryItem = data.ingredients.find(
              (i) => i.id === ingredient.ingredientId
            );
            if (!inventoryItem) {
              warnings.push(`Ingredient ${ingredient.ingredientId} not found`);
              continue;
            }

            const quantityToDeduct = parseFloat(
              (ingredient.quantity * item.quantity).toFixed(2)
            );

            if (inventoryItem.currentStock < quantityToDeduct) {
              warnings.push(
                `Insufficient ${
                  inventoryItem.name
                } (needed ${quantityToDeduct} ${
                  inventoryItem.unit || "units"
                }, ` + `has ${inventoryItem.currentStock})`
              );
              continue;
            }

            // Handle items with expiry (batches)
            if (inventoryItem.hasExpiry && inventoryItem.batches?.length > 0) {
              // Sort batches by expiry date (oldest first)
              const sortedBatches = [...inventoryItem.batches].sort(
                (a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)
              );

              let remainingToDeduct = quantityToDeduct;
              const batchDeductions = [];

              for (const batch of sortedBatches) {
                if (remainingToDeduct <= 0) break;

                const deductFromBatch = Math.min(
                  remainingToDeduct,
                  batch.quantity
                );
                batch.quantity = parseFloat(
                  (batch.quantity - deductFromBatch).toFixed(2)
                );
                remainingToDeduct = parseFloat(
                  (remainingToDeduct - deductFromBatch).toFixed(2)
                );

                batchDeductions.push({
                  batchId: batch.id,
                  quantity: deductFromBatch,
                  expiryDate: batch.expiryDate,
                  remainingInBatch: batch.quantity,
                });

                // Remove batch if empty
                if (batch.quantity <= 0) {
                  inventoryItem.batches = inventoryItem.batches.filter(
                    (b) => b.id !== batch.id
                  );
                }
              }

              if (remainingToDeduct > 0) {
                warnings.push(
                  `Couldn't fully deduct ${inventoryItem.name} from batches ` +
                    `(remaining: ${remainingToDeduct})`
                );
              }

              // Update current stock to match batches
              inventoryItem.currentStock = inventoryItem.batches.reduce(
                (sum, batch) => sum + batch.quantity,
                0
              );
            }
            // Handle non-expiry items
            else {
              inventoryItem.currentStock = parseFloat(
                (inventoryItem.currentStock - quantityToDeduct).toFixed(2)
              );
            }

            inventoryItem.lastUpdated = new Date().toISOString();

            // Record transaction
            data.inventoryTransactions.unshift({
              id: uuidv4(),
              date: new Date().toISOString(),
              type: "stock-out",
              itemType: "ingredient",
              itemId: ingredient.ingredientId,
              quantity: quantityToDeduct,
              reason: `Order for ${item.name || `item ${item.id}`} (${
                item.quantity
              }x)`,
              recordedBy: "auto-deduction",
              remainingStock: inventoryItem.currentStock,
              ...(inventoryItem.hasExpiry && { batchDeductions }),
            });

            results.push({
              menuItemId: item.id,
              ingredientId: ingredient.ingredientId,
              quantityDeducted: quantityToDeduct,
              success: true,
              ...(inventoryItem.hasExpiry && { batchDeductions }),
            });

            inventoryUpdated = true;
          } catch (ingredientError) {
            warnings.push(
              `Error processing ingredient: ${ingredientError.message}`
            );
          }
        }
      } catch (itemError) {
        warnings.push(
          `Error processing menu item ${item.id}: ${itemError.message}`
        );
      }
    }

    // Save changes if any deductions were made
    if (inventoryUpdated) {
      if (!writeInventoryData(data)) {
        warnings.push("Failed to save inventory updates");
      }
    }
  } catch (error) {
    warnings.push(`Inventory system error: ${error.message}`);
  }

  return { results, warnings };
}

module.exports = {
  tryDeductInventory,
  readInventoryData,
  writeInventoryData,
};
