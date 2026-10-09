const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db, runAsync, getAsync, allAsync, initDatabase } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'se-blood-bank-jwt-secret-key-2026';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// JWT Auth Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required. Please log in.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  });
}

// Role Authorization Middleware
function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied. Requires one of roles: ${roles.join(', ')}`
      });
    }
    next();
  };
}

// Helper: Calculate Donor Eligibility
function checkEligibility(donor) {
  const result = {
    isEligible: true,
    reasons: [],
    daysUntilEligible: 0,
    nextEligibleDate: null
  };

  if (!donor) return result;

  // Age rule: Minimum 18 years
  if (donor.age < 18) {
    result.isEligible = false;
    result.reasons.push(`Donor age (${donor.age}) is under 18 years. Minimum age required is 18.`);
  }

  // Weight rule: Standard 50 kg
  if (donor.weight && donor.weight < 50) {
    result.isEligible = false;
    result.reasons.push(`Body weight (${donor.weight} kg) is below the minimum required 50 kg.`);
  }

  // 90-day cooldown period
  if (donor.last_donation_date) {
    const lastDate = new Date(donor.last_donation_date);
    const today = new Date();
    const diffTime = today.getTime() - lastDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 90) {
      result.isEligible = false;
      result.daysUntilEligible = 90 - diffDays;
      const nextDate = new Date(lastDate.getTime() + 90 * 24 * 60 * 60 * 1000);
      result.nextEligibleDate = nextDate.toISOString().split('T')[0];
      result.reasons.push(
        `Last donation was ${diffDays} days ago. A 90-day (3-month) recovery interval is required. Next eligible on ${result.nextEligibleDate} (${result.daysUntilEligible} days remaining).`
      );
    }
  }

  return result;
}

// ==========================================
// 1. AUTHENTICATION & USER MANAGEMENT
// ==========================================

// Register (Supports all three roles: donor, recipient, admin)
app.post('/api/auth/register', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      phone,
      city,
      address,
      // Donor-specific fields
      blood_group,
      age,
      gender,
      weight,
      last_donation_date,
      // Recipient-specific fields
      organization_type,
      hospital_name,
      license_number
    } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required.' });
    }

    if (!['admin', 'donor', 'recipient'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin, donor, or recipient.' });
    }

    const existingUser = await getAsync('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const userResult = await runAsync(
      `INSERT INTO users (name, email, password_hash, role, phone, city, address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, email, password_hash, role, phone || '', city || '', address || '']
    );

    const userId = userResult.lastID;

    // Create role-specific record
    if (role === 'donor') {
      if (!blood_group || !age) {
        return res.status(400).json({ error: 'Blood group and age are required for donors.' });
      }
      await runAsync(
        `INSERT INTO donors (user_id, blood_group, age, gender, weight, last_donation_date, medical_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, blood_group, parseInt(age, 10), gender || 'Male', weight ? parseFloat(weight) : 60, last_donation_date || null, '']
      );
    } else if (role === 'recipient') {
      await runAsync(
        `INSERT INTO recipients (user_id, organization_type, hospital_name, license_number, emergency_contact)
         VALUES (?, ?, ?, ?, ?)`,
        [userId, organization_type || 'Hospital', hospital_name || name, license_number || 'N/A', phone || '']
      );
    }

    // Generate JWT
    const token = jwt.sign(
      { id: userId, name, email, role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: { id: userId, name, email, role, phone, city }
    });
  } catch (error) {
    console.error('Registration Error:', error);
    res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await getAsync('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    let roleData = null;
    if (user.role === 'donor') {
      roleData = await getAsync('SELECT * FROM donors WHERE user_id = ?', [user.id]);
    } else if (user.role === 'recipient') {
      roleData = await getAsync('SELECT * FROM recipients WHERE user_id = ?', [user.id]);
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        city: user.city,
        address: user.address,
        roleData
      }
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// Current User Details
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await getAsync('SELECT id, name, email, role, phone, city, address FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    let roleData = null;
    let eligibility = null;
    if (user.role === 'donor') {
      roleData = await getAsync('SELECT * FROM donors WHERE user_id = ?', [user.id]);
      if (roleData) {
        eligibility = checkEligibility(roleData);
      }
    } else if (user.role === 'recipient') {
      roleData = await getAsync('SELECT * FROM recipients WHERE user_id = ?', [user.id]);
    }

    res.json({ user, roleData, eligibility });
  } catch (error) {
    console.error('Auth Me Error:', error);
    res.status(500).json({ error: 'Failed to retrieve profile.' });
  }
});

// ==========================================
// 2. DONOR MANAGEMENT & ELIGIBILITY
// ==========================================

// Get Donor Profile & Eligibility
app.get('/api/donors/profile', authenticateToken, async (req, res) => {
  try {
    const donor = await getAsync(
      `SELECT d.*, u.name, u.email, u.phone, u.city, u.address 
       FROM donors d
       JOIN users u ON d.user_id = u.id
       WHERE d.user_id = ?`,
      [req.user.id]
    );

    if (!donor) return res.status(404).json({ error: 'Donor profile not found.' });

    const eligibility = checkEligibility(donor);
    res.json({ donor, eligibility });
  } catch (error) {
    console.error('Donor Profile Error:', error);
    res.status(500).json({ error: 'Failed to fetch donor profile.' });
  }
});

// Update Donor Profile
app.put('/api/donors/profile', authenticateToken, requireRoles('donor'), async (req, res) => {
  try {
    const { phone, city, address, age, weight, is_available } = req.body;

    await runAsync(
      `UPDATE users SET phone = ?, city = ?, address = ? WHERE id = ?`,
      [phone, city, address, req.user.id]
    );

    await runAsync(
      `UPDATE donors SET age = ?, weight = ?, is_available = ? WHERE user_id = ?`,
      [parseInt(age, 10), parseFloat(weight), is_available !== undefined ? (is_available ? 1 : 0) : 1, req.user.id]
    );

    res.json({ message: 'Profile updated successfully.' });
  } catch (error) {
    console.error('Update Donor Error:', error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// Admin: Get all donors list with status
app.get('/api/donors', authenticateToken, requireRoles('admin'), async (req, res) => {
  try {
    const donors = await allAsync(
      `SELECT d.id as donor_id, d.blood_group, d.age, d.gender, d.weight, d.last_donation_date, d.is_available,
              u.id as user_id, u.name, u.email, u.phone, u.city,
              (SELECT COUNT(*) FROM donations WHERE donor_id = d.id) as donation_count
       FROM donors d
       JOIN users u ON d.user_id = u.id
       ORDER BY d.id DESC`
    );

    // Compute eligibility dynamically for each
    const enriched = donors.map(d => ({
      ...d,
      eligibility: checkEligibility(d)
    }));

    res.json({ donors: enriched });
  } catch (error) {
    console.error('List Donors Error:', error);
    res.status(500).json({ error: 'Failed to fetch donors list.' });
  }
});

// Emergency Donor Search (by Blood Group & City)
app.get('/api/donors/emergency-search', async (req, res) => {
  try {
    const { blood_group, city } = req.query;
    let sql = `
      SELECT d.id as donor_id, d.blood_group, d.age, d.last_donation_date,
             u.name, u.phone, u.city
      FROM donors d
      JOIN users u ON d.user_id = u.id
      WHERE d.is_available = 1
    `;
    const params = [];

    if (blood_group && blood_group !== 'All') {
      sql += ' AND d.blood_group = ?';
      params.push(blood_group);
    }

    if (city && city.trim() !== '') {
      sql += ' AND LOWER(u.city) LIKE LOWER(?)';
      params.push(`%${city.trim()}%`);
    }

    sql += ' ORDER BY u.city ASC, d.id DESC';

    const donors = await allAsync(sql, params);
    const eligibleDonors = donors.filter(d => checkEligibility(d).isEligible);

    res.json({ donors: eligibleDonors, totalFound: eligibleDonors.length });
  } catch (error) {
    console.error('Emergency Donor Search Error:', error);
    res.status(500).json({ error: 'Failed to search donors.' });
  }
});

// ==========================================
// 3. DONATIONS & INVENTORY RECORDING
// ==========================================

// Donor books donation appointment / slot
app.post('/api/donations/book', authenticateToken, requireRoles('donor'), async (req, res) => {
  try {
    const donor = await getAsync('SELECT * FROM donors WHERE user_id = ?', [req.user.id]);
    if (!donor) return res.status(404).json({ error: 'Donor profile not found.' });

    const eligibility = checkEligibility(donor);
    if (!eligibility.isEligible) {
      return res.status(400).json({
        error: 'Donor currently ineligible to donate.',
        reasons: eligibility.reasons
      });
    }

    const { donation_date, notes } = req.body;
    const targetDate = donation_date || new Date().toISOString().split('T')[0];

    const result = await runAsync(
      `INSERT INTO donations (donor_id, donation_date, blood_group, units_collected, status, notes)
       VALUES (?, ?, ?, 1, 'Scheduled', ?)`,
      [donor.id, targetDate, donor.blood_group, notes || 'Slot booked via online portal']
    );

    // Add confirmation notification
    await runAsync(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES (?, ?, ?, ?)`,
      [req.user.id, 'Donation Slot Booked', `Your donation slot for ${targetDate} has been confirmed. Please stay hydrated!`, 'success']
    );

    res.status(201).json({
      message: 'Donation slot booked successfully!',
      donationId: result.lastID
    });
  } catch (error) {
    console.error('Book Donation Error:', error);
    res.status(500).json({ error: 'Failed to book donation slot.' });
  }
});

