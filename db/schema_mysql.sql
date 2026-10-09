-- ============================================================================
-- BLOOD BANK MANAGEMENT SYSTEM - DATABASE SCHEMA (MySQL 8.0+)
-- Architecture: 3-Tier Enterprise / Academic Standard
-- Compatible with: MySQL Workbench, phpMyAdmin, CLI
-- ============================================================================

CREATE DATABASE IF NOT EXISTS blood_bank_db;
USE blood_bank_db;

-- 1. USERS TABLE (Core Authentication & Role Management)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'donor', 'recipient') NOT NULL,
    phone VARCHAR(25),
    city VARCHAR(100),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 2. DONORS TABLE (Donor Demographic & Medical Profile)
CREATE TABLE IF NOT EXISTS donors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    blood_group ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NOT NULL,
    age INT NOT NULL,
    gender ENUM('Male', 'Female', 'Other') DEFAULT 'Male',
    weight DECIMAL(5,2),
    last_donation_date DATE,
    medical_notes TEXT,
    is_available BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3. RECIPIENTS TABLE (Hospitals, Clinics & Verified Patients)
CREATE TABLE IF NOT EXISTS recipients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    organization_type ENUM('Hospital', 'Clinic', 'Individual Patient') DEFAULT 'Hospital',
    hospital_name VARCHAR(200),
    license_number VARCHAR(100),
    emergency_contact VARCHAR(25),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. BLOOD INVENTORY TABLE (Blood Units, Cold Chain & Shelf-life Tracking)
CREATE TABLE IF NOT EXISTS blood_inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    unit_code VARCHAR(60) UNIQUE NOT NULL,
    blood_group ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NOT NULL,
    donation_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    status ENUM('Available', 'Reserved', 'Issued', 'Expired', 'Discarded') DEFAULT 'Available',
    volume_ml INT DEFAULT 450,
    storage_location VARCHAR(100) DEFAULT 'Cold Storage Bay-1',
    donor_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (donor_id) REFERENCES donors(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- 5. DONATIONS TABLE (Session Logs & Physical Vitals)
CREATE TABLE IF NOT EXISTS donations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    donor_id INT NOT NULL,
    donation_date DATE NOT NULL,
    blood_group VARCHAR(10) NOT NULL,
    units_collected INT DEFAULT 1,
    hemoglobin_level DECIMAL(4,2),
    pulse_rate INT,
    blood_pressure VARCHAR(20),
    status ENUM('Completed', 'Scheduled', 'Cancelled') DEFAULT 'Completed',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (donor_id) REFERENCES donors(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 6. BLOOD REQUESTS TABLE (Hospital Transfusion Orders & Approvals)
CREATE TABLE IF NOT EXISTS blood_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    recipient_id INT NOT NULL,
    patient_name VARCHAR(150) NOT NULL,
    blood_group ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NOT NULL,
    units_requested INT NOT NULL,
    units_allocated INT DEFAULT 0,
    urgency ENUM('Routine', 'Urgent', 'Critical Emergency') DEFAULT 'Routine',
    hospital_name VARCHAR(200) NOT NULL,
    doctor_name VARCHAR(150),
    reason TEXT,
    status ENUM('Pending', 'Approved', 'Rejected', 'Fulfilled') DEFAULT 'Pending',
    admin_notes TEXT,
    request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    FOREIGN KEY (recipient_id) REFERENCES recipients(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 7. NOTIFICATIONS TABLE (Alerts & Communication Dispatches)
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('info', 'success', 'warning', 'danger') DEFAULT 'info',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Indexes for Fast Query Optimization
CREATE INDEX idx_blood_group ON blood_inventory(blood_group, status);
CREATE INDEX idx_inventory_expiry ON blood_inventory(expiry_date);
CREATE INDEX idx_requests_status ON blood_requests(status);
CREATE INDEX idx_donors_bg ON donors(blood_group);
