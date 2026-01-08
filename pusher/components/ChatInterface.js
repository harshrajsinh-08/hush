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
  const isTypingRef = useRef(false);
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
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [messageToDelete, setMessageToDelete] = useState(null);

  const { updateUserProfile } = useAuth();
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [status, setStatus] = useState(user?.status || '');

  // Sync state when user object updates from AuthContext (e.g. cross-platform sync)
  useEffect(() => {
    if (user) {
      setAvatar(user.avatar || '');
      setStatus(user.status || '');
    }
  }, [user]);

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [showContactProfileModal, setShowContactProfileModal] = useState(false);
  const [contactProfileData, setContactProfileData] = useState(null);

  // Notifications
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isSending, setIsSending] = useState(false);

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

  // --- CRYPTO WORKER MANAGEMENT ---
  const workerRef = useRef(null);
  const workerCallbacks = useRef({});
  const requestIdRef = useRef(0);

  useEffect(() => {
    workerRef.current = new Worker('/crypto.worker.js');
    workerRef.current.onmessage = (e) => {
      const { id, success, result, error } = e.data;
      if (workerCallbacks.current[id]) {
        if (success) {
          workerCallbacks.current[id].resolve(result);
        } else {
          workerCallbacks.current[id].reject(new Error(error));
        }
        delete workerCallbacks.current[id];
      }
    };
    return () => workerRef.current.terminate();
  }, []);

  const callWorker = (action, payload) => {
    return new Promise((resolve, reject) => {
      const id = ++requestIdRef.current;
      workerCallbacks.current[id] = { resolve, reject };
      workerRef.current.postMessage({ id, action, payload });
    });
  };

  const decryptAsync = async (ciphertext, key) => {
    if (!ciphertext) return '';
    try {
      return await callWorker('decrypt', { data: ciphertext, key });
    } catch (e) {
      return '[Decryption Failed]';
    }
  };

  const encryptAsync = async (data, key) => {
    try {
      return await callWorker('encrypt', { data, key });
    } catch (e) {
      console.error('Encryption failed', e);
      return '';
    }
  };
  // ---------------------------------

  // Ref to access latest passwords inside Pusher callbacks without re-subscribing
  const verifiedPasswordsRef = useRef(verifiedPasswords);
  const activeChatRef = useRef(activeChat);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    verifiedPasswordsRef.current = verifiedPasswords;

    // If we just verified a password for the currently active chat, re-decrypt existing messages
    if (activeChat && verifiedPasswords[activeChat.username]) {
      const pwd = verifiedPasswords[activeChat.username];
      const targetUser = activeChat.username;

      const processMessages = async () => {
        const currentMessages = [...messages];
        let hasChanges = false;

        // Process in chunks to avoid blocking
        const chunkSize = 10;
        for (let i = 0; i < currentMessages.length; i += chunkSize) {
          const chunk = currentMessages.slice(i, i + chunkSize);
          let chunkModified = false;

          for (let j = 0; j < chunk.length; j++) {
            const msg = chunk[j];
            if (msg.content === '[Decryption Failed]' && msg.rawContent) {
              const decrypted = msg.type === 'otv' ? msg.content : await decryptAsync(msg.rawContent, pwd);
              if (decrypted !== '[Decryption Failed]') {
                chunk[j] = {
                  ...msg,
                  content: decrypted,
                  caption: msg.caption ? await decryptAsync(msg.caption, pwd) : msg.caption,
                  replyToData: (msg.replyToData && msg.replyToData.content) ? {
                    ...msg.replyToData,
                    content: await decryptAsync(msg.replyToData.content, pwd)
                  } : msg.replyToData
                };
                chunkModified = true;
                hasChanges = true;
              }
            }
          }

          if (chunkModified) {
            // Check if user still in the same chat
            if (activeChatRef.current?.username !== targetUser) return;

            setMessages(prev => {
              const next = [...prev];
              next.splice(i, chunk.length, ...chunk);
              return next;
            });
          }

          // Yield
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      };

      processMessages();
    }
  }, [verifiedPasswords, activeChat?.username]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeChat]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // FORCE UNREGISTER to fix stale cache issues on mobile
      navigator.serviceWorker.getRegistrations().then(function (registrations) {
        for (let registration of registrations) {
          registration.unregister()
            .then(() => console.log("Service Worker Unregistered to force update"));
        }
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
    if (!user?.username) return;
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

    userChannel.bind('message_deleted', ({ messageId }) => {
      setMessages(prev => prev.filter(m => {
        // If it's the message being deleted
        if (m._id === messageId) {
          // Keep it if it is a revealed OTV message (so user can finish reading)
          if (m.type === 'otv' && m.isRevealed && !m.isExpired) {
            return true;
          }
          return false;
        }
        return true;
      }));
    });

    userChannel.bind('receive_message', async (msg) => {
      const otherUser = msg.sender === user.username ? msg.receiver : msg.sender;
      const pwd = verifiedPasswordsRef.current[otherUser];

      // If content is missing (large file), fetch it
      if ((msg.type === 'image' || msg.type === 'video') && !msg.content) {
        try {
          const res = await fetch(`/api/messages?user1=${user.username}&user2=${otherUser}&password=${pwd}&messageId=${msg._id}`);
          if (res.ok) {
            msg = await res.json();
          }
        } catch (e) {
          console.error('Failed to fetch full message', e);
        }
      }

      if (pwd) {
        if (msg.type !== 'otv') {
          msg.content = await decryptAsync(msg.content, pwd);
        }
        if (msg.caption) {
          msg.caption = await decryptAsync(msg.caption, pwd);
        }
        if (msg.replyToData && msg.replyToData.content) {
          msg.replyToData.content = await decryptAsync(msg.replyToData.content, pwd);
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

    userChannel.bind('message_sent', async (msg) => {
      const otherUser = msg.sender === user.username ? msg.receiver : msg.sender;
      const pwd = verifiedPasswordsRef.current[otherUser];

      if ((msg.type === 'image' || msg.type === 'video') && !msg.content) {
        try {
          const res = await fetch(`/api/messages?user1=${user.username}&user2=${msg.receiver}&password=${pwd}&messageId=${msg._id}`);
          if (res.ok) msg = await res.json();
        } catch (e) { console.error('Failed to fetch full message', e); }
      }

      if (pwd && msg.content && msg.content !== '[Decryption Failed]') {
        try {
          if (msg.type !== 'otv') msg.content = await decryptAsync(msg.content, pwd);
          if (msg.caption) msg.caption = await decryptAsync(msg.caption, pwd);
          if (msg.replyToData && msg.replyToData.content) {
            msg.replyToData.content = await decryptAsync(msg.replyToData.content, pwd);
          }
        } catch (e) { }
      }

      setMessages((prev) => {
        if (prev.some(m => m._id === msg._id)) return prev;
        return [...prev, msg];
      });
    });


    // Notifications listener
    userChannel.bind('new_notification', (data) => {
      setNotifications(prev => [data.notification, ...prev]);
      // Also play a subtle sound if desired
    });

    return () => {
      if (pusher) {
        pusher.unsubscribe(`private-user-${user.username}`);
        pusher.unsubscribe(`presence-chat`);
        pusher.disconnect();
      }
    };
  }, [user?.username, activeChat?.username]);

  // Debounced Search
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.trim().length > 0) {
        fetch(`/api/users?q=${searchQuery}`)
          .then(res => res.json())
          .then(data => setSearchResults(data))
          .catch(console.error);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    if (searchQuery.trim().length > 0) {
      const res = await fetch(`/api/users?q=${searchQuery}`);
      const data = await res.json();
      setSearchResults(data);
    }
  };

  const startChat = async (otherUser, initialPassword = null) => {
    if (otherUser.username === user.username) return;
    setIsCheckingStatus(true);
    setActiveChat(otherUser);
    activeChatRef.current = otherUser;
    setSearchQuery('');
    setSearchResults([]);
    setShowMobileChat(true);
    setIsOtherUserTyping(false);
    setMessages([]);
    setHasMore(true);
    setShowPasswordPrompt(false);

    // Update unread count locally and notify server
    setUnreadCounts(prev => ({ ...prev, [otherUser.username]: 0 }));
    fetch('/api/pusher/mark_as_read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: otherUser.username, receiver: user.username })
    });

    // Check if password exists
    try {
      const statusRes = await fetch(`/api/conversations/status?user1=${user.username}&user2=${otherUser.username}`);
      const status = await statusRes.json();

      setIsCheckingStatus(false);

      if (!status.exists) {
        setPromptAction('setup');
        setShowPasswordPrompt(true);
        // Load history anyway to see automated OTV messages
        fetchHistory(otherUser.username, null);
        return;
      }

      // Check if already verified in this session OR we have an initialPassword passed in (e.g. from Unlock)
      const pwd = initialPassword || verifiedPasswords[otherUser.username];

      if (pwd) {
        fetchHistory(otherUser.username, pwd);
      } else {
        // Chat exists but is NOT verified. Show prompt.
        setPromptAction('verify');
        setShowPasswordPrompt(true);
      }
    } catch (err) {
      setIsCheckingStatus(false);
      showAlert('Failed to check conversation status');
    }
  };

  const fetchHistory = async (otherUsername, password) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/messages?user1=${user.username}&user2=${otherUsername}&limit=20`);
      if (!res.ok) {
        if (res.status === 401) console.warn('Unauthorized access to history');
        return;
      }
      const history = await res.json();

      if (!Array.isArray(history)) return;

      // Process in chunks
      const decryptedMessages = [];
      const chunkSize = 5;

      for (let i = 0; i < history.length; i += chunkSize) {
        const chunk = history.slice(i, i + chunkSize);

        const decryptedChunk = await Promise.all(chunk.map(async (msg) => {
          const decrypted = msg.type === 'otv' ? msg.content : await decryptAsync(msg.content, password);
          return {
            ...msg,
            rawContent: msg.content,
            content: decrypted,
            caption: msg.caption ? await decryptAsync(msg.caption, password) : msg.caption,
            replyToData: (msg.replyToData && msg.replyToData.content) ? {
              ...msg.replyToData,
              content: await decryptAsync(msg.replyToData.content, password)
            } : msg.replyToData
          };
        }));

        decryptedMessages.push(...decryptedChunk);

        // Yield to maintain responsiveness
        await new Promise(resolve => setTimeout(resolve, 0));

        // Safety check
        if (activeChatRef.current?.username !== otherUsername) return;
      }

      setMessages(decryptedMessages);
      if (history.length < 20) setHasMore(false);
      setTimeout(scrollToBottom, 50);
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

    // Fetch notifications
    fetch('/api/notifications')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setNotifications(data);
      })
      .catch(console.error);

  }, [user?.username]);

  const loadMore = async () => {
    if (isLoadingMore || !hasMore || messages.length === 0) return;

    setIsLoadingMore(true);
    const targetChat = activeChatRef.current;
    if (!targetChat) return;

    const password = verifiedPasswords[targetChat.username] || '';
    const firstMsgTimestamp = messages[0].timestamp;

    try {
      const res = await fetch(`/api/messages?user1=${user.username}&user2=${targetChat.username}&before=${firstMsgTimestamp}&limit=20`);
      if (!res.ok) return;

      const olderMessages = await res.json();

      if (olderMessages.length < 20) setHasMore(false);

      const decryptedMessages = [];
      const chunkSize = 5;

      for (let i = 0; i < olderMessages.length; i += chunkSize) {
        const chunk = olderMessages.slice(i, i + chunkSize);

        // Process chunk
        const decryptedChunk = await Promise.all(chunk.map(async (msg) => {
          const decrypted = msg.type === 'otv' ? msg.content : await decryptAsync(msg.content, password);
          return {
            ...msg,
            rawContent: msg.content, // Preserve original
            content: decrypted,
            caption: msg.caption ? await decryptAsync(msg.caption, password) : msg.caption,
            replyToData: (msg.replyToData && msg.replyToData.content) ? {
              ...msg.replyToData,
              content: await decryptAsync(msg.replyToData.content, password)
            } : msg.replyToData
          };
        }));

        decryptedMessages.push(...decryptedChunk);

        // Yield to main thread
        await new Promise(resolve => setTimeout(resolve, 0));

        // Safety check: if chat switched while processing, abort
        if (activeChatRef.current?.username !== targetChat.username) return;
      }

      setMessages(prev => {
        // Final safety check before state update
        if (activeChatRef.current?.username !== targetChat.username) return prev;
        return [...decryptedMessages, ...prev];
      });
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

  const compressImage = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round(height * (MAX_WIDTH / width));
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round(width * (MAX_HEIGHT / height));
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // Optimize: WebP format with 0.85 quality - High quality, smaller size than JPEG
          resolve(canvas.toDataURL('image/webp', 0.85));
        };
      };
    });
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const base64 = await compressImage(file);
      setImageToUpload(base64);
    } catch (err) {
      console.error('Image compression failed', err);
      showAlert('Failed to process image');
    }

    // Reset input
    e.target.value = null;
  };

  const handleDeleteMessage = async (messageId) => {
    // Optimistic update
    setMessages(prev => prev.filter(m => m._id !== messageId));
    setMessageToDelete(null);

    try {
      await fetch('/api/pusher/delete_message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, username: user.username })
      });
    } catch (err) {
      console.error('Failed to delete message:', err);
      showAlert('Failed to delete message');
      // Revert if failed (would need more complex state management, ignoring for now as simple retry is okay)
    }
  };

  const handleSendImageWithCaption = (e) => {
    e.preventDefault();
    if (!imageToUpload) return;
    sendImage(imageToUpload, caption);
    setImageToUpload(null);
    setCaption('');
  };

  const sendImage = async (base64, captionText) => {
    const password = verifiedPasswords[activeChat?.username];
    if (!activeChat || !password) return;

    // 1. Optimistic Update (Immediate Feedback)
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      _id: tempId,
      sender: user.username,
      receiver: activeChat.username,
      type: 'image',
      content: base64,
      caption: captionText,
      timestamp: new Date().toISOString(),
      isPending: true,
      replyToData: replyingTo ? {
        sender: replyingTo.sender,
        content: replyingTo.content,
        type: replyingTo.type
      } : null
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setImageToUpload(null);
    setCaption('');
    setReplyingTo(null);
    setIsSending(true);

    // 2. Yield to UI (allow render)
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      // 3. Encrypt Data (Heavy) - Offload to worker
      const encryptedContent = await encryptAsync(base64, password);
      const encryptedCaption = captionText ? await encryptAsync(captionText, password) : null;
      const encryptedReplyContent = replyingTo ? await encryptAsync(replyingTo.content, password) : null;

      const msgData = {
        sender: user.username,
        receiver: activeChat.username,
        type: 'image',
        content: encryptedContent,
        caption: encryptedCaption,
        timestamp: new Date().toISOString(),
        replyTo: replyingTo?._id,
        replyToData: replyingTo ? {
          sender: replyingTo.sender,
          content: encryptedReplyContent,
          type: replyingTo.type
        } : null
      };

      // 4. Send Request via XHR for progress
      const savedMsg = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/pusher/message');
        xhr.setRequestHeader('Content-Type', 'application/json');

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = (event.loaded / event.total) * 100;
            setMessages(prev => prev.map(m =>
              m._id === tempId ? { ...m, progress: percentComplete } : m
            ));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error('Upload failed'));
          }
        };

        xhr.onerror = () => reject(new Error('Network error'));

        xhr.send(JSON.stringify(msgData));
      });

      // 5. Update with Real Message
      // Prepare saved message for local view (using unencrypted content)
      savedMsg.content = base64;
      savedMsg.caption = captionText;
      if (replyingTo) {
        savedMsg.replyToData = {
          sender: replyingTo.sender,
          content: replyingTo.content,
          type: replyingTo.type
        };
      }

      // Replace optimistic message
      setMessages(prev => prev.map(m => m._id === tempId ? savedMsg : m));
    } catch (err) {
      console.error('Failed to send image:', err);
      showAlert('Failed to send image');
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => m._id !== tempId));
    } finally {
      setIsSending(false);
    }
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
      // Only notify server when we START typing (throttle)
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        fetch('/api/pusher/typing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ receiver: activeChat.username, typing: true, sender: user.username })
        });
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

      typingTimeoutRef.current = setTimeout(() => {
        isTypingRef.current = false;
        fetch('/api/pusher/typing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ receiver: activeChat.username, typing: false, sender: user.username })
        });
      }, 2000);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    const password = verifiedPasswords[activeChat?.username];
    if (!message.trim() || !activeChat || !password) return;

    const currentMsgContent = message;
    const currentReplyTo = replyingTo;

    // Clear input and reply status immediately (UI responsiveness)
    setMessage('');
    setReplyingTo(null);

    // Optimistic Update
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      _id: tempId,
      sender: user.username,
      receiver: activeChat.username,
      content: currentMsgContent,
      timestamp: new Date().toISOString(),
      isPending: true,
      replyToData: currentReplyTo ? {
        sender: currentReplyTo.sender,
        content: currentReplyTo.content,
        type: currentReplyTo.type
      } : null
    };

    setMessages(prev => [...prev, optimisticMsg]);

    try {
      // Heavy encryption off-thread
      const encryptedContent = await encryptAsync(currentMsgContent, password);
      const encryptedReplyContent = currentReplyTo ? await encryptAsync(currentReplyTo.content, password) : null;

      const res = await fetch('/api/pusher/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: user.username,
          receiver: activeChat.username,
          content: encryptedContent,
          replyTo: currentReplyTo?._id,
          replyToData: currentReplyTo ? {
            sender: currentReplyTo.sender,
            content: encryptedReplyContent,
            type: currentReplyTo.type
          } : null
        })
      });

      const savedMsg = await res.json();
      // Replace optimistic message with actual data but keep decrypted text for local view
      savedMsg.content = currentMsgContent;
      if (currentReplyTo) {
        savedMsg.replyToData = {
          sender: currentReplyTo.sender,
          content: currentReplyTo.content,
          type: currentReplyTo.type
        };
      }

      setMessages(prev => prev.map(m => m._id === tempId ? savedMsg : m));
    } catch (err) {
      console.error('Failed to send message:', err);
      showAlert('Failed to send message');
      // Revert UI on failure
      setMessages(prev => prev.filter(m => m._id !== tempId));
      setMessage(currentMsgContent); // Put text back
    }
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



  const handleSharePassword = async () => {
    if (!activeChat) return;
    const password = verifiedPasswordsRef.current[activeChat.username];
    if (!password) return;

    try {
      const res = await fetch('/api/pusher/share_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: user.username,
          receiver: activeChat.username,
          password: password
        })
      });

      if (res.ok) {
        showAlert('Password shared via Secure Inbox!', 'Success', 'OK');
        const btn = document.querySelector('.lock-btn[title="Share Password / Setup"]');
        if (btn) {
          const original = btn.innerHTML;
          btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>';
          setTimeout(() => btn.innerHTML = original, 2000);
        }
      } else {
        const data = await res.json();
        showAlert(data.message || 'Failed to share password');
      }
    } catch (e) {
      console.error("Failed to share password", e);
      showAlert('Error sharing password');
    }
  };

  const viewOTV = async (msgId) => {
    let revealedPassword = '';
    // 1. Reveal locally
    setMessages(prev => prev.map(m => {
      if (m._id === msgId) {
        revealedPassword = m.content;
        return { ...m, isRevealed: true };
      }
      return m;
    }));

    // 2. Auto-verify and Unlock
    if (revealedPassword) {
      try {
        const res = await fetch('/api/conversations/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user1: user.username,
            user2: activeChat.username,
            password: revealedPassword,
            action: 'verify'
          })
        });
        const data = await res.json();
        if (data.verified) {
          setVerifiedPasswords(prev => ({ ...prev, [activeChat.username]: revealedPassword }));
          showAlert('Chat Unlocked Successfully!', 'Success', 'Great!');
          // History will be decrypted on next render due to verifiedPasswords state change
        }
      } catch (e) {
        console.error("Auto-verify failed", e);
      }
    }

    // 3. Delete from server immediately (so it can't be fetched again)
    // Use the existing delete logic but silent
    fetch('/api/pusher/message', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: msgId, userId: user.username })
    }).catch(err => console.error("Failed to delete OTV", err));

    // 4. Auto-expire/hide locally after 30 seconds (longer to allow read/decryption)
    setTimeout(() => {
      setMessages(prev => prev.map(m => {
        if (m._id === msgId) {
          return { ...m, isRevealed: false, isExpired: true };
        }
        return m;
      }));
    }, 30000);
  };

  const closeChat = () => {
    if (activeChat) {
      setVerifiedPasswords(prev => {
        const next = { ...prev };
        delete next[activeChat.username];
        return next;
      });
    }
    setActiveChat(null);
    setShowMobileChat(false);
    setShowPasswordPrompt(false);
    setMessages([]);
    setHasMore(true);
  };

  const [inviteModalData, setInviteModalData] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (!deleteConfirmation) return;
    setIsDeleting(true);
    try {
      const res = await fetch('/api/user', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, password: deleteConfirmation })
      });
      const data = await res.json();
      if (res.ok) {
        logout();
      } else {
        showAlert(data.message);
      }
    } catch (e) {
      console.error("Delete failed", e);
      showAlert("Server error");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault();
    setIsSavingProfile(true);
    try {
      const res = await fetch('/api/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          avatar: avatar,
          status: status
        })
      });
      if (res.ok) {
        updateUserProfile({ avatar, status });
        showAlert('Profile updated successfully!', 'Success', 'OK');
      } else {
        const data = await res.json();
        showAlert(data.message || 'Failed to update profile', 'Error', 'Try Again');
      }
    } catch (e) {
      console.error("Profile update error", e);
      showAlert("Server error during update", "Error", "Try Again");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const base64 = await compressImage(file);
      setAvatar(base64);
    } catch (err) {
      console.error('Avatar processing failed', err);
      showAlert('Failed to process avatar');
    }
    e.target.value = null; // reset
  };

  const handleInvite = async () => {
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username })
      });
      const data = await res.json();
      if (res.ok) {
        const url = `${window.location.origin}/?invite=${data.code}`;
        setInviteModalData(url);
      } else {
        console.error("Failed to generate invite");
      }
    } catch (e) {
      console.error("Error generating invite", e);
    }
  };

  const copyToClipboard = (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => showAlert("Copied!", "Success", "OK"))
        .catch(err => {
          console.error("Clipboard failed", err);
          fallbackCopy(text);
        });
    } else {
      fallbackCopy(text);
    }
  };

  const fallbackCopy = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";  // Avoid scrolling to bottom
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      showAlert("Copied!", "Success", "OK");
    } catch (err) {
      console.error('Fallback: Oops, unable to copy', err);
      showAlert("Could not copy automatically. Please copy the link manually.");
    }
    document.body.removeChild(textArea);
  };

  const renderLockedState = () => (
    <div style={{ padding: '1.5rem', background: 'var(--slate-50)', borderTop: '1px solid var(--slate-200)', width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '400px', margin: '0 auto' }}>
        <h3 style={{ marginBottom: '0.5rem', fontSize: '1rem' }}>{promptAction === 'setup' ? 'Secure this Chat' : 'Password Required'}</h3>
        <p style={{ color: 'var(--slate-500)', textAlign: 'center', marginBottom: '1rem', fontSize: '0.85rem' }}>
          {promptAction === 'setup'
            ? 'Set a shared password for this conversation.'
            : 'Enter the shared password to unlock messages.'}
        </p>
        <form onSubmit={handlePasswordSubmit} style={{ width: '100%', display: 'flex', gap: '8px' }}>
          <input
            type="password"
            className="search-input"
            placeholder="Enter password"
            value={passwordInput}
            onChange={(e) => setPasswordInput(e.target.value)}
            autoFocus
            style={{ flex: 1 }}
          />
          <button type="submit" className="login-btn" style={{ width: 'auto', padding: '0 1.5rem' }} disabled={isVerifying}>
            {isVerifying ? '...' : promptAction === 'setup' ? 'Set' : 'Unlock'}
          </button>
        </form>
      </div>
    </div>
  );

  const renderDeleteModal = () => (
    <div className="interaction-overlay" onClick={() => setMessageToDelete(null)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      {/* ... existing delete modal content ... */}
      <div
        className="delete-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: 'var(--slate-800)' }}>Delete Message?</h3>
        <p style={{ margin: '0 0 1.5rem 0', color: 'var(--slate-500)', fontSize: '0.95rem' }}>
          Are you sure you want to delete this message? This action cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setMessageToDelete(null)}
            style={{ padding: '0.6rem 1rem', background: 'var(--slate-100)', border: 'none', borderRadius: '8px', color: 'var(--slate-700)', fontWeight: '600', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={() => handleDeleteMessage(messageToDelete)}
            style={{ padding: '0.6rem 1rem', background: '#ef4444', border: 'none', borderRadius: '8px', color: 'white', fontWeight: '600', cursor: 'pointer', boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)' }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );

  // Secure Inbox render karne ki logic
  const renderNotificationsModal = () => (
    <div className="interaction-overlay" onClick={() => setShowNotifications(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="delete-modal" onClick={e => e.stopPropagation()} style={{ width: '400px', maxHeight: '500px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, color: 'var(--slate-800)' }}>Secure Inbox</h3>
          <button onClick={() => setShowNotifications(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-400)' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        {notifications.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--slate-400)', padding: '2rem 0' }}>Thinking about passwords? Nothing here yet.</div>
        ) : (
          notifications.map(n => (
            <div key={n._id} style={{ padding: '1rem', borderBottom: '1px solid var(--slate-100)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span style={{ fontWeight: '600', color: 'var(--primary)' }}>{n.sender}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--slate-400)' }}>{new Date(n.createdAt).toLocaleDateString()}</span>
              </div>
              <div style={{ background: 'var(--slate-50)', padding: '0.75rem', borderRadius: '8px', fontFamily: 'monospace', textAlign: 'center', fontSize: '1.1rem', letterSpacing: '1px', border: '1px dashed var(--slate-300)' }}>
                {n.content}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                <button onClick={() => {
                  copyToClipboard(n.content);
                  // Delete after copy to ensure it doesn't stay
                  setNotifications(prev => prev.filter(x => x._id !== n._id));
                  fetch('/api/notifications', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n._id }) });
                }} style={{ flex: 1, padding: '0.5rem', background: 'var(--slate-100)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                  Copy
                </button>
                <button onClick={() => {
                  // Just delete/dismiss
                  setNotifications(prev => prev.filter(x => x._id !== n._id));
                  fetch('/api/notifications', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n._id }) });
                }} style={{ flex: 1, padding: '0.5rem', background: 'var(--slate-100)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                  Dismiss
                </button>
                <button onClick={() => {
                  const pwd = n.content;
                  const sender = n.sender;

                  setVerifiedPasswords(prev => ({ ...prev, [sender]: pwd }));
                  startChat({ username: sender }, pwd);

                  setShowPasswordPrompt(false);
                  setPasswordInput('');
                  setShowNotifications(false);

                  setNotifications(prev => prev.filter(x => x._id !== n._id));
                  fetch('/api/notifications', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n._id }) });
                }} style={{ width: '100%', padding: '0.6rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600' }}>
                  Unlock Chat
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="app-layout">
      {messageToDelete && renderDeleteModal()}
      {showNotifications && renderNotificationsModal()}
      {/* Sidebar */}
      <aside className={`sidebar ${showMobileChat ? 'mobile-hidden' : ''}`}>
        <header className="header" style={{ gap: '0.75rem', paddingLeft: '1.25rem' }}>
          <div onClick={() => setShowProfileModal(true)} style={{ cursor: 'pointer', position: 'relative' }} title="Profile Settings">
            <div className="avatar" style={{ width: '40px', height: '40px', fontSize: '1.1rem', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '12px', overflow: 'hidden' }}>
              {avatar ? (
                <img
                  src={avatar}
                  alt="Me"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    console.error("Avatar render failed");
                    e.target.style.display = 'none';
                    e.target.parentElement.innerHTML = user?.username?.charAt(0).toUpperCase() || '?';
                  }}
                />
              ) : (
                user?.username?.charAt(0).toUpperCase() || '?'
              )}
            </div>
            <div className="online-indicator-small" style={{ width: '10px', height: '10px', right: '-2px', bottom: '-2px' }} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0, lineHeight: 1, letterSpacing: '-0.02em', color: 'var(--primary)' }}>Hush</h2>
            <span style={{ fontSize: '0.7rem', color: 'var(--slate-500)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Private Messenger</span>
          </div>
          <button onClick={handleInvite} className="theme-toggle-btn" title="Invite a Friend" style={{ background: 'none', border: 'none', color: 'var(--slate-400)', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', transition: 'color 0.2s', borderRadius: '10px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
          </button>
          <button onClick={toggleTheme} className="theme-toggle-btn" title="Toggle Theme" style={{ background: 'none', border: 'none', color: 'var(--slate-400)', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', transition: 'color 0.2s', borderRadius: '10px' }}>
            {theme === 'light' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
            )}
          </button>
          <button onClick={() => setShowNotifications(true)} className="theme-toggle-btn" title="Secure Inbox" style={{ position: 'relative', background: 'none', border: 'none', color: notifications.length > 0 ? 'var(--primary)' : 'var(--slate-400)', cursor: 'pointer', padding: '0.5rem', display: 'flex', alignItems: 'center', transition: 'color 0.2s', borderRadius: '10px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            {notifications.length > 0 && <span style={{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', background: '#e11d48', borderRadius: '50%' }}></span>}
          </button>

          <button onClick={logout} className="logout-btn" title="Logout">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
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
            searchResults.length > 0 ? (
              searchResults.map(u => (
                <div key={u._id} className={`user-item ${activeChat?.username === u.username ? 'active' : ''}`} onClick={() => startChat(u)}>
                  <div className="avatar" style={{ background: 'var(--slate-200)', color: 'var(--slate-600)', position: 'relative', overflow: 'hidden' }}>
                    {u.avatar ? (
                      <img
                        src={u.avatar}
                        alt={u.username}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.parentElement.innerHTML = u.username[0].toUpperCase();
                        }}
                      />
                    ) : (
                      u.username[0].toUpperCase()
                    )}
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
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--slate-400)', fontSize: '0.9rem' }}>
                No users found matching "{searchQuery}"
              </div>
            )
          ) : (
            <>
              {recentContacts.length > 0 ? (
                recentContacts.map(u => (
                  <div key={u.username} className={`user-item ${activeChat?.username === u.username ? 'active' : ''}`} onClick={() => startChat(u)}>
                    <div className="avatar" style={{ background: 'var(--slate-200)', color: 'var(--slate-600)', position: 'relative', overflow: 'hidden' }}>
                      {u.avatar ? (
                        <img
                          src={u.avatar}
                          alt={u.username}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.parentElement.innerHTML = u.username[0].toUpperCase();
                          }}
                        />
                      ) : (
                        u.username[0].toUpperCase()
                      )}
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
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              </button>
              <div className="header-info"
                onClick={() => {
                  fetch(`/api/profile/${activeChat.username}`)
                    .then(res => res.json())
                    .then(data => {
                      setContactProfileData(data);
                      setShowContactProfileModal(true);
                    });
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0, paddingRight: '1rem', cursor: 'pointer' }}
              >
                <div className="avatar" style={{ width: '36px', height: '36px', position: 'relative', flexShrink: 0, overflow: 'hidden' }}>
                  {activeChat.avatar ? (
                    <img
                      src={activeChat.avatar}
                      alt={activeChat.username}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = activeChat.username[0].toUpperCase();
                      }}
                    />
                  ) : (
                    activeChat.username[0].toUpperCase()
                  )}
                  {onlineUsers.has(activeChat.username) && <div className="online-indicator-small"></div>}
                </div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: '1rem', margin: 0 }}>{activeChat.username}</h2>
                  <span style={{ fontSize: '0.75rem', color: 'var(--slate-500)' }}>
                    {isOtherUserTyping ? 'Typing...' : (onlineUsers.has(activeChat.username) ? 'Online' : 'Offline')}
                  </span>
                </div>
                <button className="lock-btn" onClick={handleSharePassword} title="Share Password / Setup" style={{ marginRight: '8px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
                </button>

                <button className="lock-btn" onClick={() => {
                  // Lock & Exit: Clear password, close chat, go back
                  if (activeChat) {
                    setVerifiedPasswords(prev => {
                      const next = { ...prev };
                      delete next[activeChat.username];
                      return next;
                    });
                    setActiveChat(null);
                    setMessages([]);
                    setShowMobileChat(false);
                  }
                }} title="Lock & Exit">
                  {/* Padlock Icon indicating 'Secure/Locked' status */}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                </button>
              </div>
            </header>

            {isCheckingStatus ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--slate-50)' }}>
                <div className="avatar" style={{ background: 'transparent', color: 'var(--primary)', boxShadow: 'none' }}>
                  <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                </div>
                <p style={{ marginTop: '1rem', color: 'var(--slate-500)' }}>Checking security...</p>
              </div>
            ) : (
              <>
                <div className="messages-area" onScroll={handleScroll}>
                  {showPasswordPrompt ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--slate-400)', gap: '1rem' }}>
                      <div className="avatar" style={{ background: 'var(--slate-100)', color: 'var(--slate-400)', width: '64px', height: '64px' }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                      </div>
                      <p style={{ fontWeight: '500' }}>Conversation Locked</p>
                    </div>
                  ) : (
                    <>
                      {isLoadingMore && <div className="loading-indicator">Loading older messages...</div>}
                      {isLoadingHistory ? (
                        <div className="loading-indicator" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px', height: '100%' }}>
                          <div className="avatar" style={{ background: 'transparent', color: 'var(--primary)', boxShadow: 'none' }}>
                            <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
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
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
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
                                  {m.progress !== undefined && m.isPending && (
                                    <div className="upload-progress-overlay">
                                      <div className="circular-progress" style={{ background: `conic-gradient(var(--primary) ${m.progress * 3.6}deg, rgba(255,255,255,0.2) 0deg)` }}>
                                        <div className="inner-circle"></div>
                                      </div>
                                    </div>
                                  )}
                                  <img
                                    src={m.content}
                                    alt="shared"
                                    className={m.isPending ? 'pending' : ''}
                                    onClick={() => setPreviewImage(m.content)}
                                  />
                                  {m.caption && (
                                    <div className="image-caption">{m.caption}</div>
                                  )}
                                </div>
                              )}



                              {m.type === 'otv' ? (
                                <div className="otv-message" style={{ background: 'var(--slate-50)', padding: '0.5rem', borderRadius: '8px', minWidth: '200px' }}>
                                  {m.isExpired ? (
                                    <span style={{ fontStyle: 'italic', color: 'var(--slate-400)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                                      Password Expired
                                    </span>
                                  ) : m.isRevealed ? (
                                    <div style={{ fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 'bold', padding: '0.5rem', background: '#e0e7ff', color: '#4338ca', borderRadius: '8px', textAlign: 'center', border: '1px dashed #4338ca' }}>
                                      {m.content}
                                    </div>
                                  ) : (
                                    <button onClick={() => viewOTV(m._id)} style={{ border: 'none', background: 'var(--primary)', color: 'white', padding: '0.6rem 1rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center', fontSize: '0.9rem', fontWeight: '500' }}>
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 11V7a5 5 0 0 1 10 0v4" /><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /></svg>
                                      Receive Password & Unlock
                                    </button>
                                  )}
                                </div>
                              ) : (m.type !== 'image' && (m.content === '[Decryption Failed]' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--slate-400)', fontStyle: 'italic' }}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                                  Locked Message
                                </div>
                              ) : m.content))}

                              <span className="message-time">
                                {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>

                              {m.sender === user.username && (
                                <span className={`ticks ${m.read ? 'read' : ''}`}>
                                  {m.isPending ? (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                  ) : (
                                    m.read ? ' ✓✓' : ' ✓'
                                  )}
                                </span>
                              )}

                              {m.sender === user.username && (
                                <button
                                  className="delete-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMessageToDelete(m._id);
                                  }}
                                  title="Delete message"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                              )}

                              {m.sender !== user.username && (
                                <button
                                  className="reaction-trigger"
                                  onClick={() => setReactingToMessage(m)}
                                  title="React"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>
                                </button>
                              )}

                              <button
                                className="reply-btn"
                                onClick={() => setReplyingTo(m)}
                                title="Reply"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>
                              </button>
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
                    </>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {previewImage && (
                  <div className="image-modal" onClick={() => setPreviewImage(null)}>
                    <button className="close-modal" onClick={(e) => { e.stopPropagation(); setPreviewImage(null); }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                    <img src={previewImage} alt="preview" onClick={(e) => e.stopPropagation()} />
                  </div>
                )}

                {imageToUpload && (
                  <div className="image-upload-overlay">
                    <button className="close-modal" onClick={() => setImageToUpload(null)}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
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
                      <button type="submit" className="send-btn" disabled={isSending}>
                        {isSending ? (
                          <div className="animate-spin" style={{ width: '20px', height: '20px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%' }}></div>
                        ) : (
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                        )}
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
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                            Photo
                          </div>
                        ) : (
                          replyingTo.content
                        )}
                      </div>
                    </div>
                    <button className="cancel-reply" onClick={() => setReplyingTo(null)}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                )}
                {showPasswordPrompt ? renderLockedState() : (
                  <form className={`input-area ${isInputFocused ? 'focused' : ''}`} onSubmit={sendMessage}>
                    <input
                      type="file"
                      accept="image/*"
                      ref={fileInputRef}
                      style={{ display: 'none' }}
                      onChange={handleImageSelect}
                    />
                    <button type="button" className="send-btn secondary" onClick={() => fileInputRef.current.click()} title="Send Image">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                    </button>
                    <textarea
                      ref={textareaRef}
                      className="message-input"
                      placeholder="Type a message..."
                      value={message}
                      onChange={handleTextChange}
                      onKeyDown={handleKeyDown}
                      onFocus={() => setIsInputFocused(true)}
                      onBlur={() => setIsInputFocused(false)}
                      rows="1"
                    />
                    <button type="submit" className="send-btn" disabled={!message.trim()}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                    </button>
                  </form>
                )}
              </>
            )}
          </>
        ) : (
          <div className="welcome-screen">
            <div className="avatar">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            </div>
            <div className="empty-state">
              <h3>Welcome to Hush</h3>
              <p>Select a chat or search for a user to start messaging securely.</p>
            </div>
          </div>
        )}
      </main>
      {inviteModalData && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', border: '1px solid var(--border-color)' }}>
            <div style={{ width: '56px', height: '56px', background: 'var(--primary)', borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem auto', boxShadow: '0 4px 6px -1px rgba(var(--primary-rgb), 0.3)' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
            </div>
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.25rem' }}>Invite a Friend</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.95rem', lineHeight: '1.5' }}>
              Share this unique link. The invite code is valid for one use only.
            </p>

            <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
              {inviteModalData}
            </div>

            <button
              onClick={() => copyToClipboard(inviteModalData)}
              style={{ width: '100%', padding: '0.875rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', marginBottom: '0.75rem', fontSize: '1rem', transition: 'transform 0.1s' }}
            >
              Copy Link
            </button>
            <button
              onClick={() => setInviteModalData(null)}
              style={{ width: '100%', padding: '0.875rem', background: 'transparent', color: 'var(--text-secondary)', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '0.95rem', fontWeight: '500' }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showProfileModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', border: '1px solid var(--border-color)' }}>
            <h3 style={{ margin: '0 0 1.5rem 0', color: 'var(--text-primary)', fontSize: '1.25rem' }}>Account Settings</h3>

            <div style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
                <div className="avatar" style={{ width: '100px', height: '100px', fontSize: '2.5rem', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '32px', overflow: 'hidden', border: '4px solid var(--bg-primary)', boxShadow: '0 8px 16px rgba(0,0,0,0.1)' }}>
                  {avatar ? (
                    <img
                      src={avatar}
                      alt="Profile"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = user?.username?.charAt(0).toUpperCase() || '?';
                      }}
                    />
                  ) : (
                    user?.username?.charAt(0).toUpperCase() || '?'
                  )}
                </div>
                <button
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = handleAvatarChange;
                    input.click();
                  }}
                  style={{ position: 'absolute', bottom: '-5px', right: '-5px', width: '32px', height: '32px', background: 'var(--primary)', color: 'white', border: '3px solid var(--bg-secondary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 8px rgba(0,0,0,0.2)' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
                </button>
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--primary)' }}>{user?.username || 'User'}</div>
            </div>

            <div style={{ textAlign: 'left', marginBottom: '2rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.75rem', letterSpacing: '0.05em' }}>Status Message</label>
              <input
                type="text"
                placeholder="Set your status..."
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={{ width: '100%', padding: '0.875rem', borderRadius: '12px', border: '2px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none', transition: 'border-color 0.2s', fontSize: '1rem' }}
              />
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
              style={{ width: '100%', padding: '1rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '14px', fontWeight: '700', cursor: 'pointer', marginBottom: '2rem', fontSize: '1rem', boxShadow: '0 4px 12px rgba(var(--primary-rgb), 0.3)' }}
            >
              {isSavingProfile ? 'Saving Changes...' : 'Save Changes'}
            </button>

            <button
              onClick={() => {
                setShowProfileModal(false);
                logout();
              }}
              style={{ width: '100%', padding: '1rem', background: 'var(--slate-200)', color: 'var(--slate-800)', border: 'none', borderRadius: '14px', fontWeight: '600', cursor: 'pointer', marginBottom: '1.5rem', fontSize: '1rem', transition: 'background 0.2s' }}
            >
              Log Out
            </button>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
              <p style={{ color: '#ef4444', fontWeight: 'bold', marginBottom: '0.5rem' }}>Danger Zone</p>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                Permanently delete your account and all messages. This cannot be undone.
              </p>

              <input
                type="password"
                placeholder="Enter password to confirm"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  marginBottom: '1rem',
                  fontSize: '0.9rem'
                }}
              />

              <button
                onClick={handleDeleteAccount}
                disabled={!deleteConfirmation || isDeleting}
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: '600',
                  cursor: (!deleteConfirmation || isDeleting) ? 'not-allowed' : 'pointer',
                  marginBottom: '0.75rem',
                  opacity: (!deleteConfirmation || isDeleting) ? 0.6 : 1
                }}
              >
                {isDeleting ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>

            <button
              onClick={() => { setShowProfileModal(false); setDeleteConfirmation(''); }}
              style={{ width: '100%', padding: '0.75rem', background: 'transparent', color: 'var(--text-secondary)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.95rem' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}