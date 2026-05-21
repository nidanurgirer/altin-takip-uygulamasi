require('dotenv').config();
const { dbAll } = require('./db/database');

async function main() {
  try {
    const users = await dbAll('SELECT id, username, email, is_verified, pending_email FROM users', []);
    console.log("USERS IN DB:");
    console.table(users);
  } catch (err) {
    console.error("Error reading users:", err);
  }
  process.exit(0);
}

main();
