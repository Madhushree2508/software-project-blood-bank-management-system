/**
 * Hemolink - Blood Bank Management System API Client
 */

const API_BASE = '/api';

// Token Storage Helpers
function getToken() {
  return localStorage.getItem('hemolink_token');
}

function setToken(token) {
  if (token) localStorage.setItem('hemolink_token', token);
  else localStorage.removeItem('hemolink_token');
}

function getCurrentUser() {
  try {
    const raw = localStorage.getItem('hemolink_user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setCurrentUser(user) {
  if (user) localStorage.setItem('hemolink_user', JSON.stringify(user));
  else localStorage.removeItem('hemolink_user');
}

// Toast Notification Engine
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '⚠️';
  if (type === 'warning') icon = '🔔';

  toast.innerHTML = `<span>${icon}</span> <div>${message}</div>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Universal Fetch Wrapper with Auth Header
async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data.error || (data.reasons && data.reasons.join(' ')) || 'An error occurred';
      throw new Error(errMsg);
    }

    return data;
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error);
    throw error;
  }
}

// API Endpoints
const api = {
  // Auth
  login: async (email, password) => {
    const res = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    setToken(res.token);
    setCurrentUser(res.user);
    return res;
  },

  register: async (payload) => {
    const res = await request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    setToken(res.token);
    setCurrentUser(res.user);
    return res;
  },

  getMe: async () => {
    return await request('/auth/me');
  },

  logout: () => {
    setToken(null);
    setCurrentUser(null);
    window.location.reload();
  },

  // Inventory
  getInventorySummary: async () => {
    return await request('/inventory/summary');
  },

  getInventoryUnits: async (blood_group = 'All', status = 'All') => {
    return await request(`/inventory/units?blood_group=${encodeURIComponent(blood_group)}&status=${encodeURIComponent(status)}`);
  },

  discardExpiredUnits: async () => {
    return await request('/inventory/discard-expired', { method: 'POST' });
  },

  // Donors
  getDonorProfile: async () => {
    return await request('/donors/profile');
  },

  updateDonorProfile: async (payload) => {
    return await request('/donors/profile', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  getAllDonors: async () => {
    return await request('/donors');
  },

  searchEmergencyDonors: async (blood_group = 'All', city = '') => {
    return await request(`/donors/emergency-search?blood_group=${encodeURIComponent(blood_group)}&city=${encodeURIComponent(city)}`);
  },

  // Donations
  bookDonationSlot: async (payload) => {
    return await request('/donations/book', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  recordDonation: async (payload) => {
    return await request('/donations/record', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  getMyDonations: async () => {
    return await request('/donations/my');
  },

  getAllDonations: async () => {
    return await request('/donations/all');
  },

  // Requests
  createBloodRequest: async (payload) => {
    return await request('/requests', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  getMyRequests: async () => {
    return await request('/requests/my');
  },

  getAllRequests: async () => {
    return await request('/requests/all');
  },

  actionRequest: async (id, action, admin_notes = '') => {
    return await request(`/requests/${id}/action`, {
      method: 'PUT',
      body: JSON.stringify({ action, admin_notes })
    });
  },

  // Search
  searchStockAndDonors: async (blood_group = 'All', city = '') => {
    return await request(`/search?blood_group=${encodeURIComponent(blood_group)}&city=${encodeURIComponent(city)}`);
  },

  // Reports
  getReportsDashboard: async () => {
    return await request('/reports/dashboard');
  },

  // Notifications
  getNotifications: async () => {
    return await request('/notifications');
  },

  markNotificationRead: async (id) => {
    return await request(`/notifications/${id}/read`, { method: 'PUT' });
  },

  broadcastAlert: async (payload) => {
    return await request('/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
};
