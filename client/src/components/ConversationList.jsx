import React, { useState } from 'react';
import { Search, Plus, MessageSquare, LogOut, Phone, User, X } from 'lucide-react';
import { api } from '../services/api';

export default function ConversationList({
  currentUser,
  conversations,
  activeConversation,
  onSelectConversation,
  onNewConversation,
  onLogout
}) {
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchPhone, setSearchPhone] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!searchPhone || searchPhone.trim().length < 2) return;

    setSearching(true);
    setSearchError('');
    try {
      const res = await api.searchUsers(searchPhone.trim());
      if (res.success) {
        setSearchResults(res.users);
      } else {
        setSearchError(res.message || 'Error searching users');
      }
    } catch (err) {
      setSearchError('Failed to search users');
    } finally {
      setSearching(false);
    }
  };

  const handleStartChatWithUser = async (peerPhone) => {
    try {
      const res = await api.startConversation(peerPhone);
      if (res.success) {
        onNewConversation(res.conversation);
        setShowSearchModal(false);
        setSearchPhone('');
        setSearchResults([]);
      }
    } catch (err) {
      setSearchError('Failed to start chat');
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="w-full md:w-80 lg:w-96 flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col h-full">
      {/* User Header */}
      <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-cyan-500 text-white flex items-center justify-center font-bold text-sm shadow-md">
            {currentUser.name ? currentUser.name[0].toUpperCase() : currentUser.phone.slice(-2)}
          </div>
          <div className="overflow-hidden">
            <h2 className="font-semibold text-sm text-white truncate">{currentUser.name || 'You'}</h2>
            <p className="text-xs text-slate-400 font-mono truncate">{currentUser.phone}</p>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => setShowSearchModal(true)}
            title="Start new conversation"
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <Plus className="w-5 h-5 text-indigo-400" />
          </button>
          <button
            onClick={onLogout}
            title="Log out"
            className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Action button: Start new chat */}
      <div className="p-3 border-b border-slate-800/80">
        <button
          onClick={() => setShowSearchModal(true)}
          className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Chat by Phone</span>
        </button>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50">
        {conversations.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium text-slate-400">No conversations yet</p>
            <p className="text-xs text-slate-500 mt-1">Search a phone number to start chatting!</p>
          </div>
        ) : (
          conversations.map((convo) => {
            const isSelected = activeConversation?.id === convo.id;
            return (
              <button
                key={convo.id}
                onClick={() => onSelectConversation(convo)}
                className={`w-full p-3.5 flex items-start space-x-3 text-left transition-colors ${
                  isSelected ? 'bg-indigo-600/15 border-l-4 border-indigo-500' : 'hover:bg-slate-800/50'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 text-sm flex-shrink-0">
                  {convo.peerName ? convo.peerName[0].toUpperCase() : '👤'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-medium text-sm text-slate-200 truncate">
                      {convo.peerName || convo.peerPhone}
                    </span>
                    <span className="text-[10px] text-slate-500 ml-2 whitespace-nowrap">
                      {formatTime(convo.lastMessage?.timestamp || convo.updatedAt)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 truncate">
                    {convo.lastMessage?.text ? (
                      convo.lastMessage.senderPhone === currentUser.phone ? (
                        <span><span className="text-indigo-400">You: </span>{convo.lastMessage.text}</span>
                      ) : (
                        convo.lastMessage.text
                      )
                    ) : (
                      <span className="italic text-slate-500">Started a new conversation</span>
                    )}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Modal: Search & Start Conversation by Phone */}
      {showSearchModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white text-base">Start New Conversation</h3>
              <button
                onClick={() => { setShowSearchModal(false); setSearchResults([]); }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSearch} className="mb-4">
              <label className="block text-xs font-semibold text-slate-400 mb-1">
                Enter Peer Phone Number
              </label>
              <div className="flex space-x-2">
                <div className="relative flex-1">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    placeholder="+1000000002"
                    value={searchPhone}
                    onChange={(e) => setSearchPhone(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={searching}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {searching ? '...' : 'Search'}
                </button>
              </div>
            </form>

            {searchError && (
              <p className="text-xs text-rose-400 mb-3">{searchError}</p>
            )}

            {/* Search Results */}
            <div className="max-h-52 overflow-y-auto space-y-2">
              {searchResults.length > 0 ? (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Registered Users</p>
                  {searchResults.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/60 hover:border-indigo-500/50 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-white">{u.name || u.phone}</p>
                        <p className="text-xs text-slate-400 font-mono">{u.phone}</p>
                      </div>
                      <button
                        onClick={() => handleStartChatWithUser(u.phone)}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg"
                      >
                        Chat
                      </button>
                    </div>
                  ))}
                </div>
              ) : searchPhone && !searching ? (
                <div className="text-center py-4">
                  <p className="text-xs text-slate-400 mb-2">No user found matching this query.</p>
                  <button
                    type="button"
                    onClick={() => handleStartChatWithUser(searchPhone.trim())}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline font-medium"
                  >
                    Start chat with {searchPhone} anyway
                  </button>
                </div>
              ) : (
                <div className="p-3 text-center text-xs text-slate-500">
                  Search by registered phone number (e.g. +1000000002)
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
