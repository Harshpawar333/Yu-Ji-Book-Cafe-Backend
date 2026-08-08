const { calculateCost } = require("./inventoryMath");

module.exports.generateReports = (type, inventoryData, params = {}) => {
  switch (type) {
    case "valuation":
      return generateValuationReport(inventoryData);
    case "usage":
      return generateUsageReport(inventoryData, params);
    case "waste":
      return generateWasteAnalysis(inventoryData, params);
    default:
      throw new Error("Invalid report type");
  }
};

function generateValuationReport(data) {
  const report = {
    generatedAt: new Date().toISOString(),
    type: "valuation",
    summary: {
      totalValue: 0,
      categoryBreakdown: {},
      itemCount: 0,
    },
    details: [],
  };

  // Process ingredients
  data.ingredients.forEach((item) => {
    const category =
      data.categories.find((c) => c.id === item.categoryId)?.name ||
      "Uncategorized";
    const unit = data.units.find((u) => u.id === item.unitId)?.symbol || "";
    const value = item.currentStock * (item.costPerUnit || 0);

    report.summary.totalValue += value;
    report.summary.itemCount++;

    if (!report.summary.categoryBreakdown[category]) {
      report.summary.categoryBreakdown[category] = {
        value: 0,
        count: 0,
      };
    }
    report.summary.categoryBreakdown[category].value += value;
    report.summary.categoryBreakdown[category].count++;

    report.details.push({
      id: item.id,
      name: item.name,
      category,
      currentStock: item.currentStock,
      unit,
      costPerUnit: item.costPerUnit,
      totalValue: value,
    });
  });

  // Process ready-made items
  data.readyMadeItems.forEach((item) => {
    const value = item.currentStock * (item.costPerUnit || 0);
    report.summary.totalValue += value;
    report.summary.itemCount++;

    const category = "Ready-Made Items";
    if (!report.summary.categoryBreakdown[category]) {
      report.summary.categoryBreakdown[category] = {
        value: 0,
        count: 0,
      };
    }
    report.summary.categoryBreakdown[category].value += value;
    report.summary.categoryBreakdown[category].count++;

    report.details.push({
      id: item.id,
      name: item.name,
      category,
      currentStock: item.currentStock,
      unit: "units",
      costPerUnit: item.costPerUnit,
      totalValue: value,
    });
  });

  // Format numbers
  report.summary.totalValue = parseFloat(report.summary.totalValue.toFixed(2));
  Object.keys(report.summary.categoryBreakdown).forEach((category) => {
    report.summary.categoryBreakdown[category].value = parseFloat(
      report.summary.categoryBreakdown[category].value.toFixed(2)
    );
  });

  return report;
}

function generateUsageReport(data, { startDate, endDate } = {}) {
  const report = {
    generatedAt: new Date().toISOString(),
    type: "usage",
    period: { startDate, endDate },
    summary: {
      totalUsage: 0,
      totalCost: 0,
      mostUsedItems: [],
    },
    dailyUsage: {},
  };

  // Filter transactions by date range
  let transactions = data.inventoryTransactions.filter(
    (tx) => tx.type === "stock-out" || tx.type === "waste"
  );

  if (startDate) {
    transactions = transactions.filter(
      (tx) => new Date(tx.date) >= new Date(startDate)
    );
  }
  if (endDate) {
    transactions = transactions.filter(
      (tx) => new Date(tx.date) <= new Date(endDate)
    );
  }

  // Group by date and item
  const usageMap = {};
  transactions.forEach((tx) => {
    const date = tx.date.split("T")[0]; // Extract just the date part
    if (!usageMap[date]) {
      usageMap[date] = {};
    }

    const itemKey = `${tx.itemType}-${tx.itemId}`;
    if (!usageMap[date][itemKey]) {
      usageMap[date][itemKey] = {
        quantity: 0,
        cost: 0,
      };
    }

    usageMap[date][itemKey].quantity += tx.quantity;
    usageMap[date][itemKey].cost += Math.abs(tx.costImpact);
  });

  // Process into report format
  Object.keys(usageMap).forEach((date) => {
    report.dailyUsage[date] = {
      items: [],
      totalQuantity: 0,
      totalCost: 0,
    };

    Object.keys(usageMap[date]).forEach((itemKey) => {
      const [itemType, itemId] = itemKey.split("-");
      const item =
        itemType === "ingredient"
          ? data.ingredients.find((i) => i.id === itemId)
          : data.readyMadeItems.find((i) => i.id === itemId);

      if (item) {
        const usage = usageMap[date][itemKey];
        report.dailyUsage[date].items.push({
          id: itemId,
          name: item.name,
          type: itemType,
          quantity: usage.quantity,
          cost: parseFloat(usage.cost.toFixed(2)),
        });

        report.dailyUsage[date].totalQuantity += usage.quantity;
        report.dailyUsage[date].totalCost += usage.cost;
        report.summary.totalUsage += usage.quantity;
        report.summary.totalCost += usage.cost;
      }
    });

    report.dailyUsage[date].totalCost = parseFloat(
      report.dailyUsage[date].totalCost.toFixed(2)
    );
  });

  // Calculate most used items
  const itemUsage = {};
  transactions.forEach((tx) => {
    const itemKey = `${tx.itemType}-${tx.itemId}`;
    if (!itemUsage[itemKey]) {
      itemUsage[itemKey] = {
        quantity: 0,
        cost: 0,
        type: tx.itemType,
        id: tx.itemId,
      };
    }
    itemUsage[itemKey].quantity += tx.quantity;
    itemUsage[itemKey].cost += Math.abs(tx.costImpact);
  });

  report.summary.mostUsedItems = Object.values(itemUsage)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5)
    .map((usage) => {
      const item =
        usage.type === "ingredient"
          ? data.ingredients.find((i) => i.id === usage.id)
          : data.readyMadeItems.find((i) => i.id === usage.id);
      return {
        id: usage.id,
        name: item?.name || "Unknown",
        type: usage.type,
        quantity: usage.quantity,
        cost: parseFloat(usage.cost.toFixed(2)),
      };
    });

  report.summary.totalCost = parseFloat(report.summary.totalCost.toFixed(2));

  return report;
}

