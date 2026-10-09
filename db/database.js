const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'blood_bank.db');
const db = new sqlite3.Database(dbPath);

// Helper for promise queries
const runAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const getAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const allAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Initialize Database Tables
async function initDatabase() {
  // Enable foreign keys
  await runAsync('PRAGMA foreign_keys = ON;');

  // 1. Users Table (Role-based: admin, donor, recipient)
  await runAsync(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'donor', 'recipient')) NOT NULL,
      phone TEXT,
      city TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Donors Table (Extended profile for donors)
  await runAsync(`
    CREATE TABLE IF NOT EXISTS donors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      blood_group TEXT CHECK(blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')) NOT NULL,
      age INTEGER NOT NULL,
      gender TEXT,
      weight REAL,
      last_donation_date DATE,
      medical_notes TEXT,
      is_available INTEGER DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 3. Recipients / Hospital Profiles Table
  await runAsync(`
    CREATE TABLE IF NOT EXISTS recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      organization_type TEXT CHECK(organization_type IN ('Hospital', 'Clinic', 'Individual Patient')) DEFAULT 'Hospital',
      hospital_name TEXT,
      license_number TEXT,
      emergency_contact TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 4. Blood Inventory Table (Unit-level stock tracking with expiry)
  await runAsync(`
    CREATE TABLE IF NOT EXISTS blood_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_code TEXT UNIQUE NOT NULL,
      blood_group TEXT CHECK(blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')) NOT NULL,
      donation_date DATE NOT NULL,
      expiry_date DATE NOT NULL,
      status TEXT CHECK(status IN ('Available', 'Reserved', 'Issued', 'Expired', 'Discarded')) DEFAULT 'Available',
      volume_ml INTEGER DEFAULT 450,
      storage_location TEXT DEFAULT 'Cold Storage Bay-1',
      donor_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (donor_id) REFERENCES donors(id) ON DELETE SET NULL
    );
  `);

  // 5. Donations Table (Logs of blood donation sessions)
  await runAsync(`
    CREATE TABLE IF NOT EXISTS donations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      donor_id INTEGER NOT NULL,
      donation_date DATE NOT NULL,
      blood_group TEXT NOT NULL,
      units_collected INTEGER DEFAULT 1,
      hemoglobin_level REAL,
      pulse_rate INTEGER,
      blood_pressure TEXT,
      status TEXT CHECK(status IN ('Completed', 'Scheduled', 'Cancelled')) DEFAULT 'Completed',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (donor_id) REFERENCES donors(id) ON DELETE CASCADE
    );
  `);

  // 6. Blood Requests Table (Recipient / Hospital demand management)
  await runAsync(`
    CREATE TABLE IF NOT EXISTS blood_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id INTEGER NOT NULL,
      patient_name TEXT NOT NULL,
      blood_group TEXT CHECK(blood_group IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')) NOT NULL,
      units_requested INTEGER NOT NULL,
      units_allocated INTEGER DEFAULT 0,
      urgency TEXT CHECK(urgency IN ('Routine', 'Urgent', 'Critical Emergency')) DEFAULT 'Routine',
      hospital_name TEXT NOT NULL,
      doctor_name TEXT,
      reason TEXT,
      status TEXT CHECK(status IN ('Pending', 'Approved', 'Rejected', 'Fulfilled')) DEFAULT 'Pending',
      admin_notes TEXT,
      request_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (recipient_id) REFERENCES recipients(id) ON DELETE CASCADE
    );
  `);

  // 7. Notifications / Logs Table
  await runAsync(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT CHECK(type IN ('info', 'success', 'warning', 'danger')) DEFAULT 'info',
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Check if initial users exist, if not seed demo data
  const userCount = await getAsync('SELECT COUNT(*) as count FROM users');
  if (userCount.count === 0) {
    await seedDemoData();
  }
}

// Seed realistic demo data
async function seedDemoData() {
  console.log('Seeding demo data for Blood Bank Management System...');
  const salt = await bcrypt.genSalt(10);
  const defaultPassword = await bcrypt.hash('password123', salt);

  // 1. Create Admin
  const adminResult = await runAsync(
    `INSERT INTO users (name, email, password_hash, role, phone, city, address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['Dr. Arvind Sharma (Admin)', 'admin@bloodbank.org', defaultPassword, 'admin', '+91 9876543210', 'Bangalore', 'Central Blood Bank, MG Road']
  );

  // 2. Create Donors
  const demoDonors = [
    { name: 'Rahul Verma', email: 'rahul.donor@example.com', blood_group: 'O+', age: 26, phone: '+91 9845012345', city: 'Bangalore', last_date: '2026-06-15' },
    { name: 'Priya Iyer', email: 'priya.donor@example.com', blood_group: 'A+', age: 23, phone: '+91 9845023456', city: 'Bangalore', last_date: '2026-09-01' },
    { name: 'Vikram Singh', email: 'vikram.donor@example.com', blood_group: 'B+', age: 31, phone: '+91 9845034567', city: 'Bangalore', last_date: '2026-05-10' },
    { name: 'Ananya Deshmukh', email: 'ananya.donor@example.com', blood_group: 'AB+', age: 29, phone: '+91 9845045678', city: 'Bangalore', last_date: '2026-07-20' },
    { name: 'Sameer Khan', email: 'sameer.donor@example.com', blood_group: 'O-', age: 34, phone: '+91 9845056789', city: 'Mysore', last_date: '2026-06-01' },
    { name: 'Deepa Nair', email: 'deepa.donor@example.com', blood_group: 'A-', age: 22, phone: '+91 9845067890', city: 'Bangalore', last_date: null },
    { name: 'Karthik Raja', email: 'karthik.donor@example.com', blood_group: 'B-', age: 28, phone: '+91 9845078901', city: 'Bangalore', last_date: '2026-07-05' },
    { name: 'Meera Patel', email: 'meera.donor@example.com', blood_group: 'AB-', age: 27, phone: '+91 9845089012', city: 'Bangalore', last_date: '2026-08-14' }
  ];

  for (const d of demoDonors) {
    const userRes = await runAsync(
      `INSERT INTO users (name, email, password_hash, role, phone, city, address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [d.name, d.email, defaultPassword, 'donor', d.phone, d.city, `${d.city} Community, Sector 4`]
    );

    await runAsync(
      `INSERT INTO donors (user_id, blood_group, age, gender, weight, last_donation_date, medical_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userRes.lastID, d.blood_group, d.age, d.age % 2 === 0 ? 'Male' : 'Female', 65, d.last_date, 'Healthy, verified donor']
    );
  }

  // 3. Create Recipients / Hospitals
  const demoRecipients = [
    { name: 'Apollo Hospital Indiranagar', email: 'apollo.er@example.com', phone: '+91 8023456789', city: 'Bangalore', org_type: 'Hospital', license: 'HOSP-BLR-8891' },
    { name: 'Manipal Hospital Whitefield', email: 'manipal.blood@example.com', phone: '+91 8034567890', city: 'Bangalore', org_type: 'Hospital', license: 'HOSP-BLR-4421' },
    { name: 'Dr. Suresh Reddy (Fortis)', email: 'suresh.patient@example.com', phone: '+91 9988776655', city: 'Bangalore', org_type: 'Individual Patient', license: 'IND-PAT-2026' }
  ];

  for (const r of demoRecipients) {
    const uRes = await runAsync(
      `INSERT INTO users (name, email, password_hash, role, phone, city, address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [r.name, r.email, defaultPassword, 'recipient', r.phone, r.city, `${r.name}, ${r.city}`]
    );

    await runAsync(
      `INSERT INTO recipients (user_id, organization_type, hospital_name, license_number, emergency_contact)
       VALUES (?, ?, ?, ?, ?)`,
      [uRes.lastID, r.org_type, r.name, r.license, r.phone]
    );
  }

  // 4. Create Initial Blood Inventory (Varied across groups and expiry dates)
  // Shelf life 35 - 42 days
  const now = new Date();
  const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  let bagIndex = 1001;

  // Distribute 45 sample units with realistic dates
  for (const bg of bloodGroups) {
    // Generate between 3 to 8 units per blood group
    const count = bg === 'O+' || bg === 'A+' ? 8 : bg === 'AB-' || bg === 'B-' ? 3 : 5;
    for (let i = 0; i < count; i++) {
      // Some units donated 10-35 days ago, so expiry (now + 7 to 32 days)
      // Make a couple of units near-expiry (e.g. expiring in 3-5 days) to test the warning alert!
      const daysAgo = (i === 0) ? 38 : Math.floor(Math.random() * 25) + 5; 
      const donDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
      const expDate = new Date(donDate.getTime() + 42 * 24 * 60 * 60 * 1000);

      const donDateStr = donDate.toISOString().split('T')[0];
      const expDateStr = expDate.toISOString().split('T')[0];

      await runAsync(
        `INSERT INTO blood_inventory (unit_code, blood_group, donation_date, expiry_date, status, storage_location)
         VALUES (?, ?, ?, ?, 'Available', ?)`,
        [`BB-${bg.replace('+', 'POS').replace('-', 'NEG')}-${bagIndex++}`, bg, donDateStr, expDateStr, `Cold Bay-${(bagIndex % 4) + 1}`]
      );
    }
  }

  // 5. Create Sample Donations History
  const donors = await allAsync('SELECT id, blood_group FROM donors LIMIT 5');
  for (let idx = 0; idx < donors.length; idx++) {
    const d = donors[idx];
    const donDate = new Date(now.getTime() - (30 + idx * 20) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await runAsync(
      `INSERT INTO donations (donor_id, donation_date, blood_group, units_collected, hemoglobin_level, pulse_rate, blood_pressure, status, notes)
       VALUES (?, ?, ?, 1, 14.2, 72, '120/80', 'Completed', 'Routine voluntary donation. No adverse reaction.')`,
      [d.id, donDate, d.blood_group]
    );
  }

  // 6. Create Sample Blood Requests
  const recipients = await allAsync('SELECT id, hospital_name FROM recipients');
  if (recipients.length > 0) {
    // Pending Urgent request
    await runAsync(
      `INSERT INTO blood_requests (recipient_id, patient_name, blood_group, units_requested, urgency, hospital_name, doctor_name, reason, status, admin_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [recipients[0].id, 'Sunil Kumar (ICU Bed 12)', 'O+', 2, 'Urgent', recipients[0].hospital_name, 'Dr. Meenakshi Sundaram', 'Emergency surgery following severe road traffic accident.', 'Pending', '']
    );

    // Critical Emergency Pending request
    await runAsync(
      `INSERT INTO blood_requests (recipient_id, patient_name, blood_group, units_requested, urgency, hospital_name, doctor_name, reason, status, admin_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [recipients[1].id, 'Kavita Sharma (Cardiac Ward)', 'A+', 3, 'Critical Emergency', recipients[1].hospital_name, 'Dr. Rajesh Gupta', 'Open heart bypass surgery scheduled in 4 hours.', 'Pending', '']
    );

    // Approved request
    await runAsync(
      `INSERT INTO blood_requests (recipient_id, patient_name, blood_group, units_requested, units_allocated, urgency, hospital_name, doctor_name, reason, status, admin_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [recipients[0].id, 'Ramesh Babu', 'B+', 1, 1, 'Routine', recipients[0].hospital_name, 'Dr. Vinay', 'Chemotherapy supportive transfusion.', 'Approved', 'Stock verified and units reserved. Picked up by courier.']
    );
  }

  // 7. Create Sample Notifications
  await runAsync(
    `INSERT INTO notifications (user_id, title, message, type)
     VALUES (?, ?, ?, ?)`,
    [1, 'System Initialized', 'Blood Bank Management System is live with full stock tracking and emergency modules.', 'info']
  );

  console.log('Demo data successfully initialized!');
}

module.exports = {
  db,
  runAsync,
  getAsync,
  allAsync,
  initDatabase,
  seedDemoData
};
