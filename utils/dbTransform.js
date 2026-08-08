// ============================================
// Database Utilities - Field Name Transformation
// ============================================

/**
 * Convert snake_case to camelCase
 */
function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert camelCase to snake_case
 */
function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Transform object keys from snake_case to camelCase
 * Also ensures timestamps have 'Z' suffix for proper UTC parsing
 */
function transformToCamelCase(obj) {
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => transformToCamelCase(item));
  }
  
  if (typeof obj === 'object' && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = toCamelCase(key);
      let value = obj[key];
      
      // Fix timestamps - ensure they have 'Z' suffix for UTC
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        if (!value.endsWith('Z') && !value.includes('+') && !value.includes('-', 10)) {
          value = value + 'Z';
        }
      }
      
      result[camelKey] = transformToCamelCase(value);
      return result;
    }, {});
  }
  
  return obj;
}

/**
 * Transform object keys from camelCase to snake_case
 */
function transformToSnakeCase(obj) {
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => transformToSnakeCase(item));
  }
  
  if (typeof obj === 'object' && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      const snakeKey = toSnakeCase(key);
      result[snakeKey] = transformToSnakeCase(obj[key]);
      return result;
    }, {});
  }
  
  return obj;
}

module.exports = {
  toCamelCase,
  toSnakeCase,
  transformToCamelCase,
  transformToSnakeCase
};
