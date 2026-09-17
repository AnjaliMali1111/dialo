import React, { useState, useRef, useEffect } from 'react';
import { Send, Smile } from 'lucide-react';
import { socket } from '../services/socket';

const QUICK_EMOJIS = ['👋', '👍', '❤️', '😂', '🔥', '🎉'];

export default function MessageInput({ roomId, onSendMessage }) {
  const [text, setText] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  // Handle typing event notification to peer
  const handleInputChange = (e) => {
    const val = e.target.value;
    setText(val);

    if (val.trim().length > 0) {
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        socket.emit('typing', { roomId });
      }

      // Reset debounce
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        isTypingRef.current = false;
        socket.emit('stop-typing', { roomId });
      }, 1500);
    } else {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        socket.emit('stop-typing', { roomId });
      }
    }
  };

  const handleSend = (e) => {
    e?.preventDefault();
    if (!text.trim()) return;

    onSendMessage(text.trim());
    setText('');
    setShowEmojis(false);

    if (isTypingRef.current) {
      isTypingRef.current = false;
      socket.emit('stop-typing', { roomId });
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
    setText((prev) => prev + emoji);
    setShowEmojis(false);
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  return (
    <div className="p-3 sm:p-4 bg-gray-900/90 border-t border-gray-800/80 relative">
      {/* Quick emoji popover */}
      {showEmojis && (
        <div className="absolute bottom-full left-4 mb-2 p-2 bg-gray-800/95 backdrop-blur-md border border-gray-700 rounded-xl shadow-xl flex gap-1 z-20">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => insertEmoji(emoji)}
              className="p-1.5 hover:bg-gray-700/80 rounded-lg text-lg transition-transform active:scale-125"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSend} className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowEmojis(!showEmojis)}
          className="p-2.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800/80 rounded-xl transition-all shrink-0"
          title="Insert emoji"
        >
          <Smile className="w-5 h-5" />
        </button>

        <input
          type="text"
          value={text}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Press Enter to send)"
          className="flex-1 bg-gray-800/70 border border-gray-700/60 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />

        <button
          type="submit"
          disabled={!text.trim()}
          className="p-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white rounded-xl shadow-md shadow-blue-600/20 transition-all shrink-0 active:scale-95"
          title="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
