require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

(async () => {
  const db = await mysql.createConnection({host:process.env.DB_HOST,user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
  const hash = await bcrypt.hash('demo1234', 10);
  for (const [name,email,phone,role] of [
    ['MediLink Administrator','admin@medilink.com','01700000001','admin'],
    ['Green Life Owner','pharmacy@medilink.com','01700000002','pharmacist'],
    ['Demo Customer','customer@medilink.com','01700000003','customer']
  ]) await db.query('INSERT INTO users(full_name,email,phone,password_hash,role) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE full_name=VALUES(full_name),role=VALUES(role)',[name,email,phone,hash,role]);
  const [[owner]] = await db.query("SELECT id FROM users WHERE email='pharmacy@medilink.com'");
  await db.query("INSERT INTO pharmacies(owner_id,name,address,area,phone,approved) VALUES(?,?,?,?,?,1) ON DUPLICATE KEY UPDATE approved=1",[owner.id,'Green Life Pharmacy','House 12, Road 7, Dhanmondi','Dhanmondi','01700000002']);
  const [[pharmacy]] = await db.query("SELECT id FROM pharmacies WHERE owner_id=? LIMIT 1",[owner.id]);
  const meds = [
    ['Napa 500mg','Paracetamol','Pain relief',8.00,120,20,'2028-06-30'],
    ['Seclo 20mg','Omeprazole','Gastric',7.00,8,10,'2027-10-30'],
    ['Insulin Glargine','Insulin','Diabetes',650.00,12,5,'2027-02-28'],
    ['Cefixime 200mg','Cefixime','Antibiotic',35.00,16,10,'2026-09-30']
  ];
  for (const m of meds) await db.query('INSERT INTO medicines(pharmacy_id,brand_name,generic_name,category,unit_price,stock_qty,low_stock_level,expiry_date) SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM medicines WHERE pharmacy_id=? AND brand_name=?)',[pharmacy.id,...m,pharmacy.id,m[0]]);
  console.log('Demo data ready. Accounts: admin@medilink.com, pharmacy@medilink.com, customer@medilink.com — password: demo1234');
  await db.end();
})().catch(err => { console.error(err.message); process.exit(1); });
