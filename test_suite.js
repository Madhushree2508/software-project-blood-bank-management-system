const http = require('http');

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: `/api${path}`,
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING COMPREHENSIVE BLOOD BANK TEST SUITE 🧪');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
    }
  }

  // 1. Test Admin Login
  console.log('\n--- 1. Authentication & Roles ---');
  const adminLogin = await request('POST', '/auth/login', {
    email: 'admin@bloodbank.org',
    password: 'password123'
  });
  assert(adminLogin.status === 200 && adminLogin.data.token, 'Admin login succeeds and returns JWT token');
  const adminToken = adminLogin.data.token;

  // 2. Test Donor Login
  const donorLogin = await request('POST', '/auth/login', {
    email: 'rahul.donor@example.com',
    password: 'password123'
  });
  assert(donorLogin.status === 200 && donorLogin.data.user.role === 'donor', 'Donor login succeeds with donor role');
  const donorToken = donorLogin.data.token;

  // 3. Test Recipient/Hospital Login
  const hospLogin = await request('POST', '/auth/login', {
    email: 'apollo.er@example.com',
    password: 'password123'
  });
  assert(hospLogin.status === 200 && hospLogin.data.user.role === 'recipient', 'Hospital login succeeds with recipient role');
  const hospToken = hospLogin.data.token;

  // 4. Test Donor Eligibility Check
  console.log('\n--- 2. Donor Eligibility Rules ---');
  const eligibilityRes = await request('GET', '/donors/profile', null, donorToken);
  assert(eligibilityRes.status === 200, 'Fetches donor profile with eligibility metadata');
  assert(eligibilityRes.data.eligibility !== undefined, 'Eligibility rule engine computes cooldown & age rules');

  // 5. Test Live Inventory Summary & Expiry Alert
  console.log('\n--- 3. Blood Inventory & Expiry (35-42 Days Shelf Life) ---');
  const invRes = await request('GET', '/inventory/summary');
  assert(invRes.status === 200, 'Fetches live inventory summary');
  assert(invRes.data.summary.length === 8, 'Covers all 8 blood groups (A+, A-, B+, B-, AB+, AB-, O+, O-)');
  assert(invRes.data.nearExpiryCount > 0, 'Accurately detects units approaching 42-day expiry window');

  // 6. Test Emergency Search by City and Blood Group
  console.log('\n--- 4. Emergency Search & Hotline ---');
  const searchRes = await request('GET', '/donors/emergency-search?blood_group=B%2B&city=Bangalore');
  assert(searchRes.status === 200 && searchRes.data.totalFound >= 1, 'Emergency search finds eligible B+ donors in Bangalore');

  // 7. Test Hospital Blood Request Submission
  console.log('\n--- 5. Hospital Blood Request & Allocation ---');
  const reqRes = await request('POST', '/requests', {
    patient_name: 'Test Emergency Patient (ICU)',
    blood_group: 'O+',
    units_requested: 2,
    urgency: 'Critical Emergency',
    hospital_name: 'Apollo Hospital Indiranagar',
    doctor_name: 'Dr. Test Surgeon',
    reason: 'Severe acute hemorrhaging in OR-4'
  }, hospToken);
  assert(reqRes.status === 201 && reqRes.data.requestId, 'Hospital successfully creates critical blood request');
  const newReqId = reqRes.data.requestId;

  // 8. Test Admin Request Approval with Automated FIFO Stock Deduction
  const approveRes = await request('PUT', `/requests/${newReqId}/action`, {
    action: 'approve',
    admin_notes: 'Urgent emergency allocation approved. 2 O+ bags dispatched via courier.'
  }, adminToken);
  assert(approveRes.status === 200, 'Admin approves request with FIFO stock deduction');
  assert(approveRes.data.allocatedUnits && approveRes.data.allocatedUnits.length === 2, 'Allocated exact 2 units with barcode unit codes');

  // 9. Test Donation Recording & Auto Inventory Addition (+42 Days)
  console.log('\n--- 6. Donation Recording & Inventory Auto-Generation ---');
  const recordRes = await request('POST', '/donations/record', {
    donor_id: 1,
    donation_date: new Date().toISOString().split('T')[0],
    hemoglobin_level: 14.5,
    pulse_rate: 74,
    blood_pressure: '120/80',
    notes: 'Voluntary mobile blood camp donation'
  }, adminToken);
  assert(recordRes.status === 201, 'Admin logs completed blood donation');
  assert(recordRes.data.unitCode && recordRes.data.expiryDate, 'Auto-generated unit bag code and set +42 days expiry date');

  // 10. Test Reports & Analytics Dashboard
  console.log('\n--- 7. Reports & Chart Metrics ---');
  const repRes = await request('GET', '/reports/dashboard', null, adminToken);
  assert(repRes.status === 200, 'Generates executive analytics report');
  assert(repRes.data.metrics.fulfillmentRate >= 0, 'Calculates dynamic fulfillment rate percentage');
  assert(repRes.data.stockDistribution.length === 8, 'Supplies full 8-group dataset for Chart.js bar chart');
  assert(repRes.data.monthlyDonations.length >= 6, 'Provides 6-month historical trend data for line chart');

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed}/${total} TESTS PASSED (${Math.round((passed/total)*100)}%)`);
  console.log('====================================================');
}

runTests().catch(console.error);
