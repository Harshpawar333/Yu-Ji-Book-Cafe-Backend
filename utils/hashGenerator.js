// utils/hashGenerator.js
const bcrypt = require("bcrypt");

const users = [
  { username: "manager", password: "manager123", role: "manager" },
  { username: "admin", password: "admin123", role: "admin" },
];

users.forEach(async (user) => {
  const hash = await bcrypt.hash(user.password, 10);
  console.log({
    username: user.username,
    passwordHash: hash,
    role: user.role,
  });
});
