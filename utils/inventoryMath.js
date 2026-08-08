module.exports.calculateCost = (quantity, costPerUnit) => {
  return parseFloat((quantity * costPerUnit).toFixed(2));
};