// Admin logs/completes blood donation and automatically adds to inventory!
app.post('/api/donations/record', authenticateToken, requireRoles('admin'), async (req, res) => {
  try {
    const { donor_id, donation_date, hemoglobin_level, pulse_rate, blood_pressure, notes } = req.body;

    const donor = await getAsync('SELECT * FROM donors WHERE id = ?', [donor_id]);
    if (!donor) return res.status(404).json({ error: 'Donor not found.' });

    const donDate = donation_date || new Date().toISOString().split('T')[0];

    // Log donation session
    const donRes = await runAsync(
      `INSERT INTO donations (donor_id, donation_date, blood_group, units_collected, hemoglobin_level, pulse_rate, blood_pressure, status, notes)
       VALUES (?, ?, ?, 1, ?, ?, ?, 'Completed', ?)`,
      [donor_id, donDate, donor.blood_group, hemoglobin_level || 14.0, pulse_rate || 72, blood_pressure || '120/80', notes || 'Successful donation']
    );

    // Update donor's last_donation_date
    await runAsync('UPDATE donors SET last_donation_date = ? WHERE id = ?', [donDate, donor_id]);

    // Calculate expiry date: Standard 42 days shelf life
    const expDate = new Date(new Date(donDate).getTime() + 42 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const unitCode = `BB-${donor.blood_group.replace('+', 'POS').replace('-', 'NEG')}-${Date.now().toString().slice(-6)}`;

    // Add unit to blood inventory
    await runAsync(
      `INSERT INTO blood_inventory (unit_code, blood_group, donation_date, expiry_date, status, volume_ml, storage_location, donor_id)
       VALUES (?, ?, ?, ?, 'Available', 450, 'Cold Bay-Main', ?)`,
      [unitCode, donor.blood_group, donDate, expDate, donor.id]
    );

    // Notify donor
    await runAsync(
      `INSERT INTO notifications (user_id, title, message, type)
       VALUES (?, ?, ?, ?)`,
      [donor.user_id, 'Thank You for Donating Blood!', `Your blood donation has been processed and added to active inventory (${unitCode}). You saved a life today!`, 'success']
    );

    res.status(201).json({
      message: 'Blood donation logged and unit added to inventory successfully!',
      unitCode,
      expiryDate: expDate,
      donationId: donRes.lastID
    });
  } catch (error) {
    console.error('Record Donation Error:', error);
    res.status(500).json({ error: 'Failed to record donation.' });
  }
});

// View My Donation History (for Donor)
app.get('/api/donations/my', authenticateToken, requireRoles('donor'), async (req, res) => {
  try {
    const donor = await getAsync('SELECT id FROM donors WHERE user_id = ?', [req.user.id]);
    if (!donor) return res.status(404).json({ error: 'Donor profile not found.' });

    const donations = await allAsync(
      `SELECT * FROM donations WHERE donor_id = ? ORDER BY donation_date DESC, id DESC`,
      [donor.id]
    );

    res.json({ donations });
  } catch (error) {
    console.error('My Donations Error:', error);
    res.status(500).json({ error: 'Failed to fetch donation history.' });
  }
});

// Admin: View all donations
app.get('/api/donations/all', authenticateToken, requireRoles('admin'), async (req, res) => {
  try {
    const donations = await allAsync(
      `SELECT d.*, u.name as donor_name, u.phone as donor_phone, u.city as donor_city
       FROM donations d
       JOIN donors dn ON d.donor_id = dn.id
       JOIN users u ON dn.user_id = u.id
       ORDER BY d.donation_date DESC, d.id DESC`
    );

    res.json({ donations });
  } catch (error) {
    console.error('All Donations Error:', error);
    res.status(500).json({ error: 'Failed to fetch donations.' });
  }
});

// ==========================================
// 4. BLOOD INVENTORY & EXPIRY MONITORING
// ==========================================

// Inventory Summary per blood group with alerts
app.get('/api/inventory/summary', async (req, res) => {
  try {
    const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    const today = new Date().toISOString().split('T')[0];

    // Auto-mark expired units
    await runAsync(
      `UPDATE blood_inventory 
       SET status = 'Expired' 
       WHERE expiry_date < ? AND status = 'Available'`,
      [today]
    );

    // Counts available units per blood group
    const counts = await allAsync(
      `SELECT blood_group, COUNT(*) as count 
       FROM blood_inventory 
       WHERE status = 'Available'
       GROUP BY blood_group`
    );

    const countMap = {};
    counts.forEach(c => {
      countMap[c.blood_group] = c.count;
    });

    const summary = bloodGroups.map(bg => ({
      blood_group: bg,
      units_available: countMap[bg] || 0,
      is_low_stock: (countMap[bg] || 0) < 5
    }));

    // Near expiry count (within next 7 days)
    const sevenDaysLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const nearExpiryUnits = await allAsync(
      `SELECT * FROM blood_inventory 
       WHERE status = 'Available' AND expiry_date BETWEEN ? AND ?
       ORDER BY expiry_date ASC`,
      [today, sevenDaysLater]
    );

    // Overall metrics
    const totalUnitsRow = await getAsync(`SELECT COUNT(*) as total FROM blood_inventory WHERE status = 'Available'`);
    const totalExpiredRow = await getAsync(`SELECT COUNT(*) as expired FROM blood_inventory WHERE status = 'Expired'`);
    const totalIssuedRow = await getAsync(`SELECT COUNT(*) as issued FROM blood_inventory WHERE status = 'Issued'`);

    res.json({
      summary,
      totalAvailableUnits: totalUnitsRow.total,
      totalExpiredUnits: totalExpiredRow.expired,
      totalIssuedUnits: totalIssuedRow.issued,
      nearExpiryCount: nearExpiryUnits.length,
      nearExpiryUnits
    });
  } catch (error) {
    console.error('Inventory Summary Error:', error);
    res.status(500).json({ error: 'Failed to get inventory summary.' });
  }
});

// Admin: Detailed Unit List with filtering
app.get('/api/inventory/units', authenticateToken, requireRoles('admin'), async (req, res) => {
  try {
    const { blood_group, status } = req.query;
    let sql = `SELECT * FROM blood_inventory WHERE 1=1`;
    const params = [];

    if (blood_group && blood_group !== 'All') {
      sql += ` AND blood_group = ?`;
      params.push(blood_group);
    }
    if (status && status !== 'All') {
      sql += ` AND status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY expiry_date ASC, id DESC`;

    const units = await allAsync(sql, params);
    res.json({ units });
  } catch (error) {
    console.error('Inventory Units Error:', error);
    res.status(500).json({ error: 'Failed to fetch blood units.' });
  }
});

// Admin: Discard Expired Units
app.post('/api/inventory/discard-expired', authenticateToken, requireRoles('admin'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const result = await runAsync(
      `UPDATE blood_inventory SET status = 'Discarded' WHERE expiry_date < ? AND status IN ('Available', 'Expired')`,
      [today]
    );
    res.json({ message: `Successfully discarded ${result.changes} expired unit(s).` });
  } catch (error) {
    console.error('Discard Error:', error);
    res.status(500).json({ error: 'Failed to discard expired units.' });
  }
});

// ==========================================
// 5. BLOOD REQUESTS & APPROVAL WORKFLOW
// ==========================================

// Recipient / Hospital submits blood request
app.post('/api/requests', authenticateToken, requireRoles('recipient', 'admin'), async (req, res) => {
  try {
    const { patient_name, blood_group, units_requested, urgency, hospital_name, doctor_name, reason } = req.body;

    if (!patient_name || !blood_group || !units_requested) {
      return res.status(400).json({ error: 'Patient name, blood group, and units requested are required.' });
    }

    let recipientId = null;
    let hospName = hospital_name;

    if (req.user.role === 'recipient') {
      const rec = await getAsync('SELECT * FROM recipients WHERE user_id = ?', [req.user.id]);
      if (!rec) return res.status(404).json({ error: 'Recipient profile not found.' });
      recipientId = rec.id;
      hospName = hospName || rec.hospital_name || req.user.name;
    } else {
      // If admin creates request on behalf of a hospital
      const anyRec = await getAsync('SELECT id, hospital_name FROM recipients LIMIT 1');
      recipientId = anyRec ? anyRec.id : 1;
      hospName = hospName || 'General Emergency Care';
    }

    const result = await runAsync(
      `INSERT INTO blood_requests (recipient_id, patient_name, blood_group, units_requested, urgency, hospital_name, doctor_name, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [recipientId, patient_name, blood_group, parseInt(units_requested, 10), urgency || 'Routine', hospName, doctor_name || '', reason || '']
    );

    // Notify Admins
    const admins = await allAsync(`SELECT id FROM users WHERE role = 'admin'`);
    for (const adm of admins) {
      await runAsync(
        `INSERT INTO notifications (user_id, title, message, type)
         VALUES (?, ?, ?, ?)`,
        [adm.id, `New Blood Request (${urgency || 'Routine'})`, `${hospName} requested ${units_requested} unit(s) of ${blood_group} for ${patient_name}.`, 'warning']
      );
    }

    res.status(201).json({
      message: 'Blood request submitted successfully and is pending admin approval.',
      requestId: result.lastID
    });
  } catch (error) {
    console.error('Submit Request Error:', error);
    res.status(500).json({ error: 'Failed to submit blood request.' });
  }
});

// View My Requests (Recipient)
app.get('/api/requests/my', authenticateToken, requireRoles('recipient'), async (req, res) => {
  try {
    const rec = await getAsync('SELECT id FROM recipients WHERE user_id = ?', [req.user.id]);
    if (!rec) return res.status(404).json({ error: 'Recipient profile not found.' });

    const requests = await allAsync(
      `SELECT * FROM blood_requests WHERE recipient_id = ? ORDER BY request_date DESC`,
      [rec.id]
    );

    res.json({ requests });
  } catch (error) {
    console.error('My Requests Error:', error);
    res.status(500).json({ error: 'Failed to fetch blood requests.' });
  }
});

// View All Requests (Admin)
app.get('/api/requests/all', authenticateToken, requireRoles('admin'), async (req, res) => {
  try {
    const requests = await allAsync(
      `SELECT r.*, u.name as requester_name, u.email as requester_email, u.phone as requester_phone
       FROM blood_requests r
       JOIN recipients rec ON r.recipient_id = rec.id
       JOIN users u ON rec.user_id = u.id
       ORDER BY CASE r.status WHEN 'Pending' THEN 1 ELSE 2 END, r.request_date DESC`
    );

    res.json({ requests });
  } catch (error) {
    console.error('All Requests Error:', error);
    res.status(500).json({ error: 'Failed to fetch all requests.' });
  }
});

// Admin: Approve or Reject Blood Request (with automated FIFO stock deduction)
app.put('/api/requests/:id/action', authenticateToken, requireRoles('admin'), async (req, res) => {
  try {
    const requestId = req.params.id;
    const { action, admin_notes } = req.body; // action: 'approve' | 'reject'

    const bloodReq = await getAsync('SELECT * FROM blood_requests WHERE id = ?', [requestId]);
    if (!bloodReq) return res.status(404).json({ error: 'Request not found.' });

    if (bloodReq.status !== 'Pending') {
      return res.status(400).json({ error: `Request is already ${bloodReq.status}.` });
    }

    const recipient = await getAsync(
      'SELECT r.*, u.id as user_id, u.email, u.name FROM recipients r JOIN users u ON r.user_id = u.id WHERE r.id = ?',
      [bloodReq.recipient_id]
    );

    const now = new Date().toISOString();

    if (action === 'approve') {
      // 1. Check stock availability
      const availableUnits = await allAsync(
        `SELECT id, unit_code FROM blood_inventory 
         WHERE blood_group = ? AND status = 'Available'
         ORDER BY expiry_date ASC, donation_date ASC
         LIMIT ?`,
        [bloodReq.blood_group, bloodReq.units_requested]
      );

      if (availableUnits.length < bloodReq.units_requested) {
        return res.status(400).json({
          error: `Insufficient stock of ${bloodReq.blood_group}. Available units: ${availableUnits.length}, Requested: ${bloodReq.units_requested}. Please restock or reject/partial fulfill.`
        });
      }

      // 2. Mark FIFO units as 'Issued'
      const unitIds = availableUnits.map(u => u.id);
      for (const uid of unitIds) {
        await runAsync(`UPDATE blood_inventory SET status = 'Issued' WHERE id = ?`, [uid]);
      }

      // 3. Update request status
      await runAsync(
        `UPDATE blood_requests 
         SET status = 'Approved', units_allocated = ?, admin_notes = ?, resolved_at = ?
         WHERE id = ?`,
        [bloodReq.units_requested, admin_notes || 'Approved and units reserved for dispatch.', now, requestId]
      );

      // 4. Send notification to recipient
      if (recipient) {
        await runAsync(
          `INSERT INTO notifications (user_id, title, message, type)
           VALUES (?, ?, ?, ?)`,
          [
            recipient.user_id,
            'Blood Request APPROVED!',
            `Your request for ${bloodReq.units_requested} unit(s) of ${bloodReq.blood_group} for patient ${bloodReq.patient_name} has been approved. Allocated units: ${availableUnits.map(u => u.unit_code).join(', ')}.`,
            'success'
          ]
        );
      }

      res.json({
        message: `Request approved successfully! ${bloodReq.units_requested} unit(s) of ${bloodReq.blood_group} issued from inventory.`,
        allocatedUnits: availableUnits.map(u => u.unit_code)
      });

    } else if (action === 'reject') {
      await runAsync(
        `UPDATE blood_requests 
         SET status = 'Rejected', admin_notes = ?, resolved_at = ?
         WHERE id = ?`,
        [admin_notes || 'Declined due to supply constraints or medical review.', now, requestId]
      );

      // Notify recipient
      if (recipient) {
        await runAsync(
          `INSERT INTO notifications (user_id, title, message, type)
           VALUES (?, ?, ?, ?)`,
          [
            recipient.user_id,
            'Blood Request Declined',
            `Your request for ${bloodReq.blood_group} (${bloodReq.units_requested} units) could not be approved at this time. Reason: ${admin_notes || 'Stock constraints'}.`,
            'danger'
          ]
        );
      }

      res.json({ message: 'Request rejected.' });
    } else {
      res.status(400).json({ error: "Action must be 'approve' or 'reject'." });
    }
  } catch (error) {
    console.error('Request Action Error:', error);
    res.status(500).json({ error: 'Failed to process request.' });
  }
});

// ==========================================
// 6. SEARCH & LIVE INVENTORY LOOKUP
// ==========================================

app.get('/api/search', async (req, res) => {
  try {
    const { blood_group, city } = req.query;

    let stockQuery = `SELECT blood_group, COUNT(*) as units FROM blood_inventory WHERE status = 'Available'`;
    const stockParams = [];
    if (blood_group && blood_group !== 'All') {
      stockQuery += ` AND blood_group = ?`;
      stockParams.push(blood_group);
    }
    stockQuery += ` GROUP BY blood_group`;

    const stock = await allAsync(stockQuery, stockParams);

    // Eligible donors in city
    let donorQuery = `
      SELECT COUNT(*) as eligible_donors 
      FROM donors d 
      JOIN users u ON d.user_id = u.id 
      WHERE d.is_available = 1 AND d.age >= 18
    `;
    const donorParams = [];
    if (blood_group && blood_group !== 'All') {
      donorQuery += ` AND d.blood_group = ?`;
      donorParams.push(blood_group);
    }
    if (city && city.trim() !== '') {
      donorQuery += ` AND LOWER(u.city) LIKE LOWER(?)`;
      donorParams.push(`%${city.trim()}%`);
    }

    const donorCount = await getAsync(donorQuery, donorParams);

    res.json({
      stock,
      eligibleDonorsInArea: donorCount ? donorCount.eligible_donors : 0
    });
  } catch (error) {
    console.error('Search Error:', error);
    res.status(500).json({ error: 'Failed to execute search.' });
  }
});

// ==========================================
// 7. REPORTS & ANALYTICS DASHBOARD
// ==========================================

app.get('/api/reports/dashboard', authenticateToken, requireRoles('admin'), async (req, res) => {
  try {
    // 1. Total counts
    const totalDonors = await getAsync('SELECT COUNT(*) as val FROM donors');
    const totalUnits = await getAsync("SELECT COUNT(*) as val FROM blood_inventory WHERE status = 'Available'");
    const totalDonations = await getAsync("SELECT COUNT(*) as val FROM donations WHERE status = 'Completed'");
    const totalRequests = await getAsync('SELECT COUNT(*) as val FROM blood_requests');
    const approvedRequests = await getAsync("SELECT COUNT(*) as val FROM blood_requests WHERE status = 'Approved'");
    const pendingRequests = await getAsync("SELECT COUNT(*) as val FROM blood_requests WHERE status = 'Pending'");

    // 2. Stock distribution by group
    const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    const stockRows = await allAsync(
      "SELECT blood_group, COUNT(*) as count FROM blood_inventory WHERE status = 'Available' GROUP BY blood_group"
    );
    const stockMap = {};
    stockRows.forEach(r => { stockMap[r.blood_group] = r.count; });
    const stockDistribution = bloodGroups.map(bg => ({
      blood_group: bg,
      count: stockMap[bg] || 0
    }));

    // 3. Requests by status
    const reqStatusRows = await allAsync(
      'SELECT status, COUNT(*) as count FROM blood_requests GROUP BY status'
    );

    // 4. Monthly Donations Trend (Simulated or actual from last 6 months)
    const monthlyDonations = [
      { month: 'May 2026', count: 12 },
      { month: 'Jun 2026', count: 18 },
      { month: 'Jul 2026', count: 24 },
      { month: 'Aug 2026', count: 29 },
      { month: 'Sep 2026', count: 35 },
      { month: 'Oct 2026', count: totalDonations.val }
    ];

    res.json({
      metrics: {
        totalDonors: totalDonors.val,
        availableUnits: totalUnits.val,
        donationsCompleted: totalDonations.val,
        totalRequests: totalRequests.val,
        approvedRequests: approvedRequests.val,
        pendingRequests: pendingRequests.val,
        fulfillmentRate: totalRequests.val > 0 ? Math.round((approvedRequests.val / totalRequests.val) * 100) : 100
      },
      stockDistribution,
      requestStatuses: reqStatusRows,
      monthlyDonations
    });
  } catch (error) {
    console.error('Reports Dashboard Error:', error);
    res.status(500).json({ error: 'Failed to generate reports.' });
  }
});

// ==========================================
// 8. NOTIFICATIONS & ALERTS
// ==========================================

// Get user notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const notifications = await allAsync(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    res.json({ notifications });
  } catch (error) {
    console.error('Notifications Error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
});

// Mark notification as read
app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    await runAsync('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ message: 'Notification marked as read.' });
  } catch (error) {
    console.error('Mark Read Error:', error);
    res.status(500).json({ error: 'Failed to update notification.' });
  }
});

// Admin Broadcast Emergency Alert
app.post('/api/notifications/broadcast', authenticateToken, requireRoles('admin'), async (req, res) => {
  try {
    const { blood_group, city, message } = req.body;

    let targetUsers = await allAsync(
      `SELECT u.id FROM users u 
       JOIN donors d ON u.id = d.user_id 
       WHERE (? = 'All' OR d.blood_group = ?) 
       AND (? = '' OR LOWER(u.city) LIKE LOWER(?))`,
      [blood_group, blood_group, city || '', `%${city || ''}%`]
    );

    for (const u of targetUsers) {
      await runAsync(
        `INSERT INTO notifications (user_id, title, message, type)
         VALUES (?, ?, ?, ?)`,
        [
          u.id,
          `EMERGENCY ALERT: ${blood_group} Needed!`,
          message || `Urgent blood request for ${blood_group} in ${city || 'your area'}. If you are eligible, please visit our nearest donation center!`,
          'danger'
        ]
      );
    }

    res.json({ message: `Broadcast successfully sent to ${targetUsers.length} donors.` });
  } catch (error) {
    console.error('Broadcast Error:', error);
    res.status(500).json({ error: 'Failed to broadcast alert.' });
  }
});

// Fallback to Single Page App index.html for frontend routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server & Initialize DB
async function startServer() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🩸 BLOOD BANK MANAGEMENT SYSTEM SERVER RUNNING 🩸`);
    console.log(`URL: http://localhost:${PORT}`);
    console.log(`Role Test Accounts:`);
    console.log(`  - Admin:     admin@bloodbank.org    / password123`);
    console.log(`  - Donor:     rahul.donor@example.com / password123`);
    console.log(`  - Recipient: apollo.er@example.com   / password123`);
    console.log(`====================================================`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
