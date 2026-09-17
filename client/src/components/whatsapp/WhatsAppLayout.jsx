import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './Sidebar';
import ChatView from './ChatView';
import NewChatModal from './NewChatModal';
import WhatsAppCallModal from './WhatsAppCallModal';
import { useWebRTC } from '../../hooks/useWebRTC';
import { socket } from '../../services/socket';
import { sounds } from '../../utils/sound';
import { Lock, MessageCircle, AlertCircle, X, Sparkles, HelpCircle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

export default function WhatsAppLayout({ currentUser, onLogout }) {
  const [chats, setChats] = useState([]);
  const [activeContact, setActiveContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [peerTyping, setPeerTyping] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);

  // WebRTC Hook bound to active contact and current user
  const {
    callState,
    callType,
    incomingCall,
    callPeer,
    localStream,
    remoteStream,
    isAudioMuted,
    isVideoOff,
    peerAudioMuted,
    peerVideoOff,
    isVirtualFeed,
    callDuration,
    mediaError,
    setMediaError,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleAudio,
    toggleVideo
  } = useWebRTC(activeContact, currentUser);

  // Load recent conversations
  const fetchChats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chats/${encodeURIComponent(currentUser.phone)}`);
      const data = await res.json();
      if (data.success) {
        setChats(data.chats);
      }
    } catch (e) {
      console.warn('Could not load chats:', e);
    }
  }, [currentUser.phone]);

  // Load messages when selecting a chat
  const handleSelectContact = async (contact) => {
    setActiveContact(contact);
    setPeerTyping(false);

    try {
      const res = await fetch(
        `${API_BASE}/api/messages/${encodeURIComponent(contact.phone)}?myPhone=${encodeURIComponent(currentUser.phone)}`
      );
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages);
      }

      // Tell the sender that messages have been read (triggers blue double checkmarks)
      socket.emit('mark-messages-read', { fromPhone: contact.phone });

      // Clear unread count locally in chat list
      setChats(prev =>
        prev.map(c => (c.user.phone === contact.phone ? { ...c, unreadCount: 0 } : c))
      );
    } catch (e) {
      console.warn('Could not load messages:', e);
    }
  };

  // Send message
  const handleSendMessage = (text) => {
    if (!activeContact) return;

    socket.emit('send-direct-message', {
      toPhone: activeContact.phone,
      text
    });
  };

  // Socket Connection & Real-time Listeners
  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    // Register phone on socket
    socket.emit('user-connected', { phone: currentUser.phone });
    fetchChats();

    // 1. Incoming Direct Message
    const handleReceiveMessage = (msg) => {
      console.log('[WhatsApp] Received message:', msg);

      // If from currently open chat:
      if (activeContact && (msg.from === activeContact.phone || msg.to === activeContact.phone)) {
        setMessages(prev => [...prev, msg]);
        socket.emit('mark-messages-read', { fromPhone: activeContact.phone });
      }

      // Play message chime
      if (msg.from !== currentUser.phone) {
        sounds.playMessageChime();
      }

      // Refresh chat list to show recent message snippet and unread count
      fetchChats();
    };

    // 2. Sent message acknowledgment
    const handleMessageSentAck = (msg) => {
      setMessages(prev => {
        // Prevent duplicate if already added
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      fetchChats();
    };

    // 3. Messages read receipt (turns checkmarks blue)
    const handleMessagesMarkedRead = ({ byPhone }) => {
      if (activeContact && activeContact.phone === byPhone) {
        setMessages(prev =>
          prev.map(m => (m.from === currentUser.phone ? { ...m, status: 'read' } : m))
        );
      }
      fetchChats();
    };

    // 4. Online/offline status updates
    const handleUserStatusChanged = ({ phone, isOnline }) => {
      setChats(prev =>
        prev.map(c =>
          c.user.phone === phone ? { ...c, user: { ...c.user, isOnline } } : c
        )
      );
      if (activeContact && activeContact.phone === phone) {
        setActiveContact(prev => ({ ...prev, isOnline }));
      }
    };

    // 5. Typing indicators
    const handlePeerTyping = ({ fromPhone }) => {
      if (activeContact && activeContact.phone === fromPhone) {
        setPeerTyping(true);
      }
    };

    const handlePeerStopTyping = ({ fromPhone }) => {
      if (activeContact && activeContact.phone === fromPhone) {
        setPeerTyping(false);
      }
    };

    socket.on('receive-direct-message', handleReceiveMessage);
    socket.on('message-sent-ack', handleMessageSentAck);
    socket.on('messages-marked-read', handleMessagesMarkedRead);
    socket.on('user-status-changed', handleUserStatusChanged);
    socket.on('peer-typing', handlePeerTyping);
    socket.on('peer-stop-typing', handlePeerStopTyping);

    return () => {
      socket.off('receive-direct-message', handleReceiveMessage);
      socket.off('message-sent-ack', handleMessageSentAck);
      socket.off('messages-marked-read', handleMessagesMarkedRead);
      socket.off('user-status-changed', handleUserStatusChanged);
      socket.off('peer-typing', handlePeerTyping);
      socket.off('peer-stop-typing', handlePeerStopTyping);
    };
  }, [currentUser.phone, activeContact, fetchChats]);

  return (
    <div className="h-screen w-screen flex bg-[#0c1317] text-[#e9edef] overflow-hidden select-none relative">
      {/* Media Device Error / Diagnostic Modal */}
      {mediaError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#111b21] w-full max-w-lg rounded-3xl p-6 sm:p-7 shadow-2xl border border-amber-500/30 text-left relative overflow-hidden">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    {mediaError.title || 'Could not access microphone/camera'}
                  </h3>
                  <p className="text-xs text-amber-300/90 mt-0.5">
                    {mediaError.message}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMediaError(null)}
                className="p-1 text-[#8696a0] hover:text-white rounded-lg hover:bg-[#202c33]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#182229] rounded-2xl p-4 border border-[#2a3942] my-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-300">
                <HelpCircle className="w-3.5 h-3.5 text-[#00a884]" />
                <span>How to enable camera & microphone:</span>
              </div>
              <ul className="text-xs text-[#8696a0] space-y-1.5 pl-4 list-disc">
                {(mediaError.tips || [
                  'Click the padlock icon in your browser URL address bar and choose "Allow".',
                  'In Windows Settings > Privacy & security > Camera/Microphone, turn ON desktop access.',
                  'Close any other tabs or apps using your webcam.'
                ]).map((tip, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => {
                  const targetType = mediaError.pendingCallType || 'video';
                  setMediaError(null);
                  startCall(targetType, activeContact, true);
                }}
                className="flex-1 py-3 px-4 bg-[#00a884] hover:bg-[#02906f] text-white font-medium rounded-xl shadow-lg flex items-center justify-center gap-2 text-xs transition-all active:scale-[0.98]"
              >
                <Sparkles className="w-4 h-4 text-emerald-200" />
                <span>Test Call with Virtual Feed (No Hardware Needed)</span>
              </button>
              <button
                onClick={() => setMediaError(null)}
                className="py-3 px-5 bg-[#202c33] hover:bg-[#2a3942] text-[#8696a0] hover:text-white text-xs font-medium rounded-xl border border-[#2a3942]"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Left Sidebar */}
      <div className={`${activeContact ? 'hidden sm:flex' : 'flex'} w-full sm:w-auto h-full relative`}>
        <Sidebar
          currentUser={currentUser}
          chats={chats}
          activeChat={activeContact}
          onSelectChat={handleSelectContact}
          onOpenNewChat={() => setShowNewChatModal(true)}
          onLogout={onLogout}
        />

        {/* New Chat Slide-in Modal */}
        {showNewChatModal && (
          <NewChatModal
            currentUser={currentUser}
            onSelectContact={handleSelectContact}
            onClose={() => setShowNewChatModal(false)}
          />
        )}
      </div>

      {/* WhatsApp Right Chat Panel */}
      <div className={`${!activeContact ? 'hidden sm:flex' : 'flex'} flex-1 h-full`}>
        {activeContact ? (
          <ChatView
            currentUser={currentUser}
            activeContact={activeContact}
            messages={messages}
            peerTyping={peerTyping}
            onSendMessage={handleSendMessage}
            onStartCall={(type) => startCall(type, activeContact)}
            onBackMobile={() => setActiveContact(null)}
          />
        ) : (
          /* WhatsApp Web Splash Screen (when no chat is selected) */
          <div className="flex-1 h-full flex flex-col items-center justify-center p-8 bg-[#222e35] text-center border-b-[6px] border-[#00a884] select-none">
            <div className="w-24 h-24 rounded-full bg-[#111b21] flex items-center justify-center text-[#8696a0] mb-6 shadow-xl">
              <MessageCircle className="w-14 h-14 text-[#00a884]" />
            </div>

            <h2 className="text-3xl font-light text-white mb-3">WhatsApp Web</h2>
            <p className="text-sm text-[#8696a0] max-w-md leading-relaxed mb-8">
              Send and receive messages without keeping your phone online.<br />
              Use WhatsApp on up to 4 linked devices and 1 phone at the same time.
            </p>

            <button
              onClick={() => setShowNewChatModal(true)}
              className="py-2.5 px-5 bg-[#00a884] hover:bg-[#02906f] text-white rounded-full text-sm font-medium shadow-md transition-transform active:scale-95"
            >
              Start a Conversation
            </button>

            <div className="mt-16 flex items-center gap-1.5 text-xs text-[#8696a0]">
              <Lock className="w-3.5 h-3.5 text-[#00a884]" />
              <span>End-to-end encrypted</span>
            </div>
          </div>
        )}
      </div>

      {/* WhatsApp Call Overlay (Incoming, Audio & Video) */}
      <WhatsAppCallModal
        peerUser={callPeer || activeContact}
        callState={callState}
        callType={callType}
        incomingCall={incomingCall}
        localStream={localStream}
        remoteStream={remoteStream}
        isAudioMuted={isAudioMuted}
        isVideoOff={isVideoOff}
        peerAudioMuted={peerAudioMuted}
        peerVideoOff={peerVideoOff}
        isVirtualFeed={isVirtualFeed}
        callDuration={callDuration}
        onAcceptCall={acceptCall}
        onRejectCall={rejectCall}
        onEndCall={endCall}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
      />
    </div>
  );
}
