import React, { useState, useRef, useEffect } from 'react';
import {
  Phone,
  Video,
  Smile,
  Paperclip,
  Send,
  Mic,
  MoreVertical,
  Search,
  Lock,
  ArrowLeft
} from 'lucide-react';
import MessageBubble from './MessageBubble';
import { socket } from '../../services/socket';

const EMOJIS = ['👋', '👍', '❤️', '😂', '🔥', '🎉', '🙌', '😍', '🙏', '😊'];

export default function ChatView({
  currentUser,
  activeContact,
  messages,
  peerTyping,
  onSendMessage,
  onStartCall,
  onBackMobile
}) {
  const [inputText, setInputText] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, peerTyping]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputText(val);

    if (val.trim().length > 0) {
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        socket.emit('typing', { toPhone: activeContact.phone });
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        isTypingRef.current = false;
        socket.emit('stop-typing', { toPhone: activeContact.phone });
      }, 1500);
    } else {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        socket.emit('stop-typing', { toPhone: activeContact.phone });
      }
    }
  };

  const handleSend = (e) => {
    e?.preventDefault();
    if (!inputText.trim()) return;

    onSendMessage(inputText.trim());
    setInputText('');
    setShowEmojis(false);

    if (isTypingRef.current) {
      isTypingRef.current = false;
      socket.emit('stop-typing', { toPhone: activeContact.phone });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const insertEmoji = (emoji) => {
    setInputText(prev => prev + emoji);
    setShowEmojis(false);
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-[#0b141a] relative overflow-hidden">
      {/* WhatsApp Chat Header */}
      <div className="h-16 px-4 bg-[#202c33] flex items-center justify-between border-b border-[#2a3942]/40 z-20 shrink-0">
        <div className="flex items-center gap-3">
          {/* Mobile Back Button */}
          {onBackMobile && (
            <button
              onClick={onBackMobile}
              className="sm:hidden p-1 text-[#aebac1] hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}

          {/* Contact Avatar */}
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-[#2a3942] flex items-center justify-center font-bold text-white text-base overflow-hidden border border-[#374248]">
              {activeContact.avatar ? (
                <img src={activeContact.avatar} alt={activeContact.name} className="w-full h-full object-cover" />
              ) : (
                activeContact.name.charAt(0).toUpperCase()
              )}
            </div>
            {activeContact.isOnline && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#00a884] border-2 border-[#202c33]" />
            )}
          </div>

          {/* Contact Name & Status */}
          <div>
            <h3 className="text-sm font-medium text-white leading-tight">
              {activeContact.name}
            </h3>
            <p className="text-[11px] text-[#8696a0]">
              {peerTyping ? (
                <span className="text-[#00a884] font-medium">typing...</span>
              ) : activeContact.isOnline ? (
                <span className="text-[#00a884]">online</span>
              ) : (
                activeContact.phone
              )}
            </p>
          </div>
        </div>

        {/* WhatsApp Voice & Video Call Action Buttons */}
        <div className="flex items-center gap-1">
          {/* Voice Call Button */}
          <button
            onClick={() => onStartCall('audio')}
            className="p-2.5 text-[#aebac1] hover:text-[#00a884] hover:bg-[#374248]/50 rounded-full transition-colors"
            title="WhatsApp Voice Call"
          >
            <Phone className="w-4 h-4" />
          </button>

          {/* Video Call Button */}
          <button
            onClick={() => onStartCall('video')}
            className="p-2.5 text-[#aebac1] hover:text-[#00a884] hover:bg-[#374248]/50 rounded-full transition-colors"
            title="WhatsApp Video Call"
          >
            <Video className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* WhatsApp Chat Canvas with Doodle Wallpaper Background */}
      <div
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-1 relative"
        style={{
          backgroundImage: `radial-gradient(rgba(17, 27, 33, 0.95), rgba(11, 20, 26, 0.98)), url('data:image/svg+xml;utf8,<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><g fill="%23202c33" fill-opacity="0.3" fill-rule="evenodd"><path d="M0 40L40 0H20L0 20M40 40V20L20 40"/></g></svg>')`
        }}
      >
        {/* Encryption notice */}
        <div className="flex justify-center my-3">
          <div className="bg-[#182229] border border-[#202c33] text-[#ffeecd] text-[11px] px-3.5 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 max-w-sm text-center leading-relaxed">
            <Lock className="w-3 h-3 text-[#fcd34d] shrink-0" />
            <span>Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.</span>
          </div>
        </div>

        {/* Messages feed */}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isSelf={msg.from === currentUser.phone}
          />
        ))}

        {/* Real-time typing bubble */}
        {peerTyping && (
          <div className="flex justify-start my-1">
            <div className="bg-[#202c33] text-[#e9edef] px-3.5 py-2 rounded-lg rounded-tl-none text-xs flex items-center gap-1.5 shadow-sm">
              <span className="text-[#8696a0]">typing</span>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-[#00a884] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-[#00a884] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-[#00a884] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* WhatsApp Message Input Bar */}
      <div className="p-2 sm:p-3 bg-[#202c33] flex items-center gap-2 relative z-20 border-t border-[#2a3942]/30">
        {/* Quick Emoji Popover */}
        {showEmojis && (
          <div className="absolute bottom-full left-3 mb-2 p-2 bg-[#202c33] border border-[#2a3942] rounded-xl shadow-2xl flex gap-1 z-30">
            {EMOJIS.map(e => (
              <button
                key={e}
                type="button"
                onClick={() => insertEmoji(e)}
                className="p-1.5 hover:bg-[#374248] rounded-lg text-lg transition-transform active:scale-125"
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {/* Emoji Button */}
        <button
          type="button"
          onClick={() => setShowEmojis(!showEmojis)}
          className="p-2 text-[#8696a0] hover:text-white rounded-full transition-colors"
          title="Emojis"
        >
          <Smile className="w-5 h-5" />
        </button>

        {/* Attachment Button */}
        <button
          type="button"
          className="p-2 text-[#8696a0] hover:text-white rounded-full transition-colors hidden sm:block"
          title="Attach"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {/* Input Textbox */}
        <form onSubmit={handleSend} className="flex-1 flex items-center">
          <input
            type="text"
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message"
            className="w-full py-2.5 px-4 bg-[#2a3942] rounded-lg text-white placeholder-[#8696a0] text-sm focus:outline-none"
          />
        </form>

        {/* Send / Mic Button */}
        {inputText.trim() ? (
          <button
            type="button"
            onClick={handleSend}
            className="p-2.5 bg-[#00a884] hover:bg-[#02906f] text-white rounded-full shadow-md transition-transform active:scale-95"
            title="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            className="p-2.5 text-[#8696a0] hover:text-white rounded-full transition-colors"
            title="Voice message"
          >
            <Mic className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
