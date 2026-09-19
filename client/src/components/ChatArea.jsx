import React, { useState, useEffect, useRef } from 'react';
import { Phone, Video, Send, MessageSquare, CalendarClock, X } from 'lucide-react';
import { api } from '../services/api';

export default function ChatArea({
  conversation,
  messages,
  currentUser,
  onSendMessage,
  onStartCall
}) {
  const [inputText, setInputText] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [participantPhone, setParticipantPhone] = useState('');
  const [scheduleType, setScheduleType] = useState('video');
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduleMessage, setScheduleMessage] = useState('');
  const messagesEndRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-slate-500 p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-indigo-400/60 shadow-inner">
          <MessageSquare className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-semibold text-slate-300">Select a Conversation</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">
          Pick an existing conversation from the list or search for a phone number to start chatting.
        </p>
      </div>
    );
  }

  const handleSend = (e) => {
    e?.preventDefault();
    if (!inputText.trim()) return;

    onSendMessage(inputText.trim());
    setInputText('');
  };

  const formatMessageTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleSchedule = async (event) => {
    event.preventDefault();
    try {
      const result = await api.scheduleCall(
        participantPhone,
        scheduleType,
        new Date(scheduledAt).toISOString()
      );
      if (!result.success) {
        setScheduleMessage(result.message || 'Could not schedule call.');
        return;
      }
      setScheduleMessage('Call scheduled successfully.');
      setScheduledAt('');
      setTimeout(() => {
        setShowSchedule(false);
        setScheduleMessage('');
      }, 1200);
    } catch (error) {
      setScheduleMessage('Could not schedule call.');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Top Header with Voice & Video Call triggers */}
      <div className="h-16 px-6 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between flex-shrink-0 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-700 to-indigo-500 border border-indigo-400/30 flex items-center justify-center text-white font-semibold text-sm shadow">
            {conversation.peerName ? conversation.peerName[0].toUpperCase() : '👤'}
          </div>
          <div>
            <h2 className="font-semibold text-sm text-white leading-tight">
              {conversation.peerName || conversation.peerPhone}
            </h2>
            <p className="text-xs text-slate-400 font-mono">{conversation.peerPhone}</p>
          </div>
        </div>

        {/* Voice and Video Call Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onStartCall('voice')}
            title="Start Voice Call"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-600/20 text-slate-300 hover:text-emerald-400 border border-slate-700 hover:border-emerald-500/40 text-xs font-medium transition-all shadow-sm"
          >
            <Phone className="w-4 h-4" />
            <span className="hidden sm:inline">Voice Call</span>
          </button>

          <button
            onClick={() => onStartCall('video')}
            title="Start Video Call"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-indigo-600/20 text-slate-300 hover:text-indigo-400 border border-slate-700 hover:border-indigo-500/40 text-xs font-medium transition-all shadow-sm"
          >
            <Video className="w-4 h-4" />
            <span className="hidden sm:inline">Video Call</span>
          </button>
          <button
            onClick={() => {
              setParticipantPhone(conversation.peerPhone || '');
              setShowSchedule(true);
            }}
            title="Schedule a call"
            className="flex items-center space-x-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition-all hover:border-amber-500/40 hover:bg-amber-600/20 hover:text-amber-300"
          >
            <CalendarClock className="h-4 w-4" />
            <span className="hidden sm:inline">Schedule</span>
          </button>
        </div>
      </div>

      {showSchedule && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form onSubmit={handleSchedule} className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">Schedule a call</h3>
              </div>
              <button type="button" onClick={() => setShowSchedule(false)} className="text-slate-400 hover:text-white" title="Close"><X className="h-5 w-5" /></button>
            </div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Calling to</label>
            <input
              required
              type="tel"
              value={participantPhone}
              onChange={event => setParticipantPhone(event.target.value)}
              placeholder="Enter participant phone number"
              className="mb-4 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
            />
            <label className="mb-1 block text-xs font-medium text-slate-400">Call type</label>
            <select value={scheduleType} onChange={event => setScheduleType(event.target.value)} className="mb-4 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500">
              <option value="video">Video call</option>
              <option value="voice">Voice call</option>
            </select>
            <label className="mb-1 block text-xs font-medium text-slate-400">Date and time</label>
            <input required type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} className="mb-4 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500" />
            {scheduleMessage && <p className="mb-3 text-xs text-emerald-400">{scheduleMessage}</p>}
            <button type="submit" className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500">Schedule call</button>
          </form>
        </div>
      )}

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <p className="text-xs">No messages yet. Send a message to get started!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderPhone === currentUser.phone;
            return (
              <div
                key={msg.id || msg._id || `${msg.createdAt}-${Math.random()}`}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] sm:max-w-md rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                    isMe
                      ? 'bg-indigo-600 text-white rounded-br-sm'
                      : 'bg-slate-800/90 text-slate-100 border border-slate-700/60 rounded-bl-sm'
                  }`}
                >
                  <p className="break-words leading-relaxed">{msg.text}</p>
                  <p
                    className={`text-[10px] mt-1 text-right font-sans ${
                      isMe ? 'text-indigo-200/80' : 'text-slate-400'
                    }`}
                  >
                    {formatMessageTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-3 sm:p-4 bg-slate-900/90 border-t border-slate-800">
        <form onSubmit={handleSend} className="flex items-center space-x-2 max-w-4xl mx-auto">
          <input
            type="text"
            placeholder="Type a message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="flex-1 bg-slate-800/90 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl transition-all shadow-md shadow-indigo-600/20 disabled:opacity-40 disabled:hover:bg-indigo-600"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
