// utils/manageUsers.js
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const readline = require("readline");

const USERS_PATH = path.join(__dirname, "../data/users.json");

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Load users from file
const loadUsers = () => {
  if (!fs.existsSync(USERS_PATH)) return [];
  return JSON.parse(fs.readFileSync(USERS_PATH, "utf8"));
};

// Save users to file
const saveUsers = (users) => {
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
};

// Ask question and return Promise
const ask = (question) =>
  new Promise((resolve) => rl.question(question, resolve));

// CLI menu
const mainMenu = async () => {
  console.log("\n📋 USER MANAGEMENT CLI");
  console.log("1. Add user");
  console.log("2. Change password");
  console.log("3. List users");
  console.log("4. Exit");

  const choice = await ask("\nChoose an option: ");
  switch (choice.trim()) {
    case "1":
      await addUser();
      break;
    case "2":
      await changePassword();
      break;
    case "3":
      listUsers();
      break;
    case "4":
      rl.close();
      process.exit(0);
    default:
      console.log("Invalid choice.\n");
  }

  mainMenu(); // loop again
};

// Add user
const addUser = async () => {
  const username = await ask("Enter username: ");
  const password = await ask("Enter password: ");
  const role = await ask("Enter role (e.g., manager/admin): ");

  const users = loadUsers();
  if (users.some((u) => u.username === username)) {
    console.log("❌ User already exists.\n");
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  users.push({ username, passwordHash, role });
  saveUsers(users);

  console.log("✅ User added successfully.\n");
};

// Change password
const changePassword = async () => {
  const username = await ask("Enter username: ");
  const users = loadUsers();
  const user = users.find((u) => u.username === username);

  if (!user) {
    console.log("❌ User not found.\n");
    return;
  }

  const newPassword = await ask("Enter new password: ");
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  saveUsers(users);

  console.log("🔐 Password updated.\n");
};

// List users (excluding passwords)
const listUsers = () => {
  const users = loadUsers();
  console.log("\n👤 Users:");
  users.forEach((u, i) => {
    console.log(`${i + 1}. ${u.username} [${u.role}]`);
  });
  console.log();
};

// Start CLI
mainMenu();
