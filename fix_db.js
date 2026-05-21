const fs = require('fs');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');

async function fixUser() {
  const SQL = await initSqlJs();
  const dbData = fs.readFileSync('./data/gold_tracker.db');
  const db = new SQL.Database(dbData);
  
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('123456', salt);
  
  // Nidanur hesabını bul, şifresini 123456 yap ve onayla
  db.run("UPDATE users SET password_hash = ?, is_verified = 1 WHERE email = 'devonnescrybabe@gmail.com'", [passwordHash]);
  
  // Testuser hesabını da 123456 yap ve onayla
  db.run("UPDATE users SET password_hash = ?, is_verified = 1 WHERE username = 'testuser'", [passwordHash]);
  
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync('./data/gold_tracker.db', buffer);
  console.log("Kullanıcılar başarıyla güncellendi.");
}

fixUser();
