let session = JSON.parse(localStorage.getItem("medilinkSession") || "null");
// The API is served by Node.js, so a double-clicked file must switch to the
// local web server instead of requesting file:///api/... paths.
if (window.location.protocol === "file:") {
  window.location.replace(`http://127.0.0.1:3000/${window.location.hash}`);
}
const api = async (url, options = {}) => {
  const headers =
    options.body instanceof FormData
      ? {}
      : { "Content-Type": "application/json" };
  if (session?.token) headers.Authorization = `Bearer ${session.token}`;
  let r;
  try {
    r = await fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers },
    });
  } catch {
    throw new Error(
      "Server is temporarily unreachable. Please try again in a minute.",
    );
  }
  const raw = await r.text();
  let d = {};
  try {
    d = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(
      `Server is temporarily unavailable (HTTP ${r.status}). Please try again shortly.`,
    );
  }
  if (!r.ok) throw new Error(d.message || `Request failed (HTTP ${r.status})`);
  return d;
};
const message = (text) => `<p class="form-message">${text}</p>`;
const formatPickupTime = (value) =>
  value
    ? new Intl.DateTimeFormat("en-BD", {
        timeZone: "Asia/Dhaka",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(value))
    : "Calculating…";
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("medilinkTheme", theme);
  const toggle = document.querySelector("#themeToggle");
  if (toggle) {
    const dark = theme === "dark";
    toggle.innerHTML = dark ? "&#9728;" : "&#9790;";
    toggle.setAttribute(
      "aria-label",
      dark ? "Switch to light theme" : "Switch to dark theme",
    );
    toggle.title = dark ? "Switch to light theme" : "Switch to dark theme";
  }
}
function toggleTheme() {
  applyTheme(
    document.documentElement.dataset.theme === "dark" ? "light" : "dark",
  );
}
function closeModal() {
  document.querySelector("#modal").classList.remove("show");
  document.querySelector(".modal-box")?.classList.remove("admin-details-modal");
}
function openModal(content) {
  document.querySelector("#modalContent").innerHTML = content;
  document.querySelector("#modal").classList.add("show");
}
function openAuth(role = "customer") {
  openModal(
    `<p class="eyebrow">WELCOME TO MEDILINK</p><h2>${role === "admin" ? "Admin " : ""}Account</h2><div class="tabs"><button onclick="authView('login','${role}')">Log in</button>${role === "admin" ? "" : `<button onclick="authView('register','${role}')">Create account</button>`}</div><div id="authForm"></div>`,
  );
  authView("login", role);
}
function authView(kind, role) {
  const box = document.querySelector("#authForm");
  if (kind === "login")
    box.innerHTML = `<form onsubmit="login(event)"><input name="email" type="email" placeholder="Email address" required><input name="password" type="password" placeholder="Password" required><button class="primary-btn">Log in</button><p class="hint">Use a ${role} account to access its portal.</p></form>`;
  else
    box.innerHTML = `<form onsubmit="register(event)"><input name="fullName" placeholder="Full name" required><input name="email" type="email" placeholder="Email address" required><input name="phone" placeholder="Phone number"><input name="password" type="password" placeholder="Password (min. 6 chars)" minlength="6" required><select name="role"><option value="customer" ${role === "customer" ? "selected" : ""}>Customer</option><option value="pharmacist" ${role === "pharmacist" ? "selected" : ""}>Pharmacist</option></select><button class="primary-btn">Create account</button></form>`;
}
async function register(e) {
  e.preventDefault();
  try {
    const x = Object.fromEntries(new FormData(e.target));
    const d = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(x),
    });
    e.target.insertAdjacentHTML("afterend", message(d.message));
  } catch (err) {
    alert(err.message);
  }
}
async function login(e) {
  e.preventDefault();
  try {
    session = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
    });
    localStorage.setItem("medilinkSession", JSON.stringify(session));
    closeModal();
    updateNav();
    updatePharmacistHero();
    openPortal();
  } catch (err) {
    alert(err.message);
  }
}
function logout() {
  localStorage.removeItem("medilinkSession");
  session = null;
  document.querySelector("#appPanel").classList.add("hidden");
  document.querySelector("main").classList.remove("hidden");
  updateNav();
  updatePharmacistHero();
}
async function updatePharmacistHero() {
  const action = document.querySelector(".hero-copy .primary-btn");
  const copy = document.querySelector(".hero-copy");
  if (!action || !copy) return;
  copy.querySelector("#heroPharmacyInfo")?.remove();
  action.href = "#search";
  action.onclick = null;
  action.innerHTML = "Find medicine <span>→</span>";
  if (session?.user.role !== "pharmacist") return;
  try {
    const data = await api("/api/pharmacy/profile");
    const pharmacy = data.pharmacy;
    if (!pharmacy) {
      action.href = "#";
      action.onclick = (e) => {
        e.preventDefault();
        openPortal();
      };
      action.innerHTML = "Add pharmacy <span>→</span>";
      return;
    }
    const info = document.createElement("div");
    info.id = "heroPharmacyInfo";
    if (!pharmacy.approved) {
      info.innerHTML =
        '<p class="hero-pharmacy-pending">Your pharmacy is waiting for admin approval.</p>';
      action.innerHTML = "View pharmacy status <span>→</span>";
    } else {
      const hospitalText = data.hospitals.length
        ? data.hospitals
            .map(
              (h) =>
                `${h.hospital_name} · ${h.distance} ${h.distance_unit === "meter" ? "Meter" : "KM"}`,
            )
            .join("<br>")
        : "No nearest hospital added";
      info.innerHTML = `<article class="hero-pharmacy-profile"><p>YOUR APPROVED PHARMACY</p><h3>${pharmacy.name}</h3><span>${pharmacy.address}${pharmacy.area ? `, ${pharmacy.area}` : ""}</span>${pharmacy.phone ? `<span>${pharmacy.phone}</span>` : ""}<small><b>Nearest hospital</b><br>${hospitalText}</small></article>`;
      action.innerHTML = "Manage pharmacy <span>→</span>";
    }
    copy.insertBefore(info, action);
    action.href = "#";
    action.onclick = (e) => {
      e.preventDefault();
      openPortal();
    };
  } catch (error) {
    console.warn("Unable to load pharmacy profile", error);
  }
}
function updateNav() {
  document.querySelector("#navAccount").innerHTML = session
    ? `<button class="user-btn" onclick="openPortal()">${session.user.fullName}</button>`
    : `<button class="outline-btn" onclick="openAuth()">Log in</button>`;
  const menu = document.querySelector("#pharmacistNavMenu");
  if (!menu) return;
  if (session?.user.role === "customer") {
    menu.innerHTML = `<div class="header-pharmacy-menu"><button class="header-menu-trigger" onclick="toggleHeaderCustomerMenu(event)" aria-label="Customer menu">&#9776;</button><div class="header-menu-items" id="headerCustomerMenuItems"><button onclick="openHeaderCustomerView('dashboard')">My dashboard</button><button onclick="openHeaderCustomerView('search')">Search medicine</button><button onclick="openHeaderCustomerView('emergency')">Emergency request</button><button onclick="openHeaderCustomerView('prescription')">Upload prescription</button><button onclick="logout()">Log out</button></div></div>`;
    return;
  }
  if (session?.user.role === "pharmacist") {
    menu.innerHTML = `<div class="header-pharmacy-menu"><button class="header-menu-trigger" onclick="toggleHeaderPharmacyMenu(event)" aria-label="Pharmacy menu">&#9776;</button><div class="header-menu-items" id="headerPharmacyMenuItems"><button onclick="openPharmacyMenuView('dashboard')">Dashboard</button><button onclick="addMedicineFromHeader()">Add medicine</button><button onclick="openPharmacyMenuView('orders')">Online orders</button><button onclick="openPharmacyMenuView('sales')">Total sales report</button><button onclick="logout()">Log out</button></div></div>`;
    return;
  }
  if (session?.user.role === "admin") {
    menu.innerHTML = `<div class="header-pharmacy-menu"><button class="header-menu-trigger" onclick="toggleHeaderAdminMenu(event)" aria-label="Admin menu">&#9776;</button><div class="header-menu-items" id="headerAdminMenuItems"><button onclick="openHeaderAdminView('dashboard')">Dashboard</button><button onclick="openHeaderAdminView('requests')">Requests</button><button onclick="openHeaderAdminView('users')">Users</button><button onclick="openHeaderAdminView('pharmacies')">Approved pharmacies</button><button onclick="openHeaderAdminView('medicines')">Medicine records</button><button onclick="openHeaderAdminView('emergencies')">Open emergencies</button><button onclick="logout()">Log out</button></div></div>`;
    return;
  }
  menu.innerHTML = "";
}
document.querySelector("#searchForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = medicineInput.value;
  results.innerHTML = '<p class="empty">Searching...</p>';
  try {
    const rows = await api(`/api/medicines/search?q=${encodeURIComponent(q)}`);
    results.innerHTML = rows.length
      ? rows
          .map(
            (x) =>
              `<article class="result-item"><div class="result-info"><b>${x.brand_name}</b><p>${x.generic_name || "Medicine"} · ${x.pharmacy}, ${x.area || x.address}</p><small>৳ ${x.unit_price} · ${x.stock_qty} in stock</small></div><button class="primary-btn" onclick='reserve(${JSON.stringify(x)})'>Reserve</button></article>`,
          )
          .join("")
      : '<p class="empty">No approved pharmacy currently has this medicine. You can send an emergency request.</p>';
  } catch (err) {
    results.innerHTML = `<p class="empty">Database unavailable: ${err.message}</p>`;
  }
});
document.querySelectorAll(".quick-search button").forEach(
  (b) =>
    (b.onclick = () => {
      medicineInput.value = b.textContent;
      document.querySelector("#searchForm").requestSubmit();
    }),
);
function reserve(x) {
  if (!session) {
    openAuth("customer");
    return;
  }
  if (session.user.role !== "customer") {
    alert("Please use a customer account to reserve medicine.");
    return;
  }
  openModal(
    `<p class="eyebrow">ADVANCE RESERVATION</p><h2>${x.brand_name}</h2><p>${x.pharmacy}</p><form onsubmit='submitReservation(event,${x.id},${x.pharmacy_id})'><input name="quantity" type="number" min="1" max="${x.stock_qty}" value="1" required><button class="primary-btn">Confirm reservation</button></form>`,
  );
}
function orderOnline(x) {
  if (!session) {
    openAuth("customer");
    return;
  }
  if (session.user.role !== "customer") {
    alert("Please use a customer account to order medicine.");
    return;
  }
  openModal(
    `<p class="eyebrow">ONLINE ORDER</p><h2>${x.brand_name}</h2><p>${x.pharmacy} · ৳ ${x.unit_price} per strip</p><form onsubmit='submitOnlineOrder(event,${x.id},${x.pharmacy_id})'><input name="quantity" type="number" min="1" max="${x.stock_qty}" value="1" required><textarea name="deliveryAddress" placeholder="Delivery address" required></textarea><input name="deliveryPhone" type="tel" inputmode="tel" placeholder="Phone number" required><select name="paymentMethod" required><option value="cash_on_delivery">Cash on Delivery</option></select><button class="primary-btn">Place online order</button></form>`,
  );
}
async function submitReservation(e, medicineId, pharmacyId) {
  e.preventDefault();
  try {
    const d = await api("/api/reservations", {
      method: "POST",
      body: JSON.stringify({
        medicineId,
        pharmacyId,
        quantity: e.target.quantity.value,
      }),
    });
    const minutes = Math.ceil(d.estimatedSeconds / 60);
    e.target.insertAdjacentHTML(
      "afterend",
      message(
        `${d.message}. Pickup code: ${d.pickupCode}<br>Ready at <b>${formatPickupTime(d.estimatedReadyAt)}</b> (in about ${minutes} minute${minutes === 1 ? "" : "s"}).`,
      ),
    );
  } catch (err) {
    alert(err.message);
  }
}
async function submitOnlineOrder(e, medicineId, pharmacyId) {
  e.preventDefault();
  try {
    const d = await api("/api/online-orders", {
      method: "POST",
      body: JSON.stringify({
        medicineId,
        pharmacyId,
        quantity: e.target.quantity.value,
        deliveryAddress: e.target.deliveryAddress.value,
        deliveryPhone: e.target.deliveryPhone.value,
        paymentMethod: e.target.paymentMethod.value,
      }),
    });
    document.querySelector("#modalContent").innerHTML =
      `<p class="eyebrow">ORDER CONFIRMED</p><h2>Online order placed</h2><p class="order-confirmation"><b>Online order placed. Order code:</b> <strong>${d.orderCode}</strong><br><b>Total:</b> <strong>৳ ${d.totalAmount}</strong><br><b>Payment:</b> <strong>Cash on Delivery</strong></p><button class="primary-btn" onclick="closeModal()">Done</button>`;
  } catch (err) {
    alert(err.message);
  }
}
function openEmergency() {
  if (!session) {
    openAuth("customer");
    return;
  }
  openModal(
    `<p class="eyebrow">EMERGENCY REQUEST</p><h2>Need medicine urgently?</h2><form onsubmit="sendEmergency(event)"><input name="medicineName" placeholder="Medicine name" required><input name="area" placeholder="Your area"><textarea name="message" placeholder="Optional note"></textarea><button class="primary-btn">Send request</button></form>`,
  );
}
async function sendEmergency(e) {
  e.preventDefault();
  try {
    const d = await api("/api/emergency-requests", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
    });
    e.target.insertAdjacentHTML("afterend", message(d.message));
  } catch (err) {
    alert(err.message);
  }
}
async function openPortal() {
  if (!session) return;
  document.querySelector("main").classList.add("hidden");
  const panel = document.querySelector("#appPanel");
  panel.classList.remove("hidden");
  panel.innerHTML = '<p class="empty">Loading your workspace...</p>';
  try {
    if (session.user.role === "customer") return customerPortal(panel);
    if (session.user.role === "pharmacist") return pharmacistPortal(panel);
    return adminPortal(panel);
  } catch (err) {
    panel.innerHTML = `<div class="dashboard"><h2>Unable to load portal</h2><p>${err.message}</p></div>`;
  }
}
async function customerPortal(panel) {
  const r = await api("/api/reservations/my");
  panel.innerHTML = `<div class="dashboard"><p class="eyebrow">CUSTOMER PORTAL</p><h2>Hello, ${session.user.fullName}</h2><div class="portal-actions"><button class="primary-btn" onclick="document.querySelector('#search').scrollIntoView();document.querySelector('main').classList.remove('hidden');document.querySelector('#appPanel').classList.add('hidden')">Search medicine</button><button class="outline-btn" onclick="openEmergency()">Emergency request</button><button class="outline-btn" onclick="uploadPrescription()">Upload prescription</button></div><h3>My reservations</h3>${r.length ? `<div class="table-wrap"><table><thead><tr><th>Medicine</th><th>Pharmacy</th><th>Quantity</th><th>Ready at</th><th>Pickup code</th><th>Status</th></tr></thead><tbody>${r.map((x) => `<tr><td>${x.brand_name}</td><td>${x.pharmacy}</td><td>${x.quantity}</td><td><b>${formatPickupTime(x.estimated_ready_at)}</b><br><small>Bangladesh time</small></td><td><b>${x.pickup_code}</b></td><td>${x.status}</td></tr>`).join("")}</tbody></table></div>` : '<p class="empty">No reservations yet.</p>'}</div>`;
}
function uploadPrescription() {
  openModal(
    `<p class="eyebrow">PRESCRIPTION</p><h2>Upload prescription</h2><form onsubmit="sendPrescription(event)" enctype="multipart/form-data"><input type="file" name="prescription" accept="image/*,.pdf" required><textarea name="note" placeholder="Optional note for pharmacist"></textarea><button class="primary-btn">Upload securely</button></form>`,
  );
}
async function sendPrescription(e) {
  e.preventDefault();
  try {
    const d = await api("/api/prescriptions", {
      method: "POST",
      body: new FormData(e.target),
    });
    e.target.insertAdjacentHTML("afterend", message(d.message));
  } catch (err) {
    alert(err.message);
  }
}
async function pharmacistPortal(panel) {
  const d = await api("/api/pharmacy/dashboard");
  if (d.needsPharmacy) {
    panel.innerHTML = `<div class="dashboard"><p class="eyebrow">PHARMACIST PORTAL</p><h2>Add your pharmacy</h2><form class="inline-form" onsubmit="createPharmacy(event)"><input name="name" placeholder="Pharmacy name" required><input name="address" placeholder="Full address" required><input name="area" placeholder="Area"><input name="phone" placeholder="Phone"><button class="primary-btn">Submit for approval</button></form></div>`;
    return;
  }
  const s = d.summary;
  panel.innerHTML = `<div class="dashboard"><p class="eyebrow">PHARMACY PORTAL</p><h2>Inventory dashboard</h2><div class="stats"><div><span>Today's sales</span><b>৳ ${s.salesToday}</b></div><div><span>Medicines</span><b>${s.medicines}</b></div><div><span>Low stock</span><b class="warning">${s.lowStock}</b></div><div><span>Expiring in 30 days</span><b class="danger">${s.expiring}</b></div></div><div class="portal-actions"><button class="primary-btn" onclick="addMedicine()">+ Add medicine</button></div><h3>Inventory & alerts</h3><div class="table-wrap"><table><thead><tr><th>Medicine</th><th>Stock</th><th>Price</th><th>Expiry</th><th>Alert</th></tr></thead><tbody>${d.items.map((x) => `<tr><td><b>${x.brand_name}</b><br><small>${x.generic_name || ""}</small></td><td>${x.stock_qty}</td><td>৳ ${x.unit_price}</td><td>${x.expiry_date || "-"}</td><td>${x.stock_qty <= x.low_stock_level ? "Low stock" : ""}</td></tr>`).join("")}</tbody></table></div><h3>Pending reservations</h3>${d.reservations.length ? d.reservations.map((x) => `<p class="notice"><b>${x.brand_name}</b> × ${x.quantity} — ${x.full_name} — code: ${x.pickup_code}</p>`).join("") : '<p class="empty">No pending reservations.</p>'}</div>`;
}
function nearestHospitalRow() {
  return `<div class="nearest-hospital-row"><input name="hospitalName" placeholder="Nearest hospital name" required><input name="hospitalDistance" type="number" min="0" step="0.01" placeholder="Distance" required><select name="hospitalDistanceUnit" aria-label="Distance unit"><option value="km">KM</option><option value="meter">Meter</option></select><button class="remove-hospital-btn" type="button" onclick="removeNearestHospital(this)" aria-label="Remove hospital">×</button></div>`;
}
function addNearestHospital() {
  document
    .querySelector("#nearestHospitals")
    ?.insertAdjacentHTML("beforeend", nearestHospitalRow());
}
function removeNearestHospital(button) {
  const list = document.querySelector("#nearestHospitals");
  if (list?.children.length > 1)
    button.closest(".nearest-hospital-row").remove();
  else {
    const row = button.closest(".nearest-hospital-row");
    row.querySelectorAll("input").forEach((input) => (input.value = ""));
    row.querySelector("select").value = "km";
  }
}
function pharmacyForm() {
  return `<form class="inline-form pharmacy-onboarding-form" onsubmit="createPharmacy(event)"><input name="name" placeholder="Pharmacy name" required><input name="address" placeholder="Full address" required><input name="area" placeholder="Area"><input name="phone" placeholder="Phone"><div class="nearest-hospitals-field"><div class="nearest-hospitals-heading"><div><b>Nearest hospital</b><small>Add each nearby hospital and its distance from this pharmacy.</small></div><button class="outline-btn add-hospital-btn" type="button" onclick="addNearestHospital()">+ Add hospital</button></div><div id="nearestHospitals">${nearestHospitalRow()}</div></div><button class="primary-btn">Submit for approval</button></form>`;
}
function showSuccessPopup(title, description) {
  document.querySelector("#appSuccessPopup")?.remove();
  const popup = document.createElement("div");
  popup.id = "appSuccessPopup";
  popup.className = "app-success-popup";
  popup.setAttribute("role", "status");
  popup.innerHTML = `<div class="success-icon">✓</div><div><b>${title}</b><p>${description}</p></div><button type="button" aria-label="Close" onclick="this.closest('.app-success-popup').remove()">×</button>`;
  document.body.appendChild(popup);
  window.setTimeout(() => popup.remove(), 5000);
}
async function createPharmacy(e) {
  e.preventDefault();
  const form = e.target;
  const names = [...form.querySelectorAll('[name="hospitalName"]')];
  const distances = [...form.querySelectorAll('[name="hospitalDistance"]')];
  const units = [...form.querySelectorAll('[name="hospitalDistanceUnit"]')];
  const nearestHospitals = names.map((input, index) => ({
    hospitalName: input.value.trim(),
    distance: distances[index].value,
    distanceUnit: units[index].value,
  }));
  const fields = Object.fromEntries(new FormData(form));
  delete fields.hospitalName;
  delete fields.hospitalDistance;
  delete fields.hospitalDistanceUnit;
  fields.nearestHospitals = nearestHospitals;
  try {
    const d = await api("/api/pharmacies", {
      method: "POST",
      body: JSON.stringify(fields),
    });
    showSuccessPopup("Pharmacy submitted", d.message);
    form.reset();
    updatePharmacistHero();
  } catch (err) {
    alert(err.message);
  }
}
function addMedicine() {
  openModal(
    `<p class="eyebrow">INVENTORY</p><h2>Add medicine</h2><form onsubmit="saveMedicine(event)"><input name="brandName" placeholder="Brand name" required><input name="genericName" placeholder="Generic name"><input name="category" placeholder="Category"><input name="unitPrice" type="number" step="0.01" placeholder="Unit price" required><input name="stockQty" type="number" placeholder="Current stock" required><input name="lowStockLevel" type="number" value="10" placeholder="Low stock alert level"><input name="expiryDate" type="date"><button class="primary-btn">Save medicine</button></form>`,
  );
}
async function saveMedicine(e) {
  e.preventDefault();
  try {
    const d = await api("/api/medicines", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
    });
    closeModal();
    alert(d.message);
    openPortal();
  } catch (err) {
    alert(err.message);
  }
}
async function adminPortal(panel) {
  const d = await api("/api/admin/overview");
  panel.innerHTML = `<div class="dashboard"><div class="pharmacy-title">${adminMenu()}<div><p class="eyebrow">ADMIN PORTAL</p><h2>Platform overview</h2></div></div><div class="stats"><div><span>Users</span><b>${d.data.users}</b><button class="primary-btn view-details-btn" onclick="showAdminDetails('users')">View details</button></div><div><span>Approved pharmacies</span><b>${d.data.pharmacies}</b><button class="primary-btn view-details-btn" onclick="showAdminDetails('pharmacies')">View details</button></div><div><span>Medicine records</span><b>${d.data.medicines}</b><button class="primary-btn view-details-btn" onclick="showAdminDetails('medicines')">View details</button></div><div><span>Open emergencies</span><b class="danger">${d.data.emergencies}</b><button class="primary-btn view-details-btn" onclick="showAdminDetails('emergencies')">View details</button></div></div><h3>Pharmacy onboarding</h3>${d.pending.length ? d.pending.map((x) => `<p class="notice"><b>${x.name}</b> — ${x.address} <button class="primary-btn small" onclick="approve(${x.id})">Approve</button></p>`).join("") : '<p class="empty">No pharmacies waiting for approval.</p>'}</div>`;
}
async function showAdminDetails(type) {
  const titles = {
    users: "Users",
    pharmacies: "Approved pharmacies",
    medicines: "Medicine records",
    emergencies: "Open emergencies",
  };
  const headings = {
    users: ["Name", "Email", "Phone", "Role", "Joined"],
    pharmacies: ["Pharmacy", "Owner", "Phone", "Address", "Added"],
    medicines: ["Medicine", "Generic / category", "Pharmacy", "Price", "Stock"],
    emergencies: ["Medicine", "Customer", "Phone", "Area", "Message"],
  };
  try {
    const rows = await api(`/api/admin/details/${type}`);
    const values = {
      users: (x) => [
        x.full_name,
        x.email,
        x.phone || "-",
        x.role,
        x.created_at,
      ],
      pharmacies: (x) => [
        x.name,
        x.owner || "-",
        x.phone || "-",
        [x.address, x.area].filter(Boolean).join(", "),
        x.created_at,
      ],
      medicines: (x) => [
        x.brand_name,
        [x.generic_name, x.category].filter(Boolean).join(" · ") || "-",
        x.pharmacy,
        `BDT ${x.unit_price}`,
        x.stock_qty,
      ],
      emergencies: (x) => [
        x.medicine_name,
        x.customer,
        x.phone || "-",
        x.area || "-",
        x.message || "-",
      ],
    };
    document.querySelector(".modal-box")?.classList.add("admin-details-modal");
    openModal(
      `<p class="eyebrow">ADMIN DETAILS</p><h2>${titles[type]}</h2>${
        rows.length
          ? `<div class="table-wrap admin-detail-table"><table><thead><tr>${headings[type].map((x) => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows
              .map(
                (x) =>
                  `<tr>${values[type](x)
                    .map((value) => `<td>${value || "-"}</td>`)
                    .join("")}</tr>`,
              )
              .join("")}</tbody></table></div>`
          : '<p class="empty">No records found.</p>'
      }<button class="primary-btn" onclick="closeModal()">Done</button>`,
    );
  } catch (err) {
    alert(err.message);
  }
}
async function approve(id) {
  try {
    await api(`/api/admin/pharmacies/${id}/approve`, { method: "PATCH" });
    openPortal();
  } catch (err) {
    alert(err.message);
  }
}
applyTheme(localStorage.getItem("medilinkTheme") || "light");
updateNav();
let pharmacyDashboardData = null;
const pharmacyMenu = () =>
  `<div class="pharmacy-menu"><button class="menu-trigger" onclick="togglePharmacyMenu(event)" aria-label="Pharmacy menu">&#9776;</button><div class="menu-items" id="pharmacyMenuItems"><button onclick="addMedicine()">Add medicine</button><button onclick="showPharmacyView('orders')">Online orders</button><button onclick="showPharmacyView('sales')">Total sales report</button></div></div>`;
function togglePharmacyMenu(event) {
  event.stopPropagation();
  document.querySelector("#pharmacyMenuItems")?.classList.toggle("show");
}
const adminMenu = () =>
  `<div class="pharmacy-menu"><button class="menu-trigger" onclick="toggleAdminMenu(event)" aria-label="Admin menu">&#9776;</button><div class="menu-items" id="adminMenuItems"><button onclick="openAdminMenuView('dashboard')">Dashboard</button><button onclick="openAdminMenuView('new-admin')">Add new admin</button><button onclick="openAdminMenuView('requests')">Requests</button><button onclick="openAdminMenuView('users')">Users</button><button onclick="openAdminMenuView('pharmacies')">Approved pharmacies</button><button onclick="openAdminMenuView('medicines')">Medicine records</button><button onclick="openAdminMenuView('emergencies')">Open emergencies</button></div></div>`;
function toggleAdminMenu(event) {
  event.stopPropagation();
  document.querySelector("#adminMenuItems")?.classList.toggle("show");
}
async function openAdminMenuView(view) {
  document.querySelector("#adminMenuItems")?.classList.remove("show");
  if (view === "dashboard")
    return adminPortal(document.querySelector("#appPanel"));
  if (view === "new-admin") return addAdminAccount();
  if (view === "requests") return showPharmacistRequests();
  return showAdminDetails(view);
}
function addAdminAccount() {
  openModal(
    `<p class="eyebrow">ADMIN ACCESS</p><h2>Add new admin</h2><p>Only existing administrators can create another admin account.</p><form onsubmit="createAdminAccount(event)"><input name="fullName" placeholder="Full name" required><input name="email" type="email" placeholder="Email address" required><input name="phone" placeholder="Phone number"><input name="password" type="password" placeholder="Password (min. 6 chars)" minlength="6" required><button class="primary-btn">Create admin account</button></form>`,
  );
}
async function createAdminAccount(e) {
  e.preventDefault();
  try {
    const d = await api("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
    });
    document.querySelector("#modalContent").innerHTML =
      `<p class="eyebrow">ADMIN ACCESS</p><h2>Admin account created</h2><p class="order-confirmation"><strong>${d.fullName}</strong> can now log in and access the full admin portal.</p><button class="primary-btn" onclick="closeModal()">Done</button>`;
  } catch (err) {
    alert(err.message);
  }
}
async function showPharmacistRequests() {
  try {
    const d = await api("/api/admin/overview");
    const requests = d.pending || [];
    openModal(
      `<p class="eyebrow">NEW PHARMACY REQUESTS</p><h2>Pending requests</h2>${requests.length ? `<div class="request-list">${requests.map((x) => `<article class="request-card"><div><b>${x.name}</b><p><strong>Owner:</strong> ${x.owner || "Pharmacist"}</p><small><strong>Email:</strong> ${x.owner_email || "-"}<br><strong>Phone:</strong> ${x.owner_phone || x.phone || "-"}<br><strong>Pharmacy address:</strong> ${[x.address, x.area].filter(Boolean).join(", ") || "-"}</small></div><button class="primary-btn small-action" onclick="approvePharmacistRequest(${x.id})">Approve</button></article>`).join("")}</div>` : '<p class="empty">No new pharmacy requests.</p>'}<button class="outline-btn" onclick="closeModal()">Close</button>`,
    );
  } catch (err) {
    alert(err.message);
  }
}
async function approvePharmacistRequest(id) {
  try {
    await api(`/api/admin/pharmacies/${id}/approve`, { method: "PATCH" });
    closeModal();
    openPortal();
  } catch (err) {
    alert(err.message);
  }
}
function toggleHeaderPharmacyMenu(event) {
  event.stopPropagation();
  document.querySelector("#headerPharmacyMenuItems")?.classList.toggle("show");
}
function toggleHeaderCustomerMenu(event) {
  event.stopPropagation();
  document.querySelector("#headerCustomerMenuItems")?.classList.toggle("show");
}
function openHeaderCustomerView(view) {
  document.querySelector("#headerCustomerMenuItems")?.classList.remove("show");
  if (view === "dashboard") return openPortal();
  if (view === "search") {
    document.querySelector("main").classList.remove("hidden");
    document.querySelector("#appPanel").classList.add("hidden");
    return document.querySelector("#search").scrollIntoView();
  }
  if (view === "emergency") return openEmergency();
  return uploadPrescription();
}
function toggleHeaderAdminMenu(event) {
  event.stopPropagation();
  document.querySelector("#headerAdminMenuItems")?.classList.toggle("show");
}
async function openHeaderAdminView(view) {
  document.querySelector("#headerAdminMenuItems")?.classList.remove("show");
  document.querySelector("main").classList.add("hidden");
  const panel = document.querySelector("#appPanel");
  panel.classList.remove("hidden");
  await openAdminMenuView(view);
}
function goHome() {
  document.querySelector("main").classList.remove("hidden");
  document.querySelector("#appPanel").classList.add("hidden");
  updatePharmacistHero();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function toggleHeaderRoleMenu(event) {
  event.stopPropagation();
  document.querySelector("#headerRoleMenuItems")?.classList.toggle("show");
}
function updateNav() {
  document.querySelector("#navAccount").innerHTML = session
    ? `<button class="user-btn" onclick="openPortal()">${session.user.fullName}</button>`
    : `<button class="outline-btn" onclick="openAuth()">Log in</button>`;
  const menu = document.querySelector("#pharmacistNavMenu");
  if (!menu) return;
  let items = "";
  if (session?.user.role === "customer")
    items = `<button onclick="goHome()">Home</button><button onclick="openHeaderCustomerView('dashboard')">My dashboard</button><button onclick="openHeaderCustomerView('search')">Search medicine</button><button onclick="openHeaderCustomerView('emergency')">Emergency request</button><button onclick="openHeaderCustomerView('prescription')">Upload prescription</button><button onclick="logout()">Log out</button>`;
  if (session?.user.role === "pharmacist")
    items = `<button onclick="goHome()">Home</button><button onclick="openPharmacyMenuView('dashboard')">Dashboard</button><button onclick="addMedicineFromHeader()">Add medicine</button><button onclick="openPharmacyMenuView('orders')">Online orders</button><button onclick="openPharmacyMenuView('sales')">Total sales report</button><button onclick="logout()">Log out</button>`;
  if (session?.user.role === "admin")
    items = `<button onclick="goHome()">Home</button><button onclick="openHeaderAdminView('dashboard')">Dashboard</button><button onclick="openHeaderAdminView('new-admin')">Add new admin</button><button onclick="openHeaderAdminView('requests')">Requests</button><button onclick="openHeaderAdminView('users')">Users</button><button onclick="openHeaderAdminView('pharmacies')">Approved pharmacies</button><button onclick="openHeaderAdminView('medicines')">Medicine records</button><button onclick="openHeaderAdminView('emergencies')">Open emergencies</button><button onclick="logout()">Log out</button>`;
  menu.innerHTML = items
    ? `<div class="header-pharmacy-menu"><button class="header-menu-trigger" onclick="toggleHeaderRoleMenu(event)" aria-label="Account menu">&#9776;</button><div class="header-menu-items" id="headerRoleMenuItems">${items}</div></div>`
    : "";
}
function updateNav() {
  document.querySelector("#navAccount").innerHTML = session
    ? `<button class="user-btn" onclick="openPortal()">${session.user.fullName}</button>`
    : `<button class="outline-btn" onclick="openAuth()">Log in</button>`;
  const menu = document.querySelector("#pharmacistNavMenu");
  if (!menu) return;
  if (session?.user.role === "customer") {
    menu.innerHTML = `<div class="header-pharmacy-menu"><button class="header-menu-trigger" onclick="toggleHeaderCustomerMenu(event)" aria-label="Customer menu">&#9776;</button><div class="header-menu-items" id="headerCustomerMenuItems"><button onclick="openHeaderCustomerView('dashboard')">My dashboard</button><button onclick="openHeaderCustomerView('search')">Search medicine</button><button onclick="openHeaderCustomerView('emergency')">Emergency request</button><button onclick="openHeaderCustomerView('prescription')">Upload prescription</button><button onclick="logout()">Log out</button></div></div>`;
    return;
  }
  if (session?.user.role === "pharmacist") {
    menu.innerHTML = `<div class="header-pharmacy-menu"><button class="header-menu-trigger" onclick="toggleHeaderPharmacyMenu(event)" aria-label="Pharmacy menu">&#9776;</button><div class="header-menu-items" id="headerPharmacyMenuItems"><button onclick="openPharmacyMenuView('dashboard')">Dashboard</button><button onclick="addMedicineFromHeader()">Add medicine</button><button onclick="openPharmacyMenuView('orders')">Online orders</button><button onclick="openPharmacyMenuView('sales')">Total sales report</button><button onclick="logout()">Log out</button></div></div>`;
    return;
  }
  if (session?.user.role === "admin") {
    menu.innerHTML = `<div class="header-pharmacy-menu"><button class="header-menu-trigger" onclick="toggleHeaderAdminMenu(event)" aria-label="Admin menu">&#9776;</button><div class="header-menu-items" id="headerAdminMenuItems"><button onclick="openHeaderAdminView('dashboard')">Dashboard</button><button onclick="openHeaderAdminView('new-admin')">Add new admin</button><button onclick="openHeaderAdminView('requests')">Requests</button><button onclick="openHeaderAdminView('users')">Users</button><button onclick="openHeaderAdminView('pharmacies')">Approved pharmacies</button><button onclick="openHeaderAdminView('medicines')">Medicine records</button><button onclick="openHeaderAdminView('emergencies')">Open emergencies</button><button onclick="logout()">Log out</button></div></div>`;
    return;
  }
  menu.innerHTML = "";
}
updateNav = function () {
  document.querySelector("#navAccount").innerHTML = session
    ? `<button class="user-btn" onclick="openPortal()">${session.user.fullName}</button>`
    : `<button class="outline-btn" onclick="openAuth()">Log in</button>`;
  const menu = document.querySelector("#pharmacistNavMenu");
  if (!menu) return;
  let items = "";
  if (session?.user.role === "customer")
    items = `<button onclick="goHome()">Home</button><button onclick="openHeaderCustomerView('dashboard')">My dashboard</button><button onclick="openHeaderCustomerView('search')">Search medicine</button><button onclick="openHeaderCustomerView('emergency')">Emergency request</button><button onclick="openHeaderCustomerView('prescription')">Upload prescription</button><button onclick="logout()">Log out</button>`;
  if (session?.user.role === "pharmacist")
    items = `<button onclick="goHome()">Home</button><button onclick="openPharmacyMenuView('dashboard')">Dashboard</button><button onclick="addMedicineFromHeader()">Add medicine</button><button onclick="openPharmacyMenuView('orders')">Online orders</button><button onclick="openPharmacyMenuView('sales')">Total sales report</button><button onclick="logout()">Log out</button>`;
  if (session?.user.role === "admin")
    items = `<button onclick="goHome()">Home</button><button onclick="openHeaderAdminView('dashboard')">Dashboard</button><button onclick="openHeaderAdminView('new-admin')">Add new admin</button><button onclick="openHeaderAdminView('requests')">Requests</button><button onclick="openHeaderAdminView('users')">Users</button><button onclick="openHeaderAdminView('pharmacies')">Approved pharmacies</button><button onclick="openHeaderAdminView('medicines')">Medicine records</button><button onclick="openHeaderAdminView('emergencies')">Open emergencies</button><button onclick="logout()">Log out</button>`;
  menu.innerHTML = items
    ? `<div class="header-pharmacy-menu"><button class="header-menu-trigger" onclick="toggleHeaderRoleMenu(event)" aria-label="Account menu">&#9776;</button><div class="header-menu-items" id="headerRoleMenuItems">${items}</div></div>`
    : "";
};
updateNav();
async function openPharmacyMenuView(view) {
  document.querySelector("main").classList.add("hidden");
  const panel = document.querySelector("#appPanel");
  panel.classList.remove("hidden");
  await showPharmacyView(view);
}
async function addMedicineFromHeader() {
  await openPharmacyMenuView("dashboard");
  addMedicine();
}
function pharmacyPage(title, body) {
  document.querySelector("#appPanel").innerHTML =
    `<div class="dashboard"><div class="pharmacy-title">${pharmacyMenu()}<div><p class="eyebrow">PHARMACY PORTAL</p><h2>${title}</h2></div></div>${body}</div>`;
}
function renderPharmacyDashboard(data, requests) {
  pharmacyDashboardData = data;
  const s = data.summary;
  const requestList = requests.length
    ? requests
        .map(
          (x) =>
            `<article class="request-card"><div><b>${x.medicine_name}</b><p>${x.full_name}${x.phone ? ` · ${x.phone}` : ""}${x.area ? ` · ${x.area}` : ""}</p>${x.message ? `<small>${x.message}</small>` : ""}</div><button class="outline-btn small-action" onclick="respondToCustomerRequest(${x.id})">Responded</button></article>`,
        )
        .join("")
    : '<p class="empty">No customer requests waiting.</p>';
  pharmacyPage(
    "Inventory dashboard",
    `<div class="stats"><div><span>Today's sales</span><b>BDT ${s.salesToday}</b></div><div><span>Medicines</span><b>${s.medicines}</b></div><div><span>Low stock</span><b class="warning">${s.lowStock}</b></div><div><span>Expiring in 30 days</span><b class="danger">${s.expiring}</b></div></div><h3>Customer requests</h3><div class="request-list">${requestList}</div><h3>Inventory & alerts</h3><div class="table-wrap"><table><thead><tr><th>Medicine</th><th>Stock</th><th>Price</th><th>Expiry</th><th>Alert</th></tr></thead><tbody>${data.items.map((x) => `<tr><td><b>${x.brand_name}</b><br><small>${x.generic_name || ""}</small></td><td>${x.stock_qty}</td><td>BDT ${x.unit_price}</td><td>${x.expiry_date || "-"}</td><td>${x.stock_qty <= x.low_stock_level ? "Low stock" : ""}</td></tr>`).join("")}</tbody></table></div><h3>Pending reservations</h3>${data.reservations.length ? data.reservations.map((x) => `<p class="notice"><b>${x.brand_name}</b> x ${x.quantity} - ${x.full_name} - code: ${x.pickup_code}</p>`).join("") : '<p class="empty">No pending reservations.</p>'}`,
  );
}
async function pharmacistPortal(panel) {
  const [data, requests] = await Promise.all([
    api("/api/pharmacy/dashboard"),
    api("/api/pharmacy/customer-requests").catch(() => []),
  ]);
  if (data.needsPharmacy) {
    panel.innerHTML = `<div class="dashboard"><p class="eyebrow">PHARMACIST PORTAL</p><h2>Add your pharmacy</h2>${pharmacyForm()}</div>`;
    return;
  }
  renderPharmacyDashboard(data, requests);
}
async function showPharmacyView(view) {
  const panel = document.querySelector("#appPanel");
  panel.innerHTML = '<p class="empty">Loading pharmacy data...</p>';
  try {
    if (view === "dashboard") {
      return pharmacistPortal(panel);
    }
    if (view === "orders") {
      const orders = await api("/api/pharmacy/online-orders");
      const rows = orders.length
        ? orders
            .map(
              (x) =>
                `<tr><td><b>${x.order_code}</b><br><small>${x.created_at}</small></td><td>${x.brand_name} x ${x.quantity}</td><td>${x.customer_name}<br><small>${x.delivery_phone}</small></td><td>${x.delivery_address}</td><td>BDT ${x.total_amount}<br><small>${x.status}</small></td></tr>`,
            )
            .join("")
        : '<tr><td colspan="5">No online orders yet.</td></tr>';
      return pharmacyPage(
        "Online orders",
        `<button class="outline-btn small-action" onclick="showPharmacyView('dashboard')">Back to dashboard</button><div class="table-wrap"><table><thead><tr><th>Order</th><th>Medicine</th><th>Customer</th><th>Delivery</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table></div>`,
      );
    }
    const report = await api("/api/pharmacy/sales-report");
    return pharmacyPage(
      "Total sales report",
      `<button class="outline-btn small-action" onclick="showPharmacyView('dashboard')">Back to dashboard</button><div class="stats sales-report"><div><span>Counter sales</span><b>BDT ${report.counterSales}</b></div><div><span>Online sales</span><b>BDT ${report.onlineSales}</b></div><div><span>Online orders</span><b>${report.onlineOrders}</b></div><div><span>Total sales</span><b class="up">BDT ${report.totalSales}</b></div></div>`,
    );
  } catch (err) {
    panel.innerHTML = `<div class="dashboard"><h2>Unable to load pharmacy data</h2><p>${err.message}</p></div>`;
  }
}
async function respondToCustomerRequest(id) {
  try {
    const d = await api(`/api/pharmacy/customer-requests/${id}/respond`, {
      method: "PATCH",
    });
    alert(d.message);
    showPharmacyView("dashboard");
  } catch (err) {
    alert(err.message);
  }
}
async function updateOnlineOrder(id, status) {
  const accepted = status === "confirmed";
  const label = accepted ? "Order accepted" : "Order denied";
  try {
    await api(`/api/pharmacy/online-orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await showPharmacyView("orders");
    openModal(
      `<p class="eyebrow">ORDER UPDATE</p><h2>${label}</h2><p class="order-confirmation">${accepted ? "The order has been accepted." : "The order has been denied."}<br><strong>Customer has been notified automatically.</strong></p><button class="primary-btn" onclick="closeModal()">Done</button>`,
    );
  } catch (err) {
    alert(err.message);
  }
}
async function showPharmacyView(view) {
  const panel = document.querySelector("#appPanel");
  panel.innerHTML = '<p class="empty">Loading pharmacy data...</p>';
  try {
    if (view === "dashboard") return pharmacistPortal(panel);
    if (view === "orders") {
      const orders = await api("/api/pharmacy/online-orders");
      const rows = orders.length
        ? orders
            .map((x) => {
              const statusLabel =
                x.status === "confirmed"
                  ? "Order accepted"
                  : x.status === "cancelled"
                    ? "Order denied"
                    : x.status;
              const actions =
                x.status === "pending"
                  ? `<div class="order-actions"><button class="primary-btn" onclick="updateOnlineOrder(${x.id},'confirmed')">Accept</button><button class="outline-btn reject-btn" onclick="updateOnlineOrder(${x.id},'cancelled')">Deny</button></div>`
                  : `<span class="group-tag">${statusLabel}</span>`;
              return `<tr><td><b>${x.order_code}</b><br><small>${x.created_at}</small></td><td>${x.brand_name} x ${x.quantity}</td><td>${x.customer_name}<br><small>${x.delivery_phone}</small></td><td>${x.delivery_address}</td><td>BDT ${x.total_amount}</td><td>${actions}</td></tr>`;
            })
            .join("")
        : '<tr><td colspan="6">No online orders yet.</td></tr>';
      return pharmacyPage(
        "Online orders",
        `<button class="outline-btn small-action" onclick="showPharmacyView('dashboard')">Back to dashboard</button><div class="table-wrap"><table><thead><tr><th>Order</th><th>Medicine</th><th>Customer</th><th>Delivery</th><th>Total</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`,
      );
    }
    const report = await api("/api/pharmacy/sales-report");
    return pharmacyPage(
      "Total sales report",
      `<button class="outline-btn small-action" onclick="showPharmacyView('dashboard')">Back to dashboard</button><div class="stats sales-report"><div><span>Counter sales</span><b>BDT ${report.counterSales}</b></div><div><span>Online sales</span><b>BDT ${report.onlineSales}</b></div><div><span>Online orders</span><b>${report.onlineOrders}</b></div><div><span>Total sales</span><b class="up">BDT ${report.totalSales}</b></div></div>`,
    );
  } catch (err) {
    panel.innerHTML = `<div class="dashboard"><h2>Unable to load pharmacy data</h2><p>${err.message}</p></div>`;
  }
}
async function customerPortal(panel) {
  const [reservations, orders, notifications] = await Promise.all([
    api("/api/reservations/my"),
    api("/api/online-orders/my"),
    api("/api/notifications/my"),
  ]);
  const notices = notifications.length
    ? notifications
        .map(
          (x) =>
            `<p class="notice notification"><b>${x.title}</b><br><small>${x.body}</small></p>`,
        )
        .join("")
    : '<p class="empty">No notifications yet.</p>';
  const orderRows = orders.length
    ? `<div class="table-wrap"><table><thead><tr><th>Order</th><th>Medicine</th><th>Total</th><th>Status</th></tr></thead><tbody>${orders.map((x) => `<tr><td>${x.order_code}</td><td>${x.brand_name} x ${x.quantity}</td><td>BDT ${x.total_amount}</td><td>${x.status}</td></tr>`).join("")}</tbody></table></div>`
    : '<p class="empty">No online orders yet.</p>';
  panel.innerHTML = `<div class="dashboard"><p class="eyebrow">CUSTOMER PORTAL</p><h2>Hello, ${session.user.fullName}</h2><div class="portal-actions"><button class="primary-btn" onclick="document.querySelector('#search').scrollIntoView();document.querySelector('main').classList.remove('hidden');document.querySelector('#appPanel').classList.add('hidden')">Search medicine</button><button class="outline-btn" onclick="openEmergency()">Emergency request</button><button class="outline-btn" onclick="uploadPrescription()">Upload prescription</button></div><h3>Notifications</h3>${notices}<h3>My online orders</h3>${orderRows}<h3>My reservations</h3>${reservations.length ? `<div class="table-wrap"><table><thead><tr><th>Medicine</th><th>Pharmacy</th><th>Quantity</th><th>Ready at</th><th>Pickup code</th><th>Status</th></tr></thead><tbody>${reservations.map((x) => `<tr><td>${x.brand_name}</td><td>${x.pharmacy}</td><td>${x.quantity}</td><td><b>${formatPickupTime(x.estimated_ready_at)}</b></td><td><b>${x.pickup_code}</b></td><td>${x.status}</td></tr>`).join("")}</tbody></table></div>` : '<p class="empty">No reservations yet.</p>'}</div>`;
}
// Smart search runs in capture phase so visitors see price-sorted pharmacies first,
// followed by medicines from the same therapeutic group.
const safetyNotice = (query, medicines) => {
  const text = String(query || "").toLowerCase();
  const urgentTerms = [
    "chest pain",
    "heart attack",
    "stroke",
    "severe",
    "unconscious",
    "faint",
    "difficulty breathing",
    "shortness of breath",
    "bleeding",
    "blood in",
    "high fever",
    "overdose",
    "poisoning",
  ];
  if (urgentTerms.some((term) => text.includes(term)))
    return '<p class="medical-alert"><b>Important:</b> These symptoms may require urgent medical care. Please contact a doctor or emergency service immediately.</p>';
  const doctorGuidedCategories = [
    "Antibiotic & infection",
    "Heart, blood pressure & diabetes",
  ];
  if (
    medicines.some((medicine) =>
      doctorGuidedCategories.includes(medicine.category),
    )
  )
    return '<p class="medical-alert"><b>Doctor’s advice recommended:</b> Please consult a doctor before starting, stopping, or changing this medicine.</p>';
  return "";
};
const medicineCard = (x) =>
  `<article class="result-item"><div class="result-info"><b>${x.brand_name}</b><p>${x.pharmacy} · ${x.area || x.address}</p><small>৳ ${x.unit_price} per strip · ${x.stock_qty} in stock</small></div><div class="result-actions"><span class="group-tag">${x.category || "Medicine"}</span><button class="outline-btn small-action" onclick='orderOnline(${JSON.stringify(x)})'>Order online</button><button class="primary-btn" onclick='reserve(${JSON.stringify(x)})'>Reserve</button></div></article>`;
document.querySelector("#searchForm").addEventListener(
  "submit",
  async (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    const q = medicineInput.value;
    results.innerHTML = '<p class="empty">Searching...</p>';
    try {
      const data = await api(
        `/api/medicines/search?q=${encodeURIComponent(q)}`,
      );
      const matches = data.matches || [];
      const alternatives = data.alternatives || [];
      const alert = safetyNotice(q, [...matches, ...alternatives]);
      results.innerHTML = matches.length
        ? `${alert}<div class="search-result-heading"><span>Available at these pharmacies</span><b>Lowest price first</b></div>${matches.map(medicineCard).join("")}${alternatives.length ? `<section class="alternatives"><div class="alternative-heading"><div><p class="eyebrow">SIMILAR MEDICINES</p><h3>Other options in the same group</h3></div><span>${alternatives[0].category}</span></div>${alternatives.map(medicineCard).join("")}</section>` : ""}`
        : '<p class="empty">No approved pharmacy currently has this medicine. You can send an emergency request.</p>';
    } catch (err) {
      results.innerHTML = `<p class="empty">Database unavailable: ${err.message}</p>`;
    }
  },
  true,
);
