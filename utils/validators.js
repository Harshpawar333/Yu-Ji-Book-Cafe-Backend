const Joi = require("joi");

const itemSchemas = {
  ingredients: Joi.object({
    name: Joi.string().required(),
    categoryId: Joi.string().required(),
    unitId: Joi.string().required(),
    costPerUnit: Joi.number().min(0).required(),
    minStock: Joi.number().min(0).required(),
    currentStock: Joi.number().min(0).default(0),
  }),

  readyMadeItems: Joi.object({
    name: Joi.string().required(),
    costPerUnit: Joi.number().min(0).required(),
    minStock: Joi.number().min(0).required(),
    currentStock: Joi.number().min(0).default(0),
  }),

  suppliers: Joi.object({
    name: Joi.string().required(),
    contact: Joi.string().required(),
    address: Joi.string().optional(),
  }),
};

const validateItem = (data, collection) => {
  const schema = itemSchemas[collection];
  if (!schema)
    return { error: { details: [{ message: "Invalid collection" }] } };
  return schema.validate(data);
};

const validateStockAdjustment = Joi.object({
  itemType: Joi.string().valid("ingredient", "readyMadeItem").required(),
  itemId: Joi.string().required(),
  quantityChange: Joi.number().required(),
  reason: Joi.string().required(),
  recordedBy: Joi.string().required(),
});

module.exports = {
  validateItem,
  validateStockAdjustment,
};
