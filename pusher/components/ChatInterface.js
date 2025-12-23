import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/auth';
import { useAlert } from '../context/AlertContext';
import Pusher from 'pusher-js';
import CryptoJS from 'crypto-js';

let pusher;
let userChannel;
let presenceChannel;

export default function ChatInterface() {
  const { user, logout } = useAuth();
  const { showAlert } = useAlert();
  const [activeChat, setActiveChat] = useState(null); // { username: string }
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]); // Array of { sender, receiver, content, timestamp }
  const [searchResults, setSearchResults] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [promptAction, setPromptAction] = useState('setup'); // 'setup' or 'verify'
  const [passwordInput, setPasswordInput] = useState('');
  const [verifiedPasswords, setVerifiedPasswords] = useState({}); // { username: password }
  const [isVerifying, setIsVerifying] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const [reactingToMessage, setReactingToMessage] = useState(null);
  const [imageToUpload, setImageToUpload] = useState(null);
  const [caption, setCaption] = useState('');
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState({}); // { username: count }
  const [recentContacts, setRecentContacts] = useState([]); // Array of { username, unreadCount, lastTimestamp }
  const [replyingTo, setReplyingTo] = useState(null); // { _id, sender, content, type }
  const [theme, setTheme] = useState('light');
  
  const messagesEndRef = useRef(null);
  const messageRefs = useRef({}); // To store refs for each message to allow scrolling to them
  const textareaRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'inherit';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 120)}px`;
    }
  }, [message]);

  const encryptData = (data, password) => {
    return CryptoJS.AES.encrypt(data, password).toString();
  };

  const decryptData = (ciphertext, password) => {
    try {
      const bytes = CryptoJS.AES.decrypt(ciphertext, password);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);
      return decrypted || '[Decryption Failed]';
    } catch (e) {
      return '[Decryption Failed]';
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeChat]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js');
      });
    }
  }, []);

  // Theme management
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  // Synchronize status bar theme with app theme
  useEffect(() => {
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    const appleStatusBarStyleMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    
    if (theme === 'dark') {
      if (themeColorMeta) themeColorMeta.setAttribute('content', '#0f172a');
      if (appleStatusBarStyleMeta) appleStatusBarStyleMeta.setAttribute('content', 'black-translucent');
    } else {
      if (themeColorMeta) themeColorMeta.setAttribute('content', '#ffffff');
      if (appleStatusBarStyleMeta) appleStatusBarStyleMeta.setAttribute('content', 'default');
    }
  }, [theme]);

  useEffect(() => {
    Pusher.logToConsole = false;

    pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
      authEndpoint: '/api/pusher/auth',
      auth: {
        params: { username: user.username }
      }
    });

    userChannel = pusher.subscribe(`private-user-${user.username}`);
    presenceChannel = pusher.subscribe(`presence-chat`);

    presenceChannel.bind('pusher:subscription_succeeded', (members) => {
      const users = [];
      members.each(member => users.push(member.id));
      setOnlineUsers(new Set(users));
    });

    presenceChannel.bind('pusher:member_added', (member) => {
      setOnlineUsers(prev => new Set([...prev, member.id]));
    });

    presenceChannel.bind('pusher:member_removed', (member) => {
      setOnlineUsers(prev => {
        const next = new Set(prev);
        next.delete(member.id);
        return next;
      });
    });

    userChannel.bind('typing_status', ({ sender, typing }) => {
      if (sender === activeChat?.username) {
        setIsOtherUserTyping(typing);
      }
    });

    userChannel.bind('messages_read', ({ receiver }) => {
      if (receiver === user.username) {
        setMessages(prev => prev.map(m => 
          (m.sender === user.username && m.receiver === activeChat?.username) ? { ...m, read: true } : m
        ));
      }
    });

    userChannel.bind('message_reacted', ({ messageId, reactions }) => {
      setMessages(prev => prev.map(m => m._id === messageId ? { ...m, reactions } : m));
    });

    userChannel.bind('receive_message', (msg) => {
      const otherUser = msg.sender === user.username ? msg.receiver : msg.sender;
      const pwd = verifiedPasswords[otherUser];
      if (pwd) {
        msg.content = decryptData(msg.content, pwd);
        if (msg.caption) {
          msg.caption = decryptData(msg.caption, pwd);
        }
        if (msg.replyToData && msg.replyToData.content) {
          msg.replyToData.content = decryptData(msg.replyToData.content, pwd);
        }
      }
      setMessages((prev) => [...prev, msg]);
      
      // If we are in the chat, mark as read
      if (activeChat?.username === msg.sender) {
        fetch('/api/pusher/mark_as_read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sender: msg.sender, receiver: user.username })
        });
      } else {
        // Increment unread count for the sender
        setUnreadCounts(prev => ({
          ...prev,
          [msg.sender]: (prev[msg.sender] || 0) + 1
        }));
        // Update recent contacts list to move sender to top
        fetchUnread(); // Refresh contacts list to ensure order
      }
    });
    
    userChannel.bind('message_sent', (msg) => {
      const otherUser = msg.sender === user.username ? msg.receiver : msg.sender;
      const pwd = verifiedPasswords[otherUser];
      if (pwd) {
        msg.content = decryptData(msg.content, pwd);
        if (msg.caption) {
          msg.caption = decryptData(msg.caption, pwd);
        }
        if (msg.replyToData && msg.replyToData.content) {
          msg.replyToData.content = decryptData(msg.replyToData.content, pwd);
        }
      }
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      if (pusher) {
        pusher.unsubscribe(`private-user-${user.username}`);
        pusher.unsubscribe(`presence-chat`);
        pusher.disconnect();
      }
    };
  }, [user.username, verifiedPasswords, activeChat?.username]);

  const handleSearchChange = (e) => {
    const q = e.target.value;
    setSearchQuery(q);
    if (q.length === 0) {
      setSearchResults([]);
    }
  };

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    if (searchQuery.trim().length > 0) {
      const res = await fetch(`/api/users?q=${searchQuery}`);
      const data = await res.json();
      setSearchResults(data);
    }
  };

  const startChat = async (otherUser) => {
    if (otherUser.username === user.username) return;
    setActiveChat(otherUser);
    setSearchQuery('');
    setSearchResults([]);
    setShowMobileChat(true);
    setIsOtherUserTyping(false);
    setMessages([]);
    setHasMore(true);

    // Update unread count locally and notify server
    setUnreadCounts(prev => ({ ...prev, [otherUser.username]: 0 }));
    fetch('/api/pusher/mark_as_read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: otherUser.username, receiver: user.username })
    });

    // Check if password exists
    const statusRes = await fetch(`/api/conversations/status?user1=${user.username}&user2=${otherUser.username}`);
    const status = await statusRes.json();

    if (!status.exists) {
      setPromptAction('setup');
      setShowPasswordPrompt(true);
      return;
    }

    // Check if already verified in this session
    if (verifiedPasswords[otherUser.username]) {
      fetchHistory(otherUser.username, verifiedPasswords[otherUser.username]);
    } else {
      setPromptAction('verify');
      setShowPasswordPrompt(true);
    }
  };

  const fetchHistory = async (otherUsername, password) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/messages?user1=${user.username}&user2=${otherUsername}&password=${password}&limit=20`);
      if (!res.ok) throw new Error('Unauthorized');
      const history = await res.json();
      
      const decryptedHistory = history.map(msg => ({
        ...msg,
        content: decryptData(msg.content, password),
        caption: msg.caption ? decryptData(msg.caption, password) : msg.caption,
        replyToData: (msg.replyToData && msg.replyToData.content) ? {
          ...msg.replyToData,
          content: decryptData(msg.replyToData.content, password)
        } : msg.replyToData
      }));

      setMessages(decryptedHistory);
      if (history.length < 20) setHasMore(false);
    } catch (err) {
      console.error('Failed to fetch history', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const fetchUnread = async () => {
    try {
      const res = await fetch(`/api/conversations/unread?username=${user.username}`);
      const data = await res.json();
      setUnreadCounts(data.unreadCounts || {});
      setRecentContacts(data.contacts || []);
    } catch (err) {
      console.error('Failed to fetch unread counts', err);
    }
  };

  useEffect(() => {
    fetchUnread();
  }, [user.username]);

  const loadMore = async () => {
    if (isLoadingMore || !hasMore || messages.length === 0) return;
    
    setIsLoadingMore(true);
    const password = verifiedPasswords[activeChat.username];
    const firstMsgTimestamp = messages[0].timestamp;

    try {
      const res = await fetch(`/api/messages?user1=${user.username}&user2=${activeChat.username}&password=${password}&before=${firstMsgTimestamp}&limit=20`);
      const olderMessages = await res.json();

      if (olderMessages.length < 20) setHasMore(false);

      const decrypted = olderMessages.map(msg => ({
        ...msg,
        content: decryptData(msg.content, password),
        caption: msg.caption ? decryptData(msg.caption, password) : msg.caption,
        replyToData: (msg.replyToData && msg.replyToData.content) ? {
          ...msg.replyToData,
          content: decryptData(msg.replyToData.content, password)
        } : msg.replyToData
      }));

      setMessages(prev => [...decrypted, ...prev]);
    } catch (err) {
      console.error('Error loading more messages:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleScroll = (e) => {
    if (e.target.scrollTop === 0) {
      loadMore();
    }
  };


  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    setIsVerifying(true);

    try {
      const res = await fetch('/api/conversations/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user1: user.username,
          user2: activeChat.username,
          password: passwordInput,
          action: promptAction
        })
      });
      const data = await res.json();

      if (data.verified) {
        setVerifiedPasswords(prev => ({ ...prev, [activeChat.username]: passwordInput }));
        setShowPasswordPrompt(false);
        setPasswordInput('');
        fetchHistory(activeChat.username, passwordInput);
      } else {
        showAlert(data.message || 'Verification failed');
      }
    } catch (err) {
      showAlert('Error during verification');
    } finally {
      setIsVerifying(false);
    }
  };

  const fileInputRef = useRef(null);

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Compress image before sending
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        const base64 = canvas.toDataURL('image/jpeg', 0.7);
        setImageToUpload(base64);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
    // Reset input
    e.target.value = null;
  };

  const handleSendImageWithCaption = (e) => {
    e.preventDefault();
    if (!imageToUpload) return;
    sendImage(imageToUpload, caption);
    setImageToUpload(null);
    setCaption('');
  };

  const sendImage = (base64, captionText) => {
    const password = verifiedPasswords[activeChat?.username];
    if (!activeChat || !password) return;

    const msgData = {
      sender: user.username,
      receiver: activeChat.username,
      type: 'image',
      content: encryptData(base64, password),
      caption: captionText ? encryptData(captionText, password) : null,
      password: password,
      timestamp: new Date().toISOString(),
      replyTo: replyingTo?._id,
      replyToData: replyingTo ? {
        sender: replyingTo.sender,
        content: encryptData(replyingTo.content, password),
        type: replyingTo.type
      } : null
    };

    fetch('/api/pusher/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msgData)
    });
    setImageToUpload(null);
    setCaption('');
    setReplyingTo(null);
  };

  const handleReaction = (msg, emoji) => {
    const password = verifiedPasswords[activeChat?.username];
    if (!password) return;

    fetch('/api/pusher/reaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: msg._id,
        emoji: emoji,
        username: user.username,
        receiver: activeChat.username
      })
    });
    setReactingToMessage(null);
  };

  const handleTextChange = (e) => {
    setMessage(e.target.value);
    
    if (activeChat) {
      fetch('/api/pusher/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver: activeChat.username, typing: true, sender: user.username })
      });
      
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      
      typingTimeoutRef.current = setTimeout(() => {
        fetch('/api/pusher/typing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ receiver: activeChat.username, typing: false, sender: user.username })
        });
      }, 2000);
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    const password = verifiedPasswords[activeChat?.username];
    if (!message.trim() || !activeChat || !password) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      fetch('/api/pusher/typing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver: activeChat.username, typing: false, sender: user.username })
      });
    }

    const msgData = {
      sender: user.username,
      receiver: activeChat.username,
      type: 'text',
      content: encryptData(message, password),
      password: password,
      timestamp: new Date().toISOString(),
      replyTo: replyingTo?._id,
      replyToData: replyingTo ? {
        sender: replyingTo.sender,
        content: encryptData(replyingTo.content, password),
        type: replyingTo.type
      } : null
    };

    fetch('/api/pusher/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msgData)
    });
    setMessage('');
    setReplyingTo(null);
    if (textareaRef.current) textareaRef.current.style.height = 'inherit';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  };

  const filteredMessages = messages.filter(m => 
    (m.sender === user.username && m.receiver === activeChat?.username) ||
    (m.sender === activeChat?.username && m.receiver === user.username)
  );

  const closeChat = () => {
    setShowMobileChat(false);
    setShowPasswordPrompt(false);
  };

  const renderLockedState = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--slate-50)', padding: '2rem' }}>
      <div className="avatar" style={{ width: '64px', height: '64px', marginBottom: '1.5rem' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      </div>
      <h2 style={{ marginBottom: '0.5rem' }}>{promptAction === 'setup' ? 'Secure this Chat' : 'Password Required'}</h2>
      <p style={{ color: 'var(--slate-500)', textAlign: 'center', marginBottom: '2rem', maxWidth: '300px' }}>
        {promptAction === 'setup' 
          ? 'Set a shared password for this conversation. Only those with the password can read or send messages.' 
          : 'Enter the shared password to unlock this conversation.'}
      </p>
      <form onSubmit={handlePasswordSubmit} style={{ width: '100%', maxWidth: '300px' }}>
        <input 
          type="password" 
          className="search-input" 
          placeholder="Enter shared password" 
          value={passwordInput}
          onChange={(e) => setPasswordInput(e.target.value)}
          autoFocus
          style={{ textAlign: 'center', marginBottom: '1rem' }}
        />
        <button type="submit" className="login-btn" disabled={isVerifying}>
          {isVerifying ? 'Securing...' : promptAction === 'setup' ? 'Set Password' : 'Unlock Chat'}
        </button>
      </form>
    </div>
  );

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className={`sidebar ${showMobileChat ? 'mobile-hidden' : ''}`}>
        <header className="header">
          <div className="avatar">{user.username[0].toUpperCase()}</div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h2 style={{ fontSize: '1rem', margin: 0, lineHeight: 1.2 }}>Chats</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--slate-500)', fontWeight: 500 }}>{user.username}</span>
          </div>
          <button onClick={toggleTheme} className="theme-toggle-btn" title="Toggle Theme" style={{ background: 'none', border: 'none', color: 'var(--slate-500)', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', transition: 'color 0.2s', borderRadius: '10px' }}>
            {theme === 'light' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            )}
          </button>
          <button onClick={logout} className="logout-btn" title="Logout">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </header>

        <form className="search-container" onSubmit={handleSearchSubmit}>
          <input 
            type="text" 
            className="search-input"
            placeholder="Search users..." 
            value={searchQuery}
            onChange={handleSearchChange}
          />
          <button type="submit" style={{ display: 'none' }}>Search</button>
        </form>

        <div className="user-list">
          {searchQuery.trim().length > 0 ? (
            searchResults.map(u => (
              <div key={u._id} className={`user-item ${activeChat?.username === u.username ? 'active' : ''}`} onClick={() => startChat(u)}>
                <div className="avatar" style={{ background: 'var(--slate-200)', color: 'var(--slate-600)', position: 'relative' }}>
                  {u.username[0].toUpperCase()}
                  {onlineUsers.has(u.username) && <div className="online-indicator-small"></div>}
                </div>
                <div className="user-info" style={{ flex: 1 }}>
                  <span className="user-name">{u.username}</span>
                </div>
                {unreadCounts[u.username] > 0 && (
                  <div className="unread-badge">{unreadCounts[u.username]}</div>
                )}
              </div>
            ))
          ) : (
            <>
              {recentContacts.length > 0 ? (
                recentContacts.map(u => (
                  <div key={u.username} className={`user-item ${activeChat?.username === u.username ? 'active' : ''}`} onClick={() => startChat(u)}>
                    <div className="avatar" style={{ background: 'var(--slate-200)', color: 'var(--slate-600)', position: 'relative' }}>
                      {u.username[0].toUpperCase()}
                      {onlineUsers.has(u.username) && <div className="online-indicator-small"></div>}
                    </div>
                    <div className="user-info" style={{ flex: 1 }}>
                      <span className="user-name">{u.username}</span>
                    </div>
                    {unreadCounts[u.username] > 0 && (
                      <div className="unread-badge">{unreadCounts[u.username]}</div>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--slate-400)', fontSize: '0.85rem' }}>
                  No recent chats. Search for a user to start messaging!
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Chat Window */}
      <main className={`chat-window ${!showMobileChat ? 'mobile-hidden' : ''}`}>
        {activeChat ? (
          <>
            <header className="header">
              <button className="back-btn" onClick={closeChat}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              </button>
              <div className="avatar" style={{ width: '36px', height: '36px', position: 'relative' }}>
                {activeChat.username[0].toUpperCase()}
                {onlineUsers.has(activeChat.username) && <div className="online-indicator-small"></div>}
              </div>
              <div>
                <h2 style={{ fontSize: '1rem' }}>{activeChat.username}</h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>
                  {isOtherUserTyping ? 'Typing...' : (onlineUsers.has(activeChat.username) ? 'Online' : 'Offline')}
                </span>
              </div>
            </header>

            {showPasswordPrompt ? renderLockedState() : (
              <>
                <div className="messages-area" onScroll={handleScroll}>
                  {isLoadingMore && <div className="loading-indicator">Loading older messages...</div>}
                  {isLoadingHistory ? (
                    <div className="loading-indicator" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', height: '100%' }}>
                       <div className="avatar" style={{ background: 'transparent', color: 'var(--primary)', boxShadow: 'none' }}>
                         <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                       </div>
                       Decrypting history...
                    </div>
                  ) : filteredMessages.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate-400)' }}>
                      No messages yet. Say hi!
                    </div>
                  ) : (
                    filteredMessages.map((m, i) => {
                      const prevMsg = i > 0 ? filteredMessages[i - 1] : null;
                      const isSameSender = prevMsg && prevMsg.sender === m.sender;
                      const timeDiff = prevMsg ? (new Date(m.timestamp) - new Date(prevMsg.timestamp)) / 1000 / 60 : Infinity;
                      const isGrouped = isSameSender && timeDiff < 5;

                      const scrollToMessage = (msgId) => {
                        const target = messageRefs.current[msgId];
                        if (target) {
                          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          target.style.transition = 'background-color 0.5s';
                          const originalBg = target.style.backgroundColor;
                          target.style.backgroundColor = 'var(--slate-200)';
                          setTimeout(() => {
                            target.style.backgroundColor = originalBg;
                          }, 1000);
                        }
                      };

                      return (
                        <div 
                          key={m._id || i}
                          ref={el => messageRefs.current[m._id] = el}
                          className={`message ${m.sender === user.username ? 'sent' : 'received'} ${m.type === 'image' ? 'has-image' : ''} ${isGrouped ? 'grouped' : ''}`}
                          onContextMenu={(e) => {
                            if (m.sender !== user.username) {
                              e.preventDefault();
                              setReactingToMessage(m);
                            }
                          }}
                        >
                          {m.replyToData && (
                            <div className="reply-block" onClick={() => scrollToMessage(m.replyTo)}>
                              <span className="replied-sender">{m.replyToData.sender}</span>
                              <div className="replied-content">
                                {m.replyToData.type === 'image' ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                    Photo
                                  </div>
                                ) : (
                                  m.replyToData.content
                                )}
                              </div>
                            </div>
                          )}

                          {m.type === 'image' && (
                            <div className="message-image-container">
                              <img 
                                src={m.content} 
                                alt="shared" 
                                onClick={() => setPreviewImage(m.content)}
                              />
                              {m.caption && (
                                <div className="image-caption">{m.caption}</div>
                              )}
                            </div>
                          )}
                          
                          {m.type !== 'image' && m.content}

                          <span className="message-time">
                            {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>

                          {m.sender === user.username && (
                            <span className={`ticks ${m.read ? 'read' : ''}`}>
                                {m.read ? ' ✓✓' : ' ✓'}
                            </span>
                          )}

                          <button 
                            className="reply-btn"
                            onClick={() => setReplyingTo(m)}
                            title="Reply"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                          </button>
                          {m.sender !== user.username && (
                            <button 
                              className="reaction-trigger"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReactingToMessage(m);
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                            </button>
                          )}
                          {m.reactions && m.reactions.length > 0 && (
                            <div className="reactions-display">
                              {Array.from(new Set(m.reactions.map(r => r.type))).map(emoji => (
                                <span key={emoji} className="reaction-emoji">{emoji}</span>
                              ))}
                              <span className="reaction-count">{m.reactions.length}</span>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {previewImage && (
                  <div className="image-modal" onClick={() => setPreviewImage(null)}>
                    <button className="close-modal" onClick={(e) => { e.stopPropagation(); setPreviewImage(null); }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                    <img src={previewImage} alt="preview" onClick={(e) => e.stopPropagation()} />
                  </div>
                )}

                {imageToUpload && (
                  <div className="image-upload-overlay">
                    <button className="close-modal" onClick={() => setImageToUpload(null)}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                    <img src={imageToUpload} alt="upload preview" className="image-upload-preview" />
                    <form className="caption-form" onSubmit={handleSendImageWithCaption}>
                      <input 
                        type="text" 
                        className="caption-input" 
                        placeholder="Add a caption..." 
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        autoFocus
                      />
                      <button type="submit" className="send-btn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                      </button>
                    </form>
                  </div>
                )}

                {reactingToMessage && (
                  <div className="interaction-overlay" onClick={() => setReactingToMessage(null)}>
                    <div className="reaction-picker" onClick={(e) => e.stopPropagation()}>
                      {['❤️', '👍', '😂', '😮', '😢', '🔥'].map(emoji => (
                        <button key={emoji} className="reaction-btn" onClick={() => handleReaction(reactingToMessage, emoji)}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {replyingTo && (
                  <div className="reply-preview">
                    <div className="reply-preview-content">
                      <span className="reply-preview-sender">{replyingTo.sender}</span>
                      <div className="reply-preview-text">
                        {replyingTo.type === 'image' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                            Photo
                          </div>
                        ) : (
                          replyingTo.content
                        )}
                      </div>
                    </div>
                    <button className="cancel-reply" onClick={() => setReplyingTo(null)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                )}

                <form className="input-area" onSubmit={sendMessage}>
                  <input 
                    type="file" 
                    accept="image/*" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    onChange={handleImageSelect}
                  />
                  <button type="button" className="send-btn secondary" onClick={() => fileInputRef.current.click()} title="Send Image">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  </button>
                    <textarea
                      ref={textareaRef}
                      className="message-input"
                      placeholder="Type a message..." 
                      value={message}
                      onChange={handleTextChange}
                      onKeyDown={handleKeyDown}
                      rows="1"
                    />
                  <button type="submit" className="send-btn" disabled={!message.trim()}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </button>
                </form>
              </>
            )}
          </>
        ) : (
          <div className="welcome-screen">
            <div className="avatar">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <h3>Welcome to ChatSecure</h3>
            <p>Select a conversation from the sidebar to start messaging with end-to-end encryption.</p>
          </div>
        )}
      </main>
    </div>
  );
}



