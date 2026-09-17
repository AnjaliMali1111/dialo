const BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

function getAuthHeader() {
  const token = localStorage.getItem('dialo_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export const api = {
  // Request OTP by email
  async requestOtp(email, phone) {
    const res = await fetch(`${BASE_URL}/api/auth/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, phone })
    });
    return res.json();
  },

  // Verify OTP and get JWT + user
  async verifyOtp(email, phone, code, name) {
    const res = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, phone, code, name })
    });
    return res.json();
  },

  // Get current user profile
  async getMe() {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { ...getAuthHeader() }
    });
    return res.json();
  },

  // Search registered users by phone
  async searchUsers(phone) {
    const res = await fetch(`${BASE_URL}/api/users/search?phone=${encodeURIComponent(phone)}`, {
      headers: { ...getAuthHeader() }
    });
    return res.json();
  },

  // Get all conversations for current user
  async getConversations() {
    const res = await fetch(`${BASE_URL}/api/conversations`, {
      headers: { ...getAuthHeader() }
    });
    return res.json();
  },

  // Start or get conversation with peer
  async startConversation(peerPhone) {
    const res = await fetch(`${BASE_URL}/api/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ peerPhone })
    });
    return res.json();
  },

  // Get messages for a conversation
  async getMessages(conversationId) {
    const res = await fetch(`${BASE_URL}/api/conversations/${conversationId}/messages`, {
      headers: { ...getAuthHeader() }
    });
    return res.json();
  }
};
