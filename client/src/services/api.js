const BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

function getAuthHeader() {
  const token = localStorage.getItem('dialo_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export const api = {
  // Register with a password
  async register(email, phone, name, password) {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, phone, name, password })
    });
    return res.json();
  },

  // Log in with a password
  async login(email, password) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
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
