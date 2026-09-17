import React, { useState } from 'react';
import {
  MessageSquarePlus,
  Search,
  LogOut,
  User,
  Check,
  CheckCheck,
  PhoneCall
} from 'lucide-react';
import { formatTime } from '../../utils/helpers';

export default function Sidebar({
  currentUser,
  chats,
  activeChat,
  onSelectChat,
  onOpenNewChat,
  onLogout
}) {
  const [search, setSearch] = useState('');

  const filteredChats = chats.filter(c =>
    c.user.name.toLowerCase().includes(search.toLowerCase()) ||
    c.user.phone.includes(search)
  );

  return (
    <div className="w-full sm:w-[380px] lg:w-[420px] h-full flex flex-col bg-[#111b21] border-r border-[#202c33] select-none shrink-0">
      {/* Top Profile Header */}
      <div className="h-16 px-4 bg-[#202c33] flex items-center justify-between border-b border-[#2a3942]/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center text-white font-bold text-base overflow-hidden border border-[#374248]">
            {currentUser.avatar ? (
              <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover" />
            ) : (
              currentUser.name.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <h2 className="text-sm font-medium text-white leading-tight truncate max-w-[150px]">
              {currentUser.name}
            </h2>
            <span className="text-[11px] text-[#8696a0] font-mono">{currentUser.phone}</span>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1">
          {/* New Chat Button */}
          <button
            onClick={onOpenNewChat}
            className="p-2 text-[#aebac1] hover:text-white hover:bg-[#374248]/50 rounded-full transition-colors"
            title="New Chat"
          >
            <MessageSquarePlus className="w-5 h-5" />
          </button>

          {/* Logout Button */}
          <button
            onClick={onLogout}
            className="p-2 text-[#aebac1] hover:text-red-400 hover:bg-[#374248]/50 rounded-full transition-colors"
            title="Log out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-2 bg-[#111b21] border-b border-[#202c33]/50">
        <div className="relative flex items-center bg-[#202c33] rounded-lg px-3 py-1.5">
          <Search className="w-4 h-4 text-[#8696a0] mr-3 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or start new chat"
            className="w-full bg-transparent text-white placeholder-[#8696a0] focus:outline-none text-xs"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#202c33]/30">
        {filteredChats.length === 0 && (
          <div className="p-8 text-center text-xs text-[#8696a0]">
            <p>No conversations yet.</p>
            <button
              onClick={onOpenNewChat}
              className="mt-3 px-3 py-1.5 bg-[#00a884] text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              <span>Start a New Chat</span>
            </button>
          </div>
        )}

        {filteredChats.map((item) => {
          const isSelected = activeChat?.phone === item.user.phone;
          const lastMsg = item.lastMessage;
          const isOutgoing = lastMsg && lastMsg.from === currentUser.phone;

          return (
            <button
              key={item.user.phone}
              type="button"
              onClick={() => onSelectChat(item.user)}
              className={`w-full px-3 py-3 flex items-center gap-3 transition-colors text-left ${
                isSelected ? 'bg-[#2a3942]' : 'hover:bg-[#202c33]'
              }`}
            >
              {/* Contact Avatar */}
              <div className="relative shrink-0">
                <div className="w-12 h-12 rounded-full bg-[#2a3942] flex items-center justify-center font-bold text-white text-base overflow-hidden border border-[#374248]">
                  {item.user.avatar ? (
                    <img src={item.user.avatar} alt={item.user.name} className="w-full h-full object-cover" />
                  ) : (
                    item.user.name.charAt(0).toUpperCase()
                  )}
                </div>
                {item.user.isOnline && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#00a884] border-2 border-[#111b21]" />
                )}
              </div>

              {/* Chat details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-white text-sm font-medium truncate">
                    {item.user.name}
                  </span>
                  {lastMsg && (
                    <span className="text-[11px] text-[#8696a0]">
                      {formatTime(lastMsg.timestamp)}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-[#8696a0] truncate flex items-center gap-1 max-w-[220px]">
                    {isOutgoing && lastMsg && (
                      <span className="shrink-0">
                        {lastMsg.status === 'read' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                        ) : lastMsg.status === 'delivered' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-[#8696a0]" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-[#8696a0]" />
                        )}
                      </span>
                    )}
                    <span>{lastMsg ? lastMsg.text : item.user.bio}</span>
                  </p>

                  {/* Unread message badge */}
                  {item.unreadCount > 0 && (
                    <span className="w-5 h-5 rounded-full bg-[#00a884] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                      {item.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
