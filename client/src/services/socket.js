import { io } from 'socket.io-client';

// In development, backend runs on port 5000
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

export const socket = io(SERVER_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});
