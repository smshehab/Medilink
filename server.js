require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const demoMedicines = require("./demo-medicines");
const app = express();
const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_, file, cb) =>
      cb(
        null,
        `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "")}`,
      ),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});
const isLocalDatabase =
  !process.env.DB_HOST ||
  ["localhost", "127.0.0.1"].includes(process.env.DB_HOST);
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || (isLocalDatabase ? 3306 : 4000)),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "medilink_db",
  ssl:
    !isLocalDatabase && process.env.DB_SSL !== "false"
      ? { rejectUnauthorized: true }
      : undefined,
  waitForConnections: true,
  connectTimeout: 15000,
  connectionLimit: 10,
});
app.use(express.json());
// Keep application code and configuration private. The client assets live next
// to the server in this small project, so serving the entire directory would
// also expose files such as server.js, package.json, and database.sql.
const publicFiles = new Set([
  "index.html",
  "how-it-works.html",
  "styles.css",
  "theme.css",
  "script.js",
]);
app.get(
  "/:file(index.html|how-it-works.html|styles.css|theme.css|script.js)",
  (req, res) => {
    const file = req.params.file;
    if (!publicFiles.has(file)) return res.sendStatus(404);
    res.sendFile(path.join(__dirname, file));
  },
);
app.use(
  "/uploads",
  express.static(uploadDir, { dotfiles: "deny", index: false }),
);
const secret = process.env.JWT_SECRET || "medilink-development-secret";
const searchIntents = [
  {
    category: "Gastric & digestion",
    terms: [
      "gas",
      "gass",
      "gastric",
      "acidity",
      "acid",
      "heartburn",
      "indigestion",
      "bloating",
      "pet",
    ],
  },
  {
    category: "Pain, fever & inflammation",
    terms: [
      "fever",
      "jor",
      "pain",
      "headache",
      "body pain",
      "back pain",
      "backpain",
      "lower back pain",
      "kamar betha",
      "inflammation",
    ],
  },
  {
    category: "Allergy & respiratory",
    terms: [
      "allergy",
      "cough",
      "cold",
      "sordi",
      "asthma",
      "breathing",
      "respiratory",
    ],
  },
  {
    category: "Antibiotic & infection",
    terms: ["infection", "antibiotic", "jhor", "bacterial"],
  },
  {
    category: "Heart, blood pressure & diabetes",
    terms: ["diabetes", "sugar", "blood pressure", "pressure", "heart"],
  },
  {
    category: "Vitamins & supplements",
    terms: ["vitamin", "calcium", "zinc", "iron", "supplement"],
  },
  {
    category: "Skin, eye & ENT care",
    terms: ["skin", "rash", "fungal", "eye", "ear", "nasal"],
  },
];
const normalizeSearch = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const searchWords = (value) =>
  String(value || "")
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
// This makes common Bangladeshi/Roman-English spelling variations comparable:
// "Cergel", "Sergel" and "Sargl" all reduce to the same consonant shape.
const phoneticKey = (value) =>
  normalizeSearch(value)
    .replace(/ph/g, "f")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/([ckq])/g, "k")
    .replace(/z/g, "s")
    .replace(/v/g, "b")
    .replace(/[aeiouy]/g, "");
