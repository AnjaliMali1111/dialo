import React, { useEffect, useRef } from 'react';
import { formatTime } from '../utils/helpers';
import { MessageSquare, ShieldCheck, User } from 'lucide-react';

export default function MessageList({ messages, selfId, peerTyping, peer }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, peerTyping]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
      {/* Welcome banner inside room */}
      <div className="text-center py-6 border-b border-gray-800/80 mb-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/10 text-blue-400 mb-2 ring-1 ring-blue-500/20">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-gray-200">1-on-1 Secure Session</h3>
        <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
          Messages and media calls are private between you and your peer.
        </p>
      </div>

      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-500 text-center">
          <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm">No messages yet.</p>
          <p className="text-xs text-gray-600 mt-1">Say hi to start the conversation!</p>
        </div>
      )}

      {messages.map((msg) => {
        const isSelf = msg.senderId === selfId;
        const isSystem = msg.isSystem;

        if (isSystem) {
          return (
            <div key={msg.id} className="flex justify-center my-2">
              <span className="text-[11px] bg-gray-800/70 border border-gray-700/40 text-gray-400 px-3 py-1 rounded-full">
                {msg.text}
              </span>
            </div>
          );
        }

        return (
          <div
            key={msg.id}
            className={`flex items-end gap-2.5 ${isSelf ? 'justify-end' : 'justify-start'}`}
          >
            {!isSelf && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                {msg.sender ? msg.sender.charAt(0).toUpperCase() : <User className="w-3.5 h-3.5" />}
              </div>
            )}

            <div
              className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm text-sm ${
                isSelf
                  ? 'bg-blue-600 text-white rounded-br-xs'
                  : 'bg-gray-800 border border-gray-700/60 text-gray-100 rounded-bl-xs'
              }`}
            >
              {!isSelf && (
                <div className="text-[11px] font-semibold text-indigo-300 mb-0.5">
                  {msg.sender}
                </div>
              )}
              <div className="break-words leading-relaxed whitespace-pre-wrap">{msg.text}</div>
              <div
                className={`text-[10px] mt-1 text-right ${
                  isSelf ? 'text-blue-200' : 'text-gray-400'
                }`}
              >
                {formatTime(msg.timestamp)}
              </div>
            </div>

            {isSelf && (
              <div className="w-7 h-7 rounded-full bg-blue-600/80 text-white flex items-center justify-center text-xs font-semibold shrink-0 ring-1 ring-blue-400/40">
                {msg.sender ? msg.sender.charAt(0).toUpperCase() : <User className="w-3.5 h-3.5" />}
              </div>
            )}
          </div>
        );
      })}

      {/* Typing indicator bubble */}
      {peerTyping && (
        <div className="flex items-end gap-2.5 justify-start">
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center text-xs font-semibold shrink-0">
            {peer?.username ? peer.username.charAt(0).toUpperCase() : 'P'}
          </div>
          <div className="bg-gray-800 border border-gray-700/60 text-gray-300 rounded-2xl rounded-bl-xs px-4 py-2.5 flex items-center gap-1.5 shadow-sm">
            <span className="text-xs text-gray-400 mr-1">{peer?.username || 'Peer'} is typing</span>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
