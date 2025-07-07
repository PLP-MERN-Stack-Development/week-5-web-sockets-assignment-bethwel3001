import { io } from 'socket.io-client';

const URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:5000';

export const socket = io(URL, {
  autoConnect: false,
  withCredentials: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});