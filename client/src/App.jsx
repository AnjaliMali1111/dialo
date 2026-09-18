import React, { useState, useEffect, useCallback, useRef } from 'react';
import AuthScreen from './components/AuthScreen';
import ConversationList from './components/ConversationList';
import ChatArea from './components/ChatArea';
import CallModal from './components/CallModal';
import { socket } from './services/socket';
import { api } from './services/api';

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('dialo_user');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [callState, setCallState] = useState(null);

  // Keep a ref to activeConversation so socket event listeners read it without updater side effects
  const activeConversationRef = useRef(activeConversation);
  const callStateRef = useRef(callState);
  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const res = await api.getConversations();
      if (res.success) {
        setConversations(res.conversations);
        setActiveConversation(curr => {
          if (!curr && res.conversations.length > 0) {
            return res.conversations[0];
          }
          return curr;
        });
      }
    } catch (err) {
      console.error('Failed to load conversations', err);
    }
  }, []);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConversation?.id) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    api.getMessages(activeConversation.id).then(res => {
      if (isMounted && res.success) {
        setMessages(res.messages);
      }
    }).catch(err => {
      console.error('Failed to load messages', err);
    });

    return () => {
      isMounted = false;
    };
  }, [activeConversation?.id]);

  // Socket connection & event handlers
  useEffect(() => {
    if (!currentUser) return;

    if (!socket.connected) {
      socket.connect();
    }

    const onConnect = () => {
      console.log('[Dialo] Socket connected. Registering phone:', currentUser.phone);
      socket.emit('register-user', { phone: currentUser.phone });
    };

    if (socket.connected) {
      onConnect();
    } else {
      socket.on('connect', onConnect);
    }

    // New incoming text message
    const handleReceiveMessage = (msg) => {
      console.log('[Dialo] Incoming message received:', msg);

      const currentActive = activeConversationRef.current;
      const msgId = msg.id || msg._id;

      // If message belongs to current active chat, append with deduplication
      if (currentActive && (currentActive.id === msg.conversationId || currentActive.peerPhone === msg.senderPhone)) {
        setMessages((prev) => {
          if (msgId && prev.some(m => (m.id || m._id) === msgId)) {
            return prev;
          }
          return [...prev, msg];
        });
      }

      // Update conversation in sidebar
      setConversations((prev) => {
        const index = prev.findIndex(c => c.id === msg.conversationId || c.peerPhone === msg.senderPhone);
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            lastMessage: {
              text: msg.text,
              senderPhone: msg.senderPhone,
              timestamp: msg.createdAt
            },
            updatedAt: msg.createdAt
          };
          const [item] = updated.splice(index, 1);
          return [item, ...updated];
        } else {
          loadConversations();
          return prev;
        }
      });
    };

    // Message sent confirmation
    const handleMessageSent = (msg) => {
      const msgId = msg.id || msg._id;
      setMessages((prev) => {
        if (msgId && prev.some(m => (m.id || m._id) === msgId)) {
          return prev;
        }
        return [...prev, msg];
      });

      setConversations((prev) => {
        const index = prev.findIndex(c => c.id === msg.conversationId);
        if (index !== -1) {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            lastMessage: {
              text: msg.text,
              senderPhone: msg.senderPhone,
              timestamp: msg.createdAt
            },
            updatedAt: msg.createdAt
          };
          const [item] = updated.splice(index, 1);
          return [item, ...updated];
        }
        return prev;
      });
    };

    // Incoming WebRTC call -> launches call modal for receiver
    const handleIncomingCall = (data) => {
      console.log('[Dialo] Incoming call received from:', data.fromPhone, 'Type:', data.callType);
      if (callStateRef.current) return;
      setCallState({
        type: 'incoming',
        callType: data.callType || 'voice',
        peerPhone: data.fromPhone,
        peerName: data.callerName || data.fromPhone,
        offer: data.offer,
        roomId: data.roomId || crypto.randomUUID()
      });
    };

    socket.on('receive-message', handleReceiveMessage);
    socket.on('message-sent', handleMessageSent);
    socket.on('incoming-call', handleIncomingCall);

    loadConversations();

    return () => {
      socket.off('connect', onConnect);
      socket.off('receive-message', handleReceiveMessage);
      socket.off('message-sent', handleMessageSent);
      socket.off('incoming-call', handleIncomingCall);
    };
  }, [currentUser, loadConversations]);

  // Handle Authentication Success
  const handleAuthenticated = (user) => {
    setCurrentUser(user);
  };

  // Handle Logout
  const handleLogout = () => {
    if (socket.connected) {
      socket.disconnect();
    }
    localStorage.removeItem('dialo_token');
    localStorage.removeItem('dialo_user');
    setCurrentUser(null);
    setConversations([]);
    setActiveConversation(null);
    setMessages([]);
    setCallState(null);
  };

  // Handle Send Message
  const handleSendMessage = (text) => {
    if (!activeConversation || !text.trim()) return;

    socket.emit('send-message', {
      conversationId: activeConversation.id,
      toPhone: activeConversation.peerPhone,
      text: text.trim()
    });
  };

  // Handle Starting a Voice or Video Call (Sender)
  const handleStartCall = (callType) => {
    if (!activeConversation) return;

    setCallState({
      type: 'outgoing',
      callType,
      peerPhone: activeConversation.peerPhone,
      peerName: activeConversation.peerName || activeConversation.peerPhone,
      roomId: crypto.randomUUID()
    });
  };

  // Handle Ending or Closing a Call
  const handleEndCall = () => {
    setCallState(null);
  };

  // Handle Selecting a New or Different Conversation
  const handleNewConversation = (newConvo) => {
    setConversations(prev => {
      const exists = prev.find(c => c.id === newConvo.id);
      if (exists) return prev;
      return [newConvo, ...prev];
    });
    setActiveConversation(newConvo);
  };

  if (!currentUser) {
    return <AuthScreen onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Sidebar / Conversation List */}
      <ConversationList
        currentUser={currentUser}
        conversations={conversations}
        activeConversation={activeConversation}
        onSelectConversation={setActiveConversation}
        onNewConversation={handleNewConversation}
        onLogout={handleLogout}
      />

      {/* Main Chat Area */}
      <ChatArea
        conversation={activeConversation}
        messages={messages}
        currentUser={currentUser}
        onSendMessage={handleSendMessage}
        onStartCall={handleStartCall}
      />

      {/* WebRTC Call Overlay (Voice / Video) */}
      {callState && (
        <CallModal
          callState={callState}
          currentUser={currentUser}
          onEndCall={handleEndCall}
        />
      )}
    </div>
  );
}
