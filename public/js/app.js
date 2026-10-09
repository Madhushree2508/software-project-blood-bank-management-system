/**
 * Hemolink - Application Controller & User Interface Logic
 */

let appState = {
  currentUser: null,
  activeView: 'home',
  inventorySummary: null,
  allDonors: [],
  notifications: []
};

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupDemoRoleSwitcher();
  setupModals();
  setupForms();

  // Check login session
  const storedUser = getCurrentUser();
  if (storedUser && getToken()) {
    try {
      const meData = await api.getMe();
      appState.currentUser = meData.user;
      setCurrentUser(meData.user);
    } catch (err) {
      console.warn('Session expired or invalid, clearing credentials.');
      setToken(null);
      setCurrentUser(null);
    }
  }

  updateAuthUI();
  await loadHomeData();

  // Default to appropriate view if already logged in
  if (appState.currentUser) {
    if (appState.currentUser.role === 'admin') switchView('admin');
    else if (appState.currentUser.role === 'donor') switchView('donor');
    else if (appState.currentUser.role === 'recipient') switchView('recipient');
  } else {
    switchView('home');
  }

  // Poll notifications if user logged in
  if (appState.currentUser) {
    loadNotifications();
  }
});

// Navigation Handling
function setupNavigation() {
  document.querySelectorAll('[data-target-view]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const view = btn.getAttribute('data-target-view');
      switchView(view);
    });
  });

  // Mobile menu toggle if needed
  const navBrand = document.querySelector('.brand');
  if (navBrand) {
    navBrand.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('home');
    });
  }
}

function switchView(viewName) {
  appState.activeView = viewName;

  // Update Nav links active state
  document.querySelectorAll('.nav-links button').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-target-view') === viewName);
  });

  // Switch panels
  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.remove('active');
  });

  const activePanel = document.getElementById(`view-${viewName}`);
  if (activePanel) {
    activePanel.classList.add('active');
  }

  // Load view-specific dynamic content
  if (viewName === 'home') loadHomeData();
  else if (viewName === 'donor') loadDonorPortal();
  else if (viewName === 'recipient') loadRecipientPortal();
  else if (viewName === 'admin') loadAdminPortal();
  else if (viewName === 'reports') loadReportsView();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 1-Click Demo Role Switcher for Presentations
function setupDemoRoleSwitcher() {
  document.querySelectorAll('.demo-role-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const role = btn.getAttribute('data-demo-role');

      // Update active state on switcher
      document.querySelectorAll('.demo-role-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (role === 'guest') {
        setToken(null);
        setCurrentUser(null);
        appState.currentUser = null;
        updateAuthUI();
        switchView('home');
        showToast('Switched to Guest mode', 'info');
        return;
      }

      let email = '';
      if (role === 'admin') email = 'admin@bloodbank.org';
      else if (role === 'donor') email = 'rahul.donor@example.com';
      else if (role === 'recipient') email = 'apollo.er@example.com';

      try {
        const res = await api.login(email, 'password123');
        appState.currentUser = res.user;
        updateAuthUI();
        showToast(`Logged in as ${res.user.name} (${res.user.role.toUpperCase()})`, 'success');

        if (role === 'admin') switchView('admin');
        else if (role === 'donor') switchView('donor');
        else if (role === 'recipient') switchView('recipient');

        loadNotifications();
      } catch (err) {
        showToast(`Demo switch failed: ${err.message}`, 'error');
      }
    });
  });
}

// Update Top Navigation Bar Based On Auth
function updateAuthUI() {
  const user = appState.currentUser;
  const userArea = document.getElementById('user-nav-area');
  const roleButtons = document.querySelectorAll('.role-restricted-nav');

  // Update restricted tab visibility
  roleButtons.forEach(btn => {
    const roleReq = btn.getAttribute('data-require-role');
    if (!user) {
      btn.style.display = 'none';
    } else {
      btn.style.display = (user.role === roleReq || user.role === 'admin') ? 'inline-flex' : 'none';
    }
  });

  if (user) {
    userArea.innerHTML = `
      <div class="user-badge">
        <div class="user-avatar">${user.name.charAt(0).toUpperCase()}</div>
        <div class="user-info-text">
          <span class="user-name-tag">${user.name}</span>
          <span class="user-role-tag">${user.role}</span>
        </div>
      </div>
      <button class="btn btn-outline btn-sm" id="btn-logout" title="Log Out">
        <span>🚪</span> Logout
      </button>
    `;

    document.getElementById('btn-logout').addEventListener('click', () => {
      api.logout();
    });
  } else {
    userArea.innerHTML = `
      <button class="btn btn-primary btn-sm" id="btn-open-login">
        <span>🔑</span> Login / Register
      </button>
    `;
    document.getElementById('btn-open-login').addEventListener('click', () => {
      openModal('modal-auth');
    });
  }
}

