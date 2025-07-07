import { useEffect, useState, useRef, useCallback } from 'react';
import { socket } from '../socket/socket';
import './Chat.css';

export default function Chat() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [messages, setMessages] = useState([]);
  const [privateMessages, setPrivateMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [username, setUsername] = useState('');
  const [registered, setRegistered] = useState(false);
  const [users, setUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [activePrivateChat, setActivePrivateChat] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const registerUser = useCallback(() => {
    if (username.trim()) {
      socket.emit('register', username.trim(), (response) => {
        if (response.error) {
          setUsernameError(response.error);
        } else {
          setRegistered(true);
          setUsernameError('');
        }
      });
    }
  }, [username]);

  const sendMessage = useCallback(() => {
    if (message.trim()) {
      const callback = (response) => {
        if (response.error) {
          console.error('Message error:', response.error);
        } else {
          setMessage('');
          socket.emit('typing', { 
            isTyping: false, 
            isPrivate: !!activePrivateChat, 
            receiverId: activePrivateChat 
          });
        }
      };

      if (activePrivateChat) {
        socket.emit('privateMessage', {
          receiverId: activePrivateChat,
          text: message.trim(),
        }, callback);
      } else {
        socket.emit('message', { text: message.trim() }, callback);
      }
    }
  }, [message, activePrivateChat]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const handleTyping = useCallback(() => {
    socket.emit('typing', { 
      isTyping: message.length > 0,
      isPrivate: !!activePrivateChat,
      receiverId: activePrivateChat
    });
  }, [message, activePrivateChat]);

  const loadMoreMessages = useCallback(() => {
    setLoadingHistory(true);
    socket.emit('getHistory', (history) => {
      setMessages((prev) => [...history, ...prev]);
      setLoadingHistory(false);
    });
  }, []);

  useEffect(() => {
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    
    const onMessageReceived = (value) => {
      setMessages((prev) => [...prev, value]);
      setTimeout(scrollToBottom, 100);
    };

    const onPrivateMessageReceived = (value) => {
      setPrivateMessages((prev) => [...prev, value]);
      setTimeout(scrollToBottom, 100);
    };

    const onUserList = (value) => setUsers(value);
    const onRegistered = () => setRegistered(true);
    const onUsernameError = (message) => setUsernameError(message);

    const onTyping = (data) => {
      if (data.isTyping) {
        if (data.isPrivate && activePrivateChat === data.username) {
          setTypingUsers((prev) => [...new Set([...prev, data.username])]);
        } else if (!data.isPrivate) {
          setTypingUsers((prev) => [...new Set([...prev, data.username])]);
        }
      } else {
        setTypingUsers((prev) => prev.filter(user => user !== data.username));
      }
    };

    const onNotificationReceived = (value) => {
      setNotifications((prev) => [...prev.slice(-9), value]);
      if (value.type.includes('Message') && document.hidden) {
        new Audio('/notification.mp3').play().catch(console.error);
      }
    };

    socket.connect();
    inputRef.current?.focus();

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('message', onMessageReceived);
    socket.on('privateMessage', onPrivateMessageReceived);
    socket.on('userList', onUserList);
    socket.on('registered', onRegistered);
    socket.on('usernameError', onUsernameError);
    socket.on('typing', onTyping);
    socket.on('notification', onNotificationReceived);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('message', onMessageReceived);
      socket.off('privateMessage', onPrivateMessageReceived);
      socket.off('userList', onUserList);
      socket.off('registered', onRegistered);
      socket.off('usernameError', onUsernameError);
      socket.off('typing', onTyping);
      socket.off('notification', onNotificationReceived);
    };
  }, [scrollToBottom, activePrivateChat]);

  useEffect(() => {
    if ('Notification' in window && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    handleTyping();
  }, [message, handleTyping]);

  if (!registered) {
    return (
      <div className="auth-container">
        <h2>Join Chat</h2>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && registerUser()}
          placeholder="Enter your username"
          ref={inputRef}
        />
        <button onClick={registerUser}>Join</button>
        {usernameError && <p className="error">{usernameError}</p>}
      </div>
    );
  }

  return (
    <div className="chat-container">
      <div className="sidebar">
        <div className="user-info">
          <h3>{username}</h3>
          <p>{isConnected ? '🟢 Online' : '🔴 Offline'}</p>
        </div>
        
        <div className="online-users">
          <h3>Online ({users.filter(u => u.online).length})</h3>
          <ul>
            {users.filter(u => u.online && u.username !== username).map((user) => (
              <li 
                key={user.id}
                className={activePrivateChat === user.username ? 'active' : ''}
                onClick={() => setActivePrivateChat(user.username)}
              >
                {user.username}
              </li>
            ))}
          </ul>
        </div>

        <div className="notifications">
          <h3>Notifications</h3>
          <ul>
            {notifications.map((notif, i) => (
              <li key={i}>
                {notif.type === 'userJoined' && `👋 ${notif.username} joined`}
                {notif.type === 'userLeft' && `🚪 ${notif.username} left`}
                {notif.type === 'newMessage' && `💬 ${notif.sender}`}
                {notif.type === 'newPrivateMessage' && `🔒 ${notif.sender}`}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="chat-area">
        <div className="chat-header">
          <h2>{activePrivateChat ? `Private: ${activePrivateChat}` : 'Global Chat'}</h2>
          {typingUsers.length > 0 && (
            <div className="typing-indicator">
              {typingUsers.join(', ')} {typingUsers.length > 1 ? 'are' : 'is'} typing...
            </div>
          )}
        </div>

        <div className="messages-container">
          {!loadingHistory && messages.length >= 10 && (
            <button onClick={loadMoreMessages} className="load-more">
              Load Older Messages
            </button>
          )}
          {loadingHistory && <div className="loading">Loading...</div>}

          {(activePrivateChat 
            ? privateMessages.filter(
                msg => (msg.sender === username && msg.receiver === activePrivateChat) ||
                       (msg.sender === activePrivateChat && msg.receiver === username)
              )
            : messages
          ).map((msg) => (
            <div 
              key={msg.id} 
              className={`message ${msg.sender === username ? 'sent' : 'received'}`}
            >
              <div className="message-sender">{msg.sender}</div>
              <div className="message-text">{msg.text}</div>
              <div className="message-time">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="message-input">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${activePrivateChat || 'everyone'}...`}
            ref={inputRef}
          />
          <button onClick={sendMessage}>Send</button>
        </div>
      </div>
    </div>
  );
}