const editDistance = (first, second) => {
  const matrix = Array.from({ length: second.length + 1 }, (_, index) => [
    index,
  ]);
  for (let index = 0; index <= first.length; index += 1)
    matrix[0][index] = index;
  for (let row = 1; row <= second.length; row += 1) {
    for (let column = 1; column <= first.length; column += 1) {
      matrix[row][column] =
        second[row - 1] === first[column - 1]
          ? matrix[row - 1][column - 1]
          : Math.min(
              matrix[row - 1][column - 1],
              matrix[row][column - 1],
              matrix[row - 1][column],
            ) + 1;
    }
  }
  return matrix[second.length][first.length];
};
const fuzzyScore = (candidate, normalizedQuery) => {
  if (!candidate || !normalizedQuery) return 0;
  if (candidate === normalizedQuery) return 1000;
  if (candidate.startsWith(normalizedQuery)) return 850;
  if (candidate.includes(normalizedQuery)) return 700;

  // A phonetic match is useful for typos such as Cergel/Sargl, but only for
  // sufficiently long searches so that short queries do not become too broad.
  const querySound = phoneticKey(normalizedQuery);
  if (
    normalizedQuery.length >= 4 &&
    querySound.length >= 3 &&
    phoneticKey(candidate) === querySound
  )
    return 650;

  const maxEdits = normalizedQuery.length >= 8 ? 3 : 2;
  if (
    normalizedQuery.length >= 4 &&
    editDistance(candidate, normalizedQuery) <= maxEdits
  )
    return 540;
  const comparablePart = candidate.slice(0, normalizedQuery.length);
  if (
    normalizedQuery.length >= 4 &&
    editDistance(comparablePart, normalizedQuery) <= 2
  )
    return 500;
  return 0;
};
const searchIntentFor = (query) => {
  const normalizedQuery = normalizeSearch(query);
  return searchIntents.find((intent) =>
    intent.terms.some((term) => {
      const normalizedTerm = normalizeSearch(term);
      return (
        normalizedTerm === normalizedQuery ||
        normalizedQuery.includes(normalizedTerm) ||
        normalizedTerm.includes(normalizedQuery) ||
        (normalizedQuery.length >= 4 &&
          phoneticKey(normalizedTerm) === phoneticKey(normalizedQuery))
      );
    }),
  );
};
const medicineSearchScore = (medicine, query) => {
  const normalizedQuery = normalizeSearch(query);
  const intent = searchIntentFor(query);
  const searchableValues = [medicine.brand_name, medicine.generic_name]
    .flatMap((value) => [
      normalizeSearch(value),
      ...searchWords(value).map(normalizeSearch),
    ])
    .filter(Boolean);
  let score = Math.max(
    0,
    ...searchableValues.map((value) => fuzzyScore(value, normalizedQuery)),
  );

  // Matching a therapeutic group/problem returns every in-stock medicine in
  // that group, even when the brand name itself does not contain the query.
  const category = normalizeSearch(medicine.category);
  const categoryScore = fuzzyScore(category, normalizedQuery);
  if (categoryScore) score = Math.max(score, Math.min(600, categoryScore));
  if (intent && medicine.category === intent.category)
    score = Math.max(score, 400);
  return { score, intent };
};
const ensureDemoInventory = async () => {
  try {
    await pool.query(
      "ALTER TABLE reservations ADD COLUMN estimated_ready_at DATETIME NULL",
    );
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") throw error;
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS online_orders (
    id INT AUTO_INCREMENT PRIMARY KEY, customer_id INT NOT NULL, medicine_id INT NOT NULL, pharmacy_id INT NOT NULL, quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL, total_amount DECIMAL(10,2) NOT NULL, delivery_address VARCHAR(255) NOT NULL, delivery_phone VARCHAR(25) NOT NULL,
    payment_method ENUM('cash_on_delivery') NOT NULL DEFAULT 'cash_on_delivery', status ENUM('pending','confirmed','dispatched','delivered','cancelled') DEFAULT 'pending', order_code VARCHAR(12) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES users(id), FOREIGN KEY(medicine_id) REFERENCES medicines(id), FOREIGN KEY(pharmacy_id) REFERENCES pharmacies(id)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL, title VARCHAR(120) NOT NULL, body VARCHAR(255) NOT NULL,
    read_at DATETIME NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS pharmacy_nearest_hospitals (
    id INT AUTO_INCREMENT PRIMARY KEY, pharmacy_id INT NOT NULL, hospital_name VARCHAR(160) NOT NULL,
    distance DECIMAL(10,2) NOT NULL, distance_unit ENUM('meter','km') NOT NULL DEFAULT 'km',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(pharmacy_id) REFERENCES pharmacies(id) ON DELETE CASCADE
  )`);
  try {
    await pool.query(
      "ALTER TABLE online_orders ADD COLUMN delivery_phone VARCHAR(25) NOT NULL",
    );
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") throw error;
  }
  try {
    await pool.query(
      "ALTER TABLE online_orders ADD COLUMN payment_method ENUM('cash_on_delivery') NOT NULL DEFAULT 'cash_on_delivery'",
    );
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") throw error;
  }
  const hash = await bcrypt.hash("demo1234", 10);
  // Demo accounts are created once for the public project preview. Existing
  // accounts keep their password if it is later changed through the database.
  const demoUsers = [
    ["MediLink Administrator", "admin@medilink.com", "01700000001", "admin"],
    ["Green Life Owner", "pharmacy@medilink.com", "01700000002", "pharmacist"],
    ["Demo Customer", "customer@medilink.com", "01700000003", "customer"],
  ];
  for (const [fullName, email, phone, role] of demoUsers) {
    await pool.query(
      "INSERT INTO users(full_name,email,phone,password_hash,role) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE full_name=VALUES(full_name), role=VALUES(role)",
      [fullName, email, phone, hash, role],
    );
  }
  const [[owner]] = await pool.query(
    "SELECT id FROM users WHERE email='pharmacy@medilink.com'",
  );
  await pool.query(
    "INSERT INTO pharmacies(owner_id,name,address,area,phone,approved) VALUES(?,?,?,?,?,1) ON DUPLICATE KEY UPDATE approved=1",
    [
      owner.id,
      "Green Life Pharmacy",
      "House 12, Road 7, Dhanmondi",
      "Dhanmondi",
      "01700000002",
    ],
  );
  const [[pharmacy]] = await pool.query(
    "SELECT id FROM pharmacies WHERE owner_id=? LIMIT 1",
    [owner.id],
  );
  for (const medicine of demoMedicines) {
    await pool.query(
      "INSERT INTO medicines(pharmacy_id,brand_name,generic_name,category,unit_price,stock_qty,low_stock_level,expiry_date) SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM medicines WHERE pharmacy_id=? AND brand_name=?)",
      [
        pharmacy.id,
        medicine.brandName,
        null,
        medicine.category,
        medicine.unitPrice,
        50,
        10,
        medicine.expiryDate,
        pharmacy.id,
        medicine.brandName,
      ],
    );
    await pool.query(
      "UPDATE medicines SET category=? WHERE pharmacy_id=? AND brand_name=?",
      [medicine.category, pharmacy.id, medicine.brandName],
    );
  }
  console.log(`Demo pharmacy ready with ${demoMedicines.length} medicines`);
};
const auth =
  (...roles) =>
  (req, res, next) => {
    try {
      const token = (req.headers.authorization || "").replace("Bearer ", "");
      const user = jwt.verify(token, secret);
      if (roles.length && !roles.includes(user.role))
        return res.status(403).json({ message: "Access denied" });
      req.user = user;
      next();
    } catch {
      res.status(401).json({ message: "Please log in first" });
    }
  };
const pharmacyFor = async (id) =>
  (
    await pool.query("SELECT id FROM pharmacies WHERE owner_id=? LIMIT 1", [id])
  )[0][0];
app.get("/api/health", async (_, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected" });
  } catch (e) {
    console.error("DATABASE_CONNECTION_ERROR", e.code, e.message);
    res.status(503).json({ ok: false, database: "unavailable" });
  }
});
app.post("/api/auth/register", async (req, res) => {
  try {
    const { fullName, email, phone, password, role = "customer" } = req.body;
    if (!fullName || !email || !password)
      return res
        .status(400)
        .json({ message: "Name, email and password are required" });
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      "INSERT INTO users(full_name,email,phone,password_hash,role) VALUES(?,?,?,?,?)",
      [
        fullName,
        email,
        phone || null,
        hash,
        role === "pharmacist" ? "pharmacist" : "customer",
      ],
    );
    res
      .status(201)
      .json({
        message: "Account created. You can log in now.",
        id: r.insertId,
      });
  } catch (e) {
    console.error("REGISTER_ERROR", e.code, e.message);
    res
      .status(e.code === "ER_DUP_ENTRY" ? 400 : 503)
      .json({
        message:
          e.code === "ER_DUP_ENTRY"
            ? "Email already registered"
            : "Database is temporarily unavailable. Please try again shortly.",
      });
  }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE email=? AND active=1",
      [req.body.email],
    );
    const u = rows[0];
    if (!u || !(await bcrypt.compare(req.body.password || "", u.password_hash)))
      return res.status(401).json({ message: "Incorrect email or password" });
    const token = jwt.sign(
      { id: u.id, role: u.role, fullName: u.full_name },
      secret,
      { expiresIn: "7d" },
    );
    res.json({
      token,
      user: { id: u.id, fullName: u.full_name, role: u.role },
    });
  } catch (e) {
    console.error("LOGIN_ERROR", e.code, e.message);
    res
      .status(503)
      .json({
        message:
          "Database is temporarily unavailable. Please try again shortly.",
      });
  }
});
app.get("/api/medicines/search", async (req, res) => {
  try {
    const search = String(req.query.q || "").trim();
    if (!search) return res.json({ matches: [], alternatives: [] });
    const columns =
      "m.id,m.brand_name,m.generic_name,m.category,m.unit_price,m.stock_qty,p.id pharmacy_id,p.name pharmacy,p.address,p.area";
    const [availableMedicines] = await pool.query(
      `SELECT ${columns} FROM medicines m JOIN pharmacies p ON p.id=m.pharmacy_id WHERE p.approved=1 AND m.stock_qty>0`,
    );
    const ranked = availableMedicines
      .map((medicine) => ({
        medicine,
        ...medicineSearchScore(medicine, search),
      }))
      .filter((item) => item.score > 0)
      .sort(
        (first, second) =>
          second.score - first.score ||
          first.medicine.unit_price - second.medicine.unit_price,
      );
    const matches = ranked.slice(0, 16).map((item) => item.medicine);
    const q = `%${search}%`;
    const categories = [
      ...new Set(
        matches
          .map((m) => m.category)
          .filter((category) => category && category !== "General medicine"),
      ),
    ];
    let alternatives = [];
    if (categories.length) {
      const placeholders = categories.map(() => "?").join(",");
      const [rows] = await pool.query(
        `SELECT ${columns} FROM medicines m JOIN pharmacies p ON p.id=m.pharmacy_id WHERE p.approved=1 AND m.stock_qty>0 AND m.category IN (${placeholders}) AND m.brand_name NOT LIKE ? AND (m.generic_name IS NULL OR m.generic_name NOT LIKE ?) ORDER BY m.unit_price ASC, m.stock_qty DESC LIMIT 16`,
        [...categories, q, q],
      );
      alternatives = rows;
    }
    res.json({ matches, alternatives });
  } catch (e) {
    console.error("MEDICINE_SEARCH_ERROR", e.code, e.message);
    res
      .status(503)
      .json({ message: "Medicine database is temporarily unavailable." });
  }
});
app.post("/api/reservations", auth("customer"), async (req, res) => {
  const { medicineId, pharmacyId, quantity } = req.body;
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1)
    return res.status(400).json({ message: "Choose a valid number of strips" });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Locking the pharmacy makes simultaneous requests join one reliable queue.
    const [pharmacy] = await connection.query(
      "SELECT id FROM pharmacies WHERE id=? FOR UPDATE",
      [pharmacyId],
    );
    if (!pharmacy[0]) {
      await connection.rollback();
      return res.status(404).json({ message: "Pharmacy not found" });
    }
    const [stock] = await connection.query(
      "SELECT stock_qty FROM medicines WHERE id=? AND pharmacy_id=? FOR UPDATE",
      [medicineId, pharmacyId],
    );
    if (!stock[0] || stock[0].stock_qty < qty) {
      await connection.rollback();
      return res
        .status(400)
        .json({ message: "Medicine is no longer available in this quantity" });
    }
    const [[queue]] = await connection.query(
      "SELECT MAX(estimated_ready_at) AS latestReadyAt FROM reservations WHERE pharmacy_id=? AND status IN ('pending','confirmed')",
      [pharmacyId],
    );
    const now = new Date();
    const latestReadyAt = queue.latestReadyAt
      ? new Date(queue.latestReadyAt)
      : null;
    const queueStartsAt =
      latestReadyAt && latestReadyAt > now ? latestReadyAt : now;
    const estimatedReadyAt = new Date(
      queueStartsAt.getTime() + qty * 30 * 1000,
    );
    const code = "ML" + Math.random().toString(36).slice(2, 8).toUpperCase();
    await connection.query(
      "INSERT INTO reservations(customer_id,medicine_id,pharmacy_id,quantity,pickup_code,estimated_ready_at) VALUES(?,?,?,?,?,?)",
      [req.user.id, medicineId, pharmacyId, qty, code, estimatedReadyAt],
    );
    await connection.query(
      "UPDATE medicines SET stock_qty=stock_qty-? WHERE id=? AND pharmacy_id=?",
      [qty, medicineId, pharmacyId],
    );
    await connection.commit();
    res
      .status(201)
      .json({
        message: "Reservation created",
        pickupCode: code,
        estimatedReadyAt: estimatedReadyAt.toISOString(),
        estimatedSeconds: Math.ceil((estimatedReadyAt - now) / 1000),
      });
  } catch (error) {
    await connection.rollback();
    console.error("RESERVATION_ERROR", error.code, error.message);
    res
      .status(503)
      .json({ message: "Unable to create reservation. Please try again." });
  } finally {
    connection.release();
  }
});
app.post("/api/online-orders", auth("customer"), async (req, res) => {
  const {
    medicineId,
    pharmacyId,
    quantity,
    deliveryAddress,
    deliveryPhone,
    paymentMethod = "cash_on_delivery",
  } = req.body;
  const qty = Number(quantity);
  if (
    !Number.isInteger(qty) ||
    qty < 1 ||
    !String(deliveryAddress || "").trim() ||
    !String(deliveryPhone || "").trim()
  )
    return res
      .status(400)
      .json({
        message: "Enter a valid quantity, delivery address, and phone number",
      });
  if (paymentMethod !== "cash_on_delivery")
    return res
      .status(400)
      .json({
        message: "Cash on Delivery is currently the available payment method",
      });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[medicine]] = await connection.query(
      "SELECT unit_price,stock_qty FROM medicines WHERE id=? AND pharmacy_id=? FOR UPDATE",
      [medicineId, pharmacyId],
    );
    if (!medicine || medicine.stock_qty < qty) {
      await connection.rollback();
      return res
        .status(400)
        .json({ message: "Medicine is no longer available in this quantity" });
    }
    const orderCode =
      "ON" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const total = Number(medicine.unit_price) * qty;
    await connection.query(
      "UPDATE medicines SET stock_qty=stock_qty-? WHERE id=? AND pharmacy_id=?",
      [qty, medicineId, pharmacyId],
    );
    await connection.query(
      "INSERT INTO online_orders(customer_id,medicine_id,pharmacy_id,quantity,unit_price,total_amount,delivery_address,delivery_phone,payment_method,order_code) VALUES(?,?,?,?,?,?,?,?,?,?)",
      [
        req.user.id,
        medicineId,
        pharmacyId,
        qty,
        medicine.unit_price,
        total,
        String(deliveryAddress).trim(),
        String(deliveryPhone).trim(),
        paymentMethod,
        orderCode,
      ],
    );
    await connection.commit();
    res
      .status(201)
      .json({ message: "Online order placed", orderCode, totalAmount: total });
  } catch (error) {
    await connection.rollback();
    console.error("ONLINE_ORDER_ERROR", error.code, error.message);
    res
      .status(503)
      .json({ message: "Unable to place the online order. Please try again." });
  } finally {
    connection.release();
  }
});
app.get("/api/pharmacy/online-orders", auth("pharmacist"), async (req, res) => {
  const pharmacy = await pharmacyFor(req.user.id);
  if (!pharmacy)
    return res.status(400).json({ message: "Create your pharmacy first" });
  const [orders] = await pool.query(
    `SELECT o.*,m.brand_name,u.full_name customer_name,u.phone customer_phone FROM online_orders o JOIN medicines m ON m.id=o.medicine_id JOIN users u ON u.id=o.customer_id WHERE o.pharmacy_id=? ORDER BY o.created_at DESC`,
    [pharmacy.id],
  );
  res.json(orders);
});
app.patch(
  "/api/pharmacy/online-orders/:id",
  auth("pharmacist"),
  async (req, res) => {
    const status = req.body.status;
    if (!["confirmed", "cancelled"].includes(status))
      return res.status(400).json({ message: "Choose Accept or Reject" });
    const pharmacy = await pharmacyFor(req.user.id);
    if (!pharmacy)
      return res.status(400).json({ message: "Create your pharmacy first" });
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [[order]] = await connection.query(
        "SELECT * FROM online_orders WHERE id=? AND pharmacy_id=? FOR UPDATE",
        [req.params.id, pharmacy.id],
      );
      if (!order || order.status !== "pending") {
        await connection.rollback();
        return res
          .status(400)
          .json({ message: "This order has already been processed" });
      }
      await connection.query("UPDATE online_orders SET status=? WHERE id=?", [
        status,
        order.id,
      ]);
      if (status === "cancelled")
        await connection.query(
          "UPDATE medicines SET stock_qty=stock_qty+? WHERE id=? AND pharmacy_id=?",
          [order.quantity, order.medicine_id, pharmacy.id],
        );
      const title =
        status === "confirmed"
          ? "Online order accepted"
          : "Online order rejected";
      const body =
        status === "confirmed"
          ? `Your order ${order.order_code} has been accepted by the pharmacy.`
          : `Your order ${order.order_code} was rejected. The reserved stock has been returned.`;
      await connection.query(
        "INSERT INTO notifications(user_id,title,body) VALUES(?,?,?)",
        [order.customer_id, title, body],
      );
      await connection.commit();
      res.json({
        message:
          status === "confirmed"
            ? "Order accepted and customer notified"
            : "Order rejected, stock returned, and customer notified",
      });
    } catch (error) {
      await connection.rollback();
      console.error("ONLINE_ORDER_STATUS_ERROR", error.code, error.message);
      res
        .status(503)
        .json({ message: "Unable to update the order. Please try again." });
    } finally {
      connection.release();
    }
  },
);
app.get(
  "/api/pharmacy/customer-requests",
  auth("pharmacist"),
  async (req, res) => {
    const pharmacy = await pharmacyFor(req.user.id);
    if (!pharmacy)
      return res.status(400).json({ message: "Create your pharmacy first" });
    const [[details]] = await pool.query(
      "SELECT area FROM pharmacies WHERE id=?",
      [pharmacy.id],
    );
    const [requests] = await pool.query(
      `SELECT e.*,u.full_name,u.phone FROM emergency_requests e JOIN users u ON u.id=e.customer_id WHERE e.status='open' AND (e.area IS NULL OR e.area='' OR ? IS NULL OR ?='' OR LOWER(e.area)=LOWER(?)) ORDER BY e.created_at DESC`,
      [details.area, details.area, details.area],
    );
    res.json(requests);
  },
);
app.patch(
  "/api/pharmacy/customer-requests/:id/respond",
  auth("pharmacist"),
  async (req, res) => {
    const pharmacy = await pharmacyFor(req.user.id);
    if (!pharmacy)
      return res.status(400).json({ message: "Create your pharmacy first" });
    const [updated] = await pool.query(
      "UPDATE emergency_requests SET status='responded' WHERE id=? AND status='open'",
      [req.params.id],
    );
    if (!updated.affectedRows)
      return res
        .status(404)
        .json({ message: "Request is no longer available" });
    res.json({ message: "Customer request marked as responded" });
  },
);
app.get("/api/pharmacy/sales-report", auth("pharmacist"), async (req, res) => {
  const pharmacy = await pharmacyFor(req.user.id);
  if (!pharmacy)
    return res.status(400).json({ message: "Create your pharmacy first" });
  const [[report]] = await pool.query(
    `SELECT
    (SELECT COALESCE(SUM(total_amount),0) FROM sales WHERE pharmacy_id=?) AS counterSales,
    (SELECT COALESCE(SUM(total_amount),0) FROM online_orders WHERE pharmacy_id=? AND status<>'cancelled') AS onlineSales,
    (SELECT COUNT(*) FROM online_orders WHERE pharmacy_id=? AND status<>'cancelled') AS onlineOrders`,
    [pharmacy.id, pharmacy.id, pharmacy.id],
  );
  res.json({
    ...report,
    totalSales: Number(report.counterSales) + Number(report.onlineSales),
  });
});
app.get("/api/reservations/my", auth("customer"), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.*,m.brand_name,p.name pharmacy FROM reservations r JOIN medicines m ON m.id=r.medicine_id JOIN pharmacies p ON p.id=r.pharmacy_id WHERE r.customer_id=? ORDER BY r.created_at DESC`,
    [req.user.id],
  );
  res.json(rows);
});
app.get("/api/online-orders/my", auth("customer"), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT o.*,m.brand_name,p.name pharmacy FROM online_orders o JOIN medicines m ON m.id=o.medicine_id JOIN pharmacies p ON p.id=o.pharmacy_id WHERE o.customer_id=? ORDER BY o.created_at DESC`,
    [req.user.id],
  );
  res.json(rows);
});
app.get("/api/notifications/my", auth("customer"), async (req, res) => {
  const [rows] = await pool.query(
    "SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC",
    [req.user.id],
  );
  res.json(rows);
});
app.post("/api/emergency-requests", auth("customer"), async (req, res) => {
  const { medicineName, message, area } = req.body;
  await pool.query(
    "INSERT INTO emergency_requests(customer_id,medicine_name,message,area) VALUES(?,?,?,?)",
    [req.user.id, medicineName, message || null, area || null],
  );
  res
    .status(201)
    .json({ message: "Emergency request sent to nearby partner pharmacies" });
});
app.post(
  "/api/prescriptions",
  auth("customer"),
  upload.single("prescription"),
  async (req, res) => {
    if (!req.file)
      return res.status(400).json({ message: "Please choose a file" });
    await pool.query(
      "INSERT INTO prescriptions(customer_id,file_path,note) VALUES(?,?,?)",
      [req.user.id, `/uploads/${req.file.filename}`, req.body.note || null],
    );
    res.status(201).json({ message: "Prescription uploaded for verification" });
  },
);
app.post("/api/pharmacies", auth("pharmacist"), async (req, res) => {
  const { name, address, area, phone, nearestHospitals = [] } = req.body;
  if (!name || !address)
    return res
      .status(400)
      .json({ message: "Pharmacy name and address are required" });
  const hospitals = Array.isArray(nearestHospitals) ? nearestHospitals : [];
  const cleanedHospitals = hospitals
    .map((h) => ({
      hospitalName: String(h.hospitalName || "").trim(),
      distance: Number(h.distance),
      distanceUnit: h.distanceUnit === "meter" ? "meter" : "km",
    }))
    .filter((h) => h.hospitalName || Number.isFinite(h.distance));
  if (
    cleanedHospitals.some(
      (h) => !h.hospitalName || !Number.isFinite(h.distance) || h.distance < 0,
    )
  )
    return res
      .status(400)
      .json({
        message:
          "Please enter a hospital name and a valid distance for every nearest hospital",
      });
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [result] = await connection.query(
      "INSERT INTO pharmacies(owner_id,name,address,area,phone) VALUES(?,?,?,?,?)",
      [req.user.id, name, address, area || null, phone || null],
    );
    for (const hospital of cleanedHospitals)
      await connection.query(
        "INSERT INTO pharmacy_nearest_hospitals(pharmacy_id,hospital_name,distance,distance_unit) VALUES(?,?,?,?)",
        [
          result.insertId,
          hospital.hospitalName,
          hospital.distance,
          hospital.distanceUnit,
        ],
      );
    await connection.commit();
    res.status(201).json({ message: "Pharmacy submitted for admin approval" });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});
app.get("/api/pharmacy/profile", auth("pharmacist"), async (req, res) => {
  const [[pharmacy]] = await pool.query(
    "SELECT id,name,address,area,phone,approved FROM pharmacies WHERE owner_id=? LIMIT 1",
    [req.user.id],
  );
  if (!pharmacy) return res.json({ pharmacy: null, hospitals: [] });
  const [hospitals] = await pool.query(
    "SELECT hospital_name,distance,distance_unit FROM pharmacy_nearest_hospitals WHERE pharmacy_id=? ORDER BY distance ASC",
    [pharmacy.id],
  );
  res.json({ pharmacy, hospitals });
});
app.get("/api/pharmacy/dashboard", auth("pharmacist"), async (req, res) => {
  const p = await pharmacyFor(req.user.id);
  if (!p) return res.json({ needsPharmacy: true });
  const [[summary]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM medicines WHERE pharmacy_id=?) medicines,(SELECT COUNT(*) FROM medicines WHERE pharmacy_id=? AND stock_qty<=low_stock_level) lowStock,(SELECT COUNT(*) FROM medicines WHERE pharmacy_id=? AND expiry_date<=DATE_ADD(CURDATE(),INTERVAL 30 DAY)) expiring,(SELECT COALESCE(SUM(total_amount),0) FROM sales WHERE pharmacy_id=? AND DATE(sold_at)=CURDATE()) salesToday`,
    [p.id, p.id, p.id, p.id],
  );
  const [items] = await pool.query(
    "SELECT * FROM medicines WHERE pharmacy_id=? ORDER BY expiry_date ASC",
    [p.id],
  );
  const [reservations] = await pool.query(
    `SELECT r.*,u.full_name,m.brand_name FROM reservations r JOIN users u ON u.id=r.customer_id JOIN medicines m ON m.id=r.medicine_id WHERE r.pharmacy_id=? AND r.status='pending'`,
    [p.id],
  );
  res.json({ pharmacyId: p.id, summary, items, reservations });
});
app.post("/api/medicines", auth("pharmacist"), async (req, res) => {
  const p = await pharmacyFor(req.user.id);
  if (!p)
    return res.status(400).json({ message: "Create your pharmacy first" });
  const {
    brandName,
    genericName,
    category,
    unitPrice,
    stockQty,
    lowStockLevel,
    expiryDate,
    supplierId,
  } = req.body;
  await pool.query(
    "INSERT INTO medicines(pharmacy_id,supplier_id,brand_name,generic_name,category,unit_price,stock_qty,low_stock_level,expiry_date) VALUES(?,?,?,?,?,?,?,?,?)",
    [
      p.id,
      supplierId || null,
      brandName,
      genericName || null,
      category || null,
      unitPrice,
      stockQty,
      lowStockLevel || 10,
      expiryDate || null,
    ],
  );
  res.status(201).json({ message: "Medicine added to inventory" });
});
app.post("/api/sales", auth("pharmacist"), async (req, res) => {
  const p = await pharmacyFor(req.user.id);
  const { medicineId, quantity } = req.body;
  const [[m]] = await pool.query(
    "SELECT unit_price,stock_qty FROM medicines WHERE id=? AND pharmacy_id=?",
    [medicineId, p.id],
  );
  if (!m || m.stock_qty < quantity)
    return res.status(400).json({ message: "Insufficient stock" });
  await pool.query("UPDATE medicines SET stock_qty=stock_qty-? WHERE id=?", [
    quantity,
    medicineId,
  ]);
  await pool.query(
    "INSERT INTO sales(pharmacy_id,medicine_id,quantity,total_amount) VALUES(?,?,?,?)",
    [p.id, medicineId, quantity, m.unit_price * quantity],
  );
  res.json({ message: "Sale recorded" });
});
app.get("/api/admin/overview", auth("admin"), async (req, res) => {
  const [[data]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM users) users,(SELECT COUNT(*) FROM pharmacies WHERE approved=1) pharmacies,(SELECT COUNT(*) FROM medicines) medicines,(SELECT COUNT(*) FROM emergency_requests WHERE status='open') emergencies`,
  );
  const [pending] = await pool.query(
    "SELECT p.*,u.full_name owner,u.email owner_email,u.phone owner_phone FROM pharmacies p LEFT JOIN users u ON u.id=p.owner_id WHERE p.approved=0 ORDER BY p.created_at DESC",
  );
  res.json({ data, pending });
});
app.get("/api/admin/details/:type", auth("admin"), async (req, res) => {
  const queries = {
    users:
      "SELECT full_name,email,phone,role,active,created_at FROM users ORDER BY created_at DESC",
    pharmacies:
      "SELECT p.name,p.address,p.area,p.phone,u.full_name owner,p.created_at FROM pharmacies p LEFT JOIN users u ON u.id=p.owner_id WHERE p.approved=1 ORDER BY p.created_at DESC",
    medicines:
      "SELECT m.brand_name,m.generic_name,m.category,m.unit_price,m.stock_qty,p.name pharmacy FROM medicines m JOIN pharmacies p ON p.id=m.pharmacy_id ORDER BY m.brand_name ASC",
    emergencies: `SELECT e.medicine_name,e.area,e.message,e.created_at,u.full_name customer,u.phone FROM emergency_requests e JOIN users u ON u.id=e.customer_id WHERE e.status='open' ORDER BY e.created_at DESC`,
  };
  const query = queries[req.params.type];
  if (!query) return res.status(400).json({ message: "Unknown detail type" });
  const [rows] = await pool.query(query);
  res.json(rows);
});
app.post("/api/admin/users", auth("admin"), async (req, res) => {
  try {
    const { fullName, email, phone, password } = req.body;
    if (!fullName || !email || !password || String(password).length < 6)
      return res
        .status(400)
        .json({
          message:
            "Name, email, and a password of at least 6 characters are required",
        });
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO users(full_name,email,phone,password_hash,role) VALUES(?,?,?,?,?)",
      [
        String(fullName).trim(),
        String(email).trim().toLowerCase(),
        phone ? String(phone).trim() : null,
        hash,
        "admin",
      ],
    );
    res
      .status(201)
      .json({
        message: "Admin account created",
        fullName: String(fullName).trim(),
      });
  } catch (error) {
    res
      .status(error.code === "ER_DUP_ENTRY" ? 400 : 503)
      .json({
        message:
          error.code === "ER_DUP_ENTRY"
            ? "An account already exists with this email"
            : "Unable to create the admin account. Please try again.",
      });
  }
});
app.patch(
  "/api/admin/pharmacies/:id/approve",
  auth("admin"),
  async (req, res) => {
    await pool.query("UPDATE pharmacies SET approved=1 WHERE id=?", [
      req.params.id,
    ]);
    res.json({ message: "Pharmacy approved" });
  },
);
app.all("/api/*", (_, res) =>
  res.status(404).json({ message: "API endpoint not found" }),
);
app.get("*", (_, res) => res.sendFile(path.join(__dirname, "index.html")));
app.listen(process.env.PORT || 3000, "0.0.0.0", () =>
  console.log(
    `MediLink running at http://localhost:${process.env.PORT || 3000}`,
  ),
);
ensureDemoInventory().catch((error) =>
  console.error("DEMO_INVENTORY_ERROR", error.code, error.message),
);