// ==========================================
// 1. HOME VIEW & LIVE BLOOD STOCK
// ==========================================
async function loadHomeData() {
  try {
    const data = await api.getInventorySummary();
    appState.inventorySummary = data;

    // Render Stats
    document.getElementById('stat-total-stock').innerText = `${data.totalAvailableUnits} Units`;
    document.getElementById('stat-near-expiry').innerText = `${data.nearExpiryCount} Units`;

    // Render 8 Blood Groups Matrix
    const matrixGrid = document.getElementById('home-blood-matrix');
    if (matrixGrid) {
      matrixGrid.innerHTML = data.summary.map(item => {
        const percentage = Math.min(Math.round((item.units_available / 12) * 100), 100);
        let statusClass = 'fill-safe';
        if (item.units_available < 3) statusClass = 'fill-critical';
        else if (item.units_available < 6) statusClass = 'fill-low';

        return `
          <div class="blood-tile" onclick="filterByBloodGroup('${item.blood_group}')">
            ${item.is_low_stock ? '<span class="low-stock-alert-tag">LOW</span>' : ''}
            <div class="blood-group-tag">${item.blood_group}</div>
            <div class="blood-count-badge">${item.units_available} <small style="font-size: 0.75rem;">Units</small></div>
            <div class="blood-unit-label">${item.units_available > 0 ? 'In Stock' : 'Depleted'}</div>
            <div class="blood-status-bar">
              <div class="blood-status-fill ${statusClass}" style="width: ${percentage}%;"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Failed to load inventory summary:', err);
  }
}

function filterByBloodGroup(bg) {
  const sel = document.getElementById('search-blood-group');
  if (sel) sel.value = bg;
  handleSearch();
}

// Handle Blood Stock and Emergency Donor Search
async function handleSearch() {
  const bg = document.getElementById('search-blood-group').value;
  const city = document.getElementById('search-city').value;
  const resultsContainer = document.getElementById('search-results-area');

  try {
    resultsContainer.innerHTML = '<div style="padding: 20px; text-align: center;">Searching live inventory & donor network...</div>';
    
    // Fetch stock and emergency donors
    const [searchRes, donorRes] = await Promise.all([
      api.searchStockAndDonors(bg, city),
      api.searchEmergencyDonors(bg, city)
    ]);

    let html = `
      <div style="margin-top: 18px; border-top: 1px solid var(--border-color); padding-top: 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
          <h4 style="font-size: 1.1rem;">Search Results for ${bg} ${city ? `in ${city}` : ''}</h4>
          <span class="badge badge-info">${donorRes.totalFound} Eligible Emergency Donors Available</span>
        </div>
    `;

    if (donorRes.donors && donorRes.donors.length > 0) {
      html += `
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; margin-top: 10px;">
          ${donorRes.donors.map(d => `
            <div style="background: #fff; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 14px; box-shadow: var(--shadow-sm);">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="font-size: 1rem;">${d.name}</strong>
                <span class="badge badge-danger">${d.blood_group}</span>
              </div>
              <div style="font-size: 0.85rem; color: var(--text-muted); margin: 6px 0;">
                📍 ${d.city} &bull; Age: ${d.age}
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                <span style="font-size: 0.88rem; font-weight: 700; color: var(--text-main);">📞 ${d.phone}</span>
                <a href="tel:${d.phone}" class="btn btn-outline btn-sm" style="padding: 4px 8px;">Call</a>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      html += `
        <div style="padding: 20px; background: #fff; border-radius: var(--radius-sm); border: 1px dashed var(--border-color); text-align: center; color: var(--text-muted);">
          No active emergency donors found matching criteria. Please submit a hospital request or check back shortly.
        </div>
      `;
    }

    html += `</div>`;
    resultsContainer.innerHTML = html;
  } catch (err) {
    resultsContainer.innerHTML = `<div style="color: var(--danger); padding: 10px;">Search failed: ${err.message}</div>`;
  }
}

// ==========================================
// 2. DONOR PORTAL & ELIGIBILITY CHECK
// ==========================================
async function loadDonorPortal() {
  if (!appState.currentUser || appState.currentUser.role !== 'donor') {
    showToast('Please login as a donor to view this portal.', 'warning');
    return;
  }

  try {
    const profileData = await api.getDonorProfile();
    const donor = profileData.donor;
    const eligibility = profileData.eligibility;

    // Profile details
    document.getElementById('donor-name').innerText = donor.name;
    document.getElementById('donor-blood-badge').innerText = donor.blood_group;
    document.getElementById('donor-age').innerText = `${donor.age} yrs`;
    document.getElementById('donor-phone').innerText = donor.phone || 'N/A';
    document.getElementById('donor-city').innerText = donor.city || 'N/A';
    document.getElementById('donor-last-date').innerText = donor.last_donation_date || 'Never (First-time Donor)';

    // Dynamic Eligibility Banner & Calculator
    const eligBanner = document.getElementById('donor-eligibility-card');
    if (eligibility.isEligible) {
      eligBanner.className = 'eligibility-banner eligible';
      eligBanner.innerHTML = `
        <div class="eligibility-info">
          <h3>✅ Eligible to Donate Today</h3>
          <p>You meet all medical criteria (age &ge; 18 and minimum 90-day cooldown interval satisfied).</p>
        </div>
        <button class="btn btn-success" id="btn-donor-book-now">
          <span>📅</span> Book Donation Slot
        </button>
      `;
    } else {
      eligBanner.className = 'eligibility-banner ineligible';
      eligBanner.innerHTML = `
        <div class="eligibility-info">
          <h3>⏳ Donation Cooldown Active</h3>
          <p>${eligibility.reasons.join(' ')}</p>
          ${eligibility.daysUntilEligible ? `<div style="font-weight: 700; margin-top: 4px;">Next eligible in: ${eligibility.daysUntilEligible} day(s) (${eligibility.nextEligibleDate})</div>` : ''}
        </div>
        <button class="btn btn-outline" disabled style="opacity: 0.6; cursor: not-allowed;">
          Slot Locked
        </button>
      `;
    }

    const bookBtn = document.getElementById('btn-donor-book-now');
    if (bookBtn) {
      bookBtn.addEventListener('click', () => {
        openModal('modal-book-donation');
      });
    }

    // Donation History
    const historyData = await api.getMyDonations();
    const historyTbody = document.getElementById('donor-history-table-body');
    if (historyData.donations && historyData.donations.length > 0) {
      historyTbody.innerHTML = historyData.donations.map(d => `
        <tr>
          <td><strong>${d.donation_date}</strong></td>
          <td><span class="badge badge-danger">${d.blood_group}</span></td>
          <td>${d.units_collected} Unit (450ml)</td>
          <td>${d.hemoglobin_level ? `${d.hemoglobin_level} g/dL` : '14.0 g/dL'}</td>
          <td><span class="badge badge-success">${d.status}</span></td>
          <td>${d.notes || 'Routine Donation'}</td>
        </tr>
      `).join('');
    } else {
      historyTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No past donations recorded yet.</td></tr>`;
    }

  } catch (err) {
    showToast(`Failed to load donor profile: ${err.message}`, 'error');
  }
}

// ==========================================
// 3. RECIPIENT & HOSPITAL PORTAL
// ==========================================
async function loadRecipientPortal() {
  if (!appState.currentUser || (appState.currentUser.role !== 'recipient' && appState.currentUser.role !== 'admin')) {
    showToast('Please login as a Hospital/Recipient to access this portal.', 'warning');
    return;
  }

  try {
    const data = await api.getMyRequests();
    const reqTbody = document.getElementById('recipient-requests-table-body');
    
    if (data.requests && data.requests.length > 0) {
      reqTbody.innerHTML = data.requests.map(r => {
        let statusBadge = 'badge-warning';
        if (r.status === 'Approved') statusBadge = 'badge-success';
        else if (r.status === 'Rejected') statusBadge = 'badge-danger';

        let urgencyBadge = 'badge-info';
        if (r.urgency === 'Critical Emergency') urgencyBadge = 'badge-danger';
        else if (r.urgency === 'Urgent') urgencyBadge = 'badge-warning';

        return `
          <tr>
            <td>#REQ-${r.id}</td>
            <td><strong>${r.patient_name}</strong></td>
            <td><span class="badge badge-danger">${r.blood_group}</span></td>
            <td><strong>${r.units_requested}</strong> Unit(s)</td>
            <td><span class="badge ${urgencyBadge}">${r.urgency}</span></td>
            <td>${r.request_date.split(' ')[0]}</td>
            <td><span class="badge ${statusBadge}">${r.status}</span></td>
            <td><small style="color: var(--text-muted);">${r.admin_notes || 'Pending evaluation'}</small></td>
          </tr>
        `;
      }).join('');
    } else {
      reqTbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">No blood requests submitted yet. Use the "Request Blood" button above.</td></tr>`;
    }
  } catch (err) {
    showToast(`Failed to load requests: ${err.message}`, 'error');
  }
}

// ==========================================
// 4. ADMIN COMMAND CENTER & WORKFLOWS
// ==========================================
async function loadAdminPortal() {
  if (!appState.currentUser || appState.currentUser.role !== 'admin') {
    showToast('Admin privilege required.', 'error');
    return;
  }

  try {
    // 1. Fetch pending requests
    const reqData = await api.getAllRequests();
    const adminReqTbody = document.getElementById('admin-requests-table-body');
    
    adminReqTbody.innerHTML = reqData.requests.map(r => {
      let statusBadge = 'badge-warning';
      if (r.status === 'Approved') statusBadge = 'badge-success';
      else if (r.status === 'Rejected') statusBadge = 'badge-danger';

      const isPending = r.status === 'Pending';

      return `
        <tr>
          <td><strong>#REQ-${r.id}</strong></td>
          <td>${r.hospital_name}<br><small style="color: var(--text-muted);">${r.requester_name}</small></td>
          <td><strong>${r.patient_name}</strong></td>
          <td><span class="badge badge-danger" style="font-size: 0.9rem;">${r.blood_group}</span></td>
          <td>${r.units_requested} unit(s)</td>
          <td><span class="badge ${r.urgency === 'Critical Emergency' ? 'badge-danger' : 'badge-warning'}">${r.urgency}</span></td>
          <td><span class="badge ${statusBadge}">${r.status}</span></td>
          <td>
            ${isPending ? `
              <div style="display: flex; gap: 6px;">
                <button class="btn btn-success btn-sm" onclick="openActionModal(${r.id}, 'approve', '${r.blood_group}', ${r.units_requested})">
                  ✓ Approve
                </button>
                <button class="btn btn-danger btn-sm" onclick="openActionModal(${r.id}, 'reject', '${r.blood_group}', ${r.units_requested})">
                  ✕ Reject
                </button>
              </div>
            ` : `<span style="font-size: 0.8rem; color: var(--text-muted);">${r.resolved_at ? r.resolved_at.split('T')[0] : 'Resolved'}</span>`}
          </td>
        </tr>
      `;
    }).join('');

    // 2. Fetch inventory units
    const invData = await api.getInventoryUnits();
    const invTbody = document.getElementById('admin-inventory-table-body');
    
    invTbody.innerHTML = invData.units.slice(0, 15).map(u => {
      let statusBadge = 'badge-success';
      if (u.status === 'Expired') statusBadge = 'badge-danger';
      else if (u.status === 'Issued') statusBadge = 'badge-info';

      return `
        <tr>
          <td><code>${u.unit_code}</code></td>
          <td><span class="badge badge-danger">${u.blood_group}</span></td>
          <td>${u.donation_date}</td>
          <td><strong>${u.expiry_date}</strong></td>
          <td>${u.storage_location}</td>
          <td><span class="badge ${statusBadge}">${u.status}</span></td>
        </tr>
      `;
    }).join('');

    // 3. Fetch registered donors
    const donorData = await api.getAllDonors();
    appState.allDonors = donorData.donors;
    const donorTbody = document.getElementById('admin-donors-table-body');
    
    donorTbody.innerHTML = donorData.donors.map(d => `
      <tr>
        <td><strong>${d.name}</strong></td>
        <td><span class="badge badge-danger">${d.blood_group}</span></td>
        <td>${d.age} / ${d.gender || 'M'}</td>
        <td>${d.phone}</td>
        <td>${d.city}</td>
        <td>${d.last_donation_date || 'Never'}</td>
        <td>
          <span class="badge ${d.eligibility.isEligible ? 'badge-success' : 'badge-warning'}">
            ${d.eligibility.isEligible ? 'Eligible' : 'Cooldown'}
          </span>
        </td>
      </tr>
    `).join('');

    // Populate donor select in donation intake form
    const intakeDonorSelect = document.getElementById('intake-donor-select');
    if (intakeDonorSelect) {
      intakeDonorSelect.innerHTML = donorData.donors.map(d => `
        <option value="${d.donor_id}">${d.name} (${d.blood_group} - ${d.city})</option>
      `).join('');
    }

  } catch (err) {
    showToast(`Failed to load admin portal: ${err.message}`, 'error');
  }
}

// Request Action Modal Trigger
let currentActionRequestId = null;
let currentActionType = null;

function openActionModal(reqId, action, bloodGroup, units) {
  currentActionRequestId = reqId;
  currentActionType = action;

  document.getElementById('action-modal-title').innerText = action === 'approve' 
    ? `Approve Request #${reqId}` 
    : `Reject Request #${reqId}`;
  
  document.getElementById('action-modal-desc').innerText = action === 'approve'
    ? `Allocating ${units} units of ${bloodGroup} from cold storage via FIFO rule.`
    : `State reason for declining this request.`;

  document.getElementById('action-notes').value = action === 'approve' 
    ? 'Stock verified and units allocated for immediate dispatch.' 
    : 'Insufficient compatible units available.';

  openModal('modal-request-action');
}

// Execute Admin Request Approval or Rejection
async function submitRequestAction() {
  const notes = document.getElementById('action-notes').value;
  try {
    const res = await api.actionRequest(currentActionRequestId, currentActionType, notes);
    showToast(res.message, 'success');
    closeModal('modal-request-action');
    await loadAdminPortal();
    await loadHomeData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Discard expired units
async function handleDiscardExpired() {
  if (!confirm('Are you sure you want to discard all expired blood units from active inventory?')) return;
  try {
    const res = await api.discardExpiredUnits();
    showToast(res.message, 'success');
    loadAdminPortal();
    loadHomeData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ==========================================
// 5. REPORTS & ANALYTICS VIEW
// ==========================================
async function loadReportsView() {
  try {
    const data = await api.getReportsDashboard();
    
    // Update KPI counters
    document.getElementById('rep-total-donations').innerText = data.metrics.donationsCompleted;
    document.getElementById('rep-fulfillment-rate').innerText = `${data.metrics.fulfillmentRate}%`;
    document.getElementById('rep-total-requests').innerText = data.metrics.totalRequests;
    document.getElementById('rep-active-units').innerText = data.metrics.availableUnits;

    // Render Charts
    renderReportsCharts(data);
  } catch (err) {
    showToast(`Failed to load reports: ${err.message}`, 'error');
  }
}

// ==========================================
// 6. NOTIFICATION SYSTEM
// ==========================================
async function loadNotifications() {
  try {
    const data = await api.getNotifications();
    appState.notifications = data.notifications;
    const unreadCount = data.notifications.filter(n => !n.is_read).length;
    
    const badge = document.getElementById('notification-unread-count');
    if (badge) {
      badge.innerText = unreadCount;
      badge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
    }

    const list = document.getElementById('notification-list');
    if (list) {
      if (data.notifications.length === 0) {
        list.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-muted);">No new notifications.</div>`;
      } else {
        list.innerHTML = data.notifications.map(n => `
          <div class="notification-item ${n.is_read ? '' : 'unread'}" onclick="markNotificationAsRead(${n.id})" style="padding: 12px; border-bottom: 1px solid var(--border-color); cursor: pointer;">
            <div style="font-weight: 700; font-size: 0.88rem; color: var(--text-main);">${n.title}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 2px;">${n.message}</div>
            <div style="font-size: 0.7rem; color: var(--text-light); margin-top: 4px;">${n.created_at}</div>
          </div>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Error fetching notifications:', err);
  }
}

async function markNotificationAsRead(id) {
  try {
    await api.markNotificationRead(id);
    loadNotifications();
  } catch (e) {
    console.error(e);
  }
}

// ==========================================
// 7. MODALS & FORMS BINDINGS
// ==========================================
function setupModals() {
  // Modal close triggers
  document.querySelectorAll('.modal-close, [data-modal-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
    });
  });

  // Open modals via data attributes
  document.querySelectorAll('[data-open-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-open-modal');
      openModal(modalId);
    });
  });

  // Close when clicking outside modal box
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove('open');
      }
    });
  });
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('open');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

function setupForms() {
  // 1. Search Form
  const searchBtn = document.getElementById('btn-run-search');
  if (searchBtn) {
    searchBtn.addEventListener('click', handleSearch);
  }

  // 2. Auth Form (Login & Register toggle)
  const authToggleBtn = document.getElementById('btn-toggle-auth-mode');
  const authSubmitBtn = document.getElementById('btn-auth-submit');
  let isRegisterMode = false;

  if (authToggleBtn) {
    authToggleBtn.addEventListener('click', () => {
      isRegisterMode = !isRegisterMode;
      document.getElementById('auth-modal-title').innerText = isRegisterMode ? 'Create Account' : 'Account Login';
      document.getElementById('register-extra-fields').style.display = isRegisterMode ? 'block' : 'none';
      authSubmitBtn.innerText = isRegisterMode ? 'Register' : 'Login';
      authToggleBtn.innerText = isRegisterMode ? 'Already have an account? Login' : "Don't have an account? Register";
    });
  }

  const roleSelect = document.getElementById('reg-role');
  if (roleSelect) {
    roleSelect.addEventListener('change', (e) => {
      const role = e.target.value;
      document.getElementById('donor-fields').style.display = (role === 'donor') ? 'block' : 'none';
      document.getElementById('recipient-fields').style.display = (role === 'recipient') ? 'block' : 'none';
    });
  }

  const authForm = document.getElementById('form-auth');
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('auth-email').value;
      const password = document.getElementById('auth-password').value;

      try {
        if (!isRegisterMode) {
          const res = await api.login(email, password);
          appState.currentUser = res.user;
          updateAuthUI();
          closeModal('modal-auth');
          showToast(`Welcome back, ${res.user.name}!`, 'success');
          if (res.user.role === 'admin') switchView('admin');
          else if (res.user.role === 'donor') switchView('donor');
          else if (res.user.role === 'recipient') switchView('recipient');
        } else {
          const payload = {
            name: document.getElementById('reg-name').value,
            email,
            password,
            role: document.getElementById('reg-role').value,
            phone: document.getElementById('reg-phone').value,
            city: document.getElementById('reg-city').value,
            blood_group: document.getElementById('reg-blood-group').value,
            age: document.getElementById('reg-age').value,
            hospital_name: document.getElementById('reg-hospital').value
          };
          const res = await api.register(payload);
          appState.currentUser = res.user;
          updateAuthUI();
          closeModal('modal-auth');
          showToast(`Account registered successfully!`, 'success');
          if (res.user.role === 'admin') switchView('admin');
          else if (res.user.role === 'donor') switchView('donor');
          else switchView('recipient');
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 3. New Blood Request Form
  const reqForm = document.getElementById('form-blood-request');
  if (reqForm) {
    reqForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        patient_name: document.getElementById('req-patient-name').value,
        blood_group: document.getElementById('req-blood-group').value,
        units_requested: document.getElementById('req-units').value,
        urgency: document.getElementById('req-urgency').value,
        hospital_name: document.getElementById('req-hospital-name').value,
        doctor_name: document.getElementById('req-doctor-name').value,
        reason: document.getElementById('req-reason').value
      };

      try {
        const res = await api.createBloodRequest(payload);
        showToast(res.message, 'success');
        closeModal('modal-blood-request');
        reqForm.reset();
        loadRecipientPortal();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 4. Book Donation Slot Form
  const bookForm = document.getElementById('form-book-donation');
  if (bookForm) {
    bookForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        donation_date: document.getElementById('book-date').value,
        notes: document.getElementById('book-notes').value
      };

      try {
        const res = await api.bookDonationSlot(payload);
        showToast(res.message, 'success');
        closeModal('modal-book-donation');
        bookForm.reset();
        loadDonorPortal();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 5. Admin Log Donation Intake Form
  const intakeForm = document.getElementById('form-intake-donation');
  if (intakeForm) {
    intakeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        donor_id: document.getElementById('intake-donor-select').value,
        donation_date: document.getElementById('intake-date').value,
        hemoglobin_level: parseFloat(document.getElementById('intake-hb').value),
        blood_pressure: document.getElementById('intake-bp').value,
        pulse_rate: parseInt(document.getElementById('intake-pulse').value, 10),
        notes: document.getElementById('intake-notes').value
      };

      try {
        const res = await api.recordDonation(payload);
        showToast(res.message, 'success');
        closeModal('modal-intake-donation');
        intakeForm.reset();
        loadAdminPortal();
        loadHomeData();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 6. Request Action Confirmation
  const btnConfirmAction = document.getElementById('btn-confirm-action');
  if (btnConfirmAction) {
    btnConfirmAction.addEventListener('click', submitRequestAction);
  }

  // 7. Discard Expired Action
  const btnDiscard = document.getElementById('btn-discard-expired');
  if (btnDiscard) {
    btnDiscard.addEventListener('click', handleDiscardExpired);
  }
}
