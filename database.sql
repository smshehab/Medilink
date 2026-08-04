CREATE DATABASE IF NOT EXISTS medilink_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE medilink_db;

CREATE TABLE users (
 id INT AUTO_INCREMENT PRIMARY KEY, full_name VARCHAR(100) NOT NULL, email VARCHAR(120) NOT NULL UNIQUE,
 phone VARCHAR(25), password_hash VARCHAR(255) NOT NULL, role ENUM('customer','pharmacist','admin') NOT NULL DEFAULT 'customer',
 active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE pharmacies (
 id INT AUTO_INCREMENT PRIMARY KEY, owner_id INT NULL, name VARCHAR(120) NOT NULL, address VARCHAR(255) NOT NULL,
 area VARCHAR(80), phone VARCHAR(25), approved BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE suppliers (id INT AUTO_INCREMENT PRIMARY KEY, pharmacy_id INT NOT NULL, name VARCHAR(120) NOT NULL, phone VARCHAR(25), address VARCHAR(255), FOREIGN KEY (pharmacy_id) REFERENCES pharmacies(id) ON DELETE CASCADE);
CREATE TABLE medicines (
 id INT AUTO_INCREMENT PRIMARY KEY, pharmacy_id INT NOT NULL, supplier_id INT NULL, brand_name VARCHAR(120) NOT NULL,
 generic_name VARCHAR(120), category VARCHAR(80), unit_price DECIMAL(10,2) NOT NULL DEFAULT 0, stock_qty INT NOT NULL DEFAULT 0,
 low_stock_level INT NOT NULL DEFAULT 10, expiry_date DATE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (pharmacy_id) REFERENCES pharmacies(id) ON DELETE CASCADE, FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
);
CREATE TABLE reservations (
 id INT AUTO_INCREMENT PRIMARY KEY, customer_id INT NOT NULL, medicine_id INT NOT NULL, pharmacy_id INT NOT NULL, quantity INT NOT NULL,
 status ENUM('pending','confirmed','collected','cancelled') DEFAULT 'pending', pickup_code VARCHAR(12) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(customer_id) REFERENCES users(id), FOREIGN KEY(medicine_id) REFERENCES medicines(id), FOREIGN KEY(pharmacy_id) REFERENCES pharmacies(id)
);
CREATE TABLE emergency_requests (id INT AUTO_INCREMENT PRIMARY KEY, customer_id INT NOT NULL, medicine_name VARCHAR(120) NOT NULL, message TEXT, area VARCHAR(80), status ENUM('open','responded','closed') DEFAULT 'open', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(customer_id) REFERENCES users(id));
CREATE TABLE prescriptions (id INT AUTO_INCREMENT PRIMARY KEY, customer_id INT NOT NULL, file_path VARCHAR(255) NOT NULL, note VARCHAR(255), status ENUM('pending','verified','rejected') DEFAULT 'pending', uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(customer_id) REFERENCES users(id));
CREATE TABLE sales (id INT AUTO_INCREMENT PRIMARY KEY, pharmacy_id INT NOT NULL, medicine_id INT NOT NULL, quantity INT NOT NULL, total_amount DECIMAL(10,2) NOT NULL, sold_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(pharmacy_id) REFERENCES pharmacies(id), FOREIGN KEY(medicine_id) REFERENCES medicines(id));

-- Create the first admin from the web registration page, then change its role to admin in phpMyAdmin if needed.
