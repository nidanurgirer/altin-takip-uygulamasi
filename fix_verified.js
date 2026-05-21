const { initializeDatabase, dbRun } = require('./db/database.js');
(async () => {
  await initializeDatabase();
  dbRun('UPDATE users SET is_verified = 1');
  console.log('Tüm kullanýcýlar doðrulandý olarak iþaretlendi.');
})();
