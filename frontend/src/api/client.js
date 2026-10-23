const API_BASE = '/api';

export const authStorage = {
  getToken: () => localStorage.getItem('nvr_token'),
  setToken: (token) => localStorage.setItem('nvr_token', token),
  clearToken: () => localStorage.removeItem('nvr_token'),
  getUser: () => {
    try {
      const u = localStorage.getItem('nvr_user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },
  setUser: (user) => localStorage.setItem('nvr_user', JSON.stringify(user)),
  clearUser: () => localStorage.removeItem('nvr_user')
};

async function apiFetch(endpoint, options = {}) {
  const token = authStorage.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    authStorage.clearToken();
    authStorage.clearUser();
    window.dispatchEvent(new Event('auth_expired'));
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Auth
  async login(username, password) {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    authStorage.setToken(res.token);
    authStorage.setUser({ username: res.username, role: res.role });
    return res;
  },

  async changePassword(username, currentPassword, newPassword) {
    return apiFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        username,
        current_password: currentPassword,
        new_password: newPassword
      })
    });
  },

  async getMe() {
    return apiFetch('/auth/me');
  },

  async getStreamTicket(cameraId) {
    return apiFetch(`/auth/stream-ticket/${cameraId}`);
  },

  // User Management
  async getUsers() {
    return apiFetch('/users');
  },

  async createUser(username, password, role = 'viewer') {
    return apiFetch('/users', {
      method: 'POST',
      body: JSON.stringify({ username, password, role })
    });
  },

  async resetPassword(username, password) {
    return apiFetch(`/users/${username}/password`, {
      method: 'PUT',
      body: JSON.stringify({ password })
    });
  },

  async updateUserRole(username, role) {
    return apiFetch(`/users/${username}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role })
    });
  },

  async deleteUser(username) {
    return apiFetch(`/users/${username}`, {
      method: 'DELETE'
    });
  },

  // Cameras
  async getCameras() {
    return apiFetch('/cameras');
  },

  async getCamera(id) {
    return apiFetch(`/cameras/${id}`);
  },

  async createCamera(data) {
    return apiFetch('/cameras', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateCamera(id, data) {
    return apiFetch(`/cameras/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteCamera(id) {
    return apiFetch(`/cameras/${id}`, {
      method: 'DELETE'
    });
  },

  async restartCamera(id) {
    return apiFetch(`/cameras/${id}/restart`, {
      method: 'POST'
    });
  },

  async triggerTestAlert(id) {
    return apiFetch(`/cameras/${id}/test-alert`, {
      method: 'POST'
    });
  },

  async getCameraTelemetry(id) {
    return apiFetch(`/cameras/${id}/telemetry`);
  },

  async captureSnapshot(id) {
    const token = authStorage.getToken();
    const response = await fetch(`${API_BASE}/cameras/${id}/snapshot`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) throw new Error('Failed to take snapshot');
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },

  // Discovery
  async scanNetwork() {
    return apiFetch('/discovery/scan', { method: 'POST' });
  },

  async verifyCredentials(data) {
    return apiFetch('/discovery/verify', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async testStream(rtspUrl) {
    return apiFetch('/discovery/test-stream', {
      method: 'POST',
      body: JSON.stringify({ rtsp_url: rtspUrl })
    });
  },

  // Events
  async getEvents(limit = 100, cameraId = null, startTime = null, endTime = null) {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit);
    if (cameraId) params.append('camera_id', cameraId);
    if (startTime) params.append('start_time', startTime);
    if (endTime) params.append('end_time', endTime);
    return apiFetch(`/events?${params.toString()}`);
  },

  async deleteEvent(id) {
    return apiFetch(`/events/${id}`, {
      method: 'DELETE'
    });
  },

  // System Settings & Control Panel
  async getSettings() {
    return apiFetch('/settings');
  },

  async getHardwareCapabilities() {
    return apiFetch('/settings/hardware-capabilities');
  },

  async updateSettings(settings) {
    return apiFetch('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  },

  async applyGlobalThreshold() {
    return apiFetch('/settings/apply-global-threshold', {
      method: 'POST'
    });
  },

  async testAiVision(config) {
    return apiFetch('/settings/test-ai-vision', {
      method: 'POST',
      body: JSON.stringify(config)
    });
  },

  async testNotification(service, payload) {
    return apiFetch(`/settings/test-notification/${service}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async purgeStorage() {
    return apiFetch('/settings/purge-storage', {
      method: 'POST'
    });
  },

  async getDailyBriefing() {
    return apiFetch('/briefing/today');
  },

  async generateDailyBriefing() {
    return apiFetch('/briefing/generate', {
      method: 'POST'
    });
  }
};
