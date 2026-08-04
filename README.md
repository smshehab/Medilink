# MediLink

Smart Pharmacy Inventory & Emergency Medicine Reservation System.

## Run locally

1. Install and start **MySQL** (XAMPP MySQL is fine).
2. Open phpMyAdmin, choose **Import**, and import `database.sql`.
3. Copy `.env.example` as `.env`, then set your MySQL username and password.
4. In this folder run:

   ```bash
   npm start
   ```

5. Open `http://localhost:3000`.

## First use

- Create a Customer or Pharmacist account from the site.
- Pharmacist submits a pharmacy; an Admin must approve it before its medicines appear in search.
- For an Admin account, register normally, then in phpMyAdmin run:

  ```sql
  UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
  ```

## Included features

- Customer: medicine search, availability, reservation pickup codes, emergency requests, prescription upload.
- Pharmacist: pharmacy onboarding, inventory entries, low-stock and expiry alerts, sales API, reservation list.
- Admin: platform totals and pharmacy approval.
