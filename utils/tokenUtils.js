const fs = require("fs");
const path = require("path");

const TOKEN_FILE = path.join(__dirname, "../data/token-counter.json");

// Initialize token counter
const initializeTokenCounter = () => {
  if (!fs.existsSync(TOKEN_FILE)) {
    fs.writeFileSync(
      TOKEN_FILE,
      JSON.stringify({
        nextToken: 1,
        lastResetDate: new Date().toISOString().split("T")[0], // Store current date (YYYY-MM-DD)
      })
    );
  }
};

// Check if we need to reset the counter (new day)
const shouldResetCounter = (tokenData) => {
  const today = new Date().toISOString().split("T")[0];
  return tokenData.lastResetDate !== today;
};

// Get next token number
const getNextToken = () => {
  try {
    const tokenData = JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
    const today = new Date().toISOString().split("T")[0];

    // Reset counter if it's a new day
    if (shouldResetCounter(tokenData)) {
      tokenData.nextToken = 1;
      tokenData.lastResetDate = today;
    }

    const currentToken = tokenData.nextToken;
    tokenData.nextToken = currentToken + 1;
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData));
    return currentToken;
  } catch (error) {
    console.error("Token error:", error);
    // Fallback - use timestamp if file operations fail
    return Date.now().toString().slice(-6);
  }
};

module.exports = {
  initializeTokenCounter,
  getNextToken,
};
