require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { createServer } = require('http');

const app = express();

// Enhanced CORS configuration
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));

const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true,
  }
});

const users = {};
const messageHistory = [];
const MESSAGE_LIMIT = 100;

// Middleware to verify origin
io.use((socket, next) => {
  const origin = socket.handshake.headers.origin;
  const allowedOrigin = process.env.CLIENT_URL || 'http://localhost:3000';
  
  if (origin === allowedOrigin) {
    return next();
  }
  return next(new Error('Origin not allowed'));
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('register', (username, callback) => {
    if (!username || username.trim() === '') {
      return callback({ error: 'Username cannot be empty' });
    }

    if (Object.values(users).some(user => user.username === username)) {
      return callback({ error: 'Username is already taken' });
    }

    users[socket.id] = { 
      username, 
      online: true, 
      id: socket.id,
      joinedAt: new Date().toISOString()
    };

    io.emit('userList', Object.values(users));
    callback({ success: true, username });

    socket.broadcast.emit('notification', {
      type: 'userJoined',
      username,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on('message', (data, callback) => {
    const user = users[socket.id];
    if (!user) return callback({ error: 'Not authenticated' });

    const messageData = {
      id: Date.now(),
      sender: user.username,
      senderId: socket.id,
      text: data.text,
      timestamp: new Date().toISOString(),
    };

    messageHistory.push(messageData);
    if (messageHistory.length > MESSAGE_LIMIT) {
      messageHistory.shift();
    }

    io.emit('message', messageData);
    callback({ success: true });

    io.emit('notification', {
      type: 'newMessage',
      sender: user.username,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on('privateMessage', (data, callback) => {
    const sender = users[socket.id];
    if (!sender) return callback({ error: 'Not authenticated' });

    const receiver = Object.values(users).find(
      user => user.username === data.receiverId
    );

    if (!receiver) {
      return callback({ error: 'User not found or offline' });
    }

    const messageData = {
      id: Date.now(),
      sender: sender.username,
      senderId: socket.id,
      receiver: data.receiverId,
      receiverId: receiver.id,
      text: data.text,
      timestamp: new Date().toISOString(),
      private: true,
    };

    io.to(receiver.id).emit('privateMessage', messageData);
    socket.emit('privateMessage', messageData);
    callback({ success: true });

    io.to(receiver.id).emit('notification', {
      type: 'newPrivateMessage',
      sender: sender.username,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on('typing', (data) => {
    const user = users[socket.id];
    if (!user) return;

    if (data.isPrivate && data.receiverId) {
      const receiver = Object.values(users).find(
        u => u.username === data.receiverId
      );
      if (receiver) {
        io.to(receiver.id).emit('typing', {
          username: user.username,
          isTyping: data.isTyping,
          isPrivate: true,
        });
      }
    } else {
      socket.broadcast.emit('typing', {
        username: user.username,
        isTyping: data.isTyping,
        isPrivate: false,
      });
    }
  });

  socket.on('getHistory', (callback) => {
    callback(messageHistory);
  });

  socket.on('disconnect', () => {
    if (users[socket.id]) {
      const { username } = users[socket.id];
      delete users[socket.id];
      io.emit('userList', Object.values(users));
      io.emit('notification', {
        type: 'userLeft',
        username,
        timestamp: new Date().toISOString(),
      });
    }
    console.log(`User disconnected: ${socket.id}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});