function generateWasteAnalysis(data, { startDate, endDate } = {}) {
  const report = {
    generatedAt: new Date().toISOString(),
    type: "waste",
    period: { startDate, endDate },
    summary: {
      totalWaste: 0,
      totalCost: 0,
      wasteByReason: {},
      mostWastedItems: [],
    },
    details: [],
  };

  // Filter waste records by date range
  let wasteRecords = data.wasteRecords;
  if (startDate) {
    wasteRecords = wasteRecords.filter(
      (w) => new Date(w.date) >= new Date(startDate)
    );
  }
  if (endDate) {
    wasteRecords = wasteRecords.filter(
      (w) => new Date(w.date) <= new Date(endDate)
    );
  }

  // Process waste records
  wasteRecords.forEach((waste) => {
    const item =
      waste.itemType === "ingredient"
        ? data.ingredients.find((i) => i.id === waste.itemId)
        : data.readyMadeItems.find((i) => i.id === waste.itemId);

    report.summary.totalWaste += waste.quantity;
    report.summary.totalCost += waste.cost;

    if (!report.summary.wasteByReason[waste.reason]) {
      report.summary.wasteByReason[waste.reason] = {
        count: 0,
        quantity: 0,
        cost: 0,
      };
    }
    report.summary.wasteByReason[waste.reason].count++;
    report.summary.wasteByReason[waste.reason].quantity += waste.quantity;
    report.summary.wasteByReason[waste.reason].cost += waste.cost;

    report.details.push({
      date: waste.date,
      itemId: waste.itemId,
      itemName: item?.name || "Unknown",
      itemType: waste.itemType,
      quantity: waste.quantity,
      cost: waste.cost,
      reason: waste.reason,
      recordedBy: waste.recordedBy,
    });
  });

  // Calculate most wasted items
  const itemWaste = {};
  wasteRecords.forEach((waste) => {
    const itemKey = `${waste.itemType}-${waste.itemId}`;
    if (!itemWaste[itemKey]) {
      itemWaste[itemKey] = {
        quantity: 0,
        cost: 0,
        type: waste.itemType,
        id: waste.itemId,
      };
    }
    itemWaste[itemKey].quantity += waste.quantity;
    itemWaste[itemKey].cost += waste.cost;
  });

  report.summary.mostWastedItems = Object.values(itemWaste)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5)
    .map((waste) => {
      const item =
        waste.type === "ingredient"
          ? data.ingredients.find((i) => i.id === waste.id)
          : data.readyMadeItems.find((i) => i.id === waste.id);
      return {
        id: waste.id,
        name: item?.name || "Unknown",
        type: waste.type,
        quantity: waste.quantity,
        cost: parseFloat(waste.cost.toFixed(2)),
      };
    });

  // Format numbers
  report.summary.totalCost = parseFloat(report.summary.totalCost.toFixed(2));
  Object.keys(report.summary.wasteByReason).forEach((reason) => {
    report.summary.wasteByReason[reason].cost = parseFloat(
      report.summary.wasteByReason[reason].cost.toFixed(2)
    );
  });

  return report;
}
