import React, { useState } from 'react';
import { generateRoomId } from '../utils/helpers';
import { Video, Phone, MessageSquare, Shield, ArrowRight, Sparkles, User, KeyRound } from 'lucide-react';

export default function Lobby({ onJoinRoom }) {
  const [username, setUsername] = useState('');
  const [roomIdInput, setRoomIdInput] = useState('');
  const [error, setError] = useState('');

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter your display name to continue.');
      return;
    }
    const newRoomId = generateRoomId();
    onJoinRoom({ roomId: newRoomId, username: username.trim() });
  };

  const handleJoinExistingRoom = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter your display name.');
      return;
    }
    if (!roomIdInput.trim()) {
      setError('Please enter a valid Room ID to join.');
      return;
    }
    onJoinRoom({ roomId: roomIdInput.trim().toUpperCase(), username: username.trim() });
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-8 bg-gradient-to-br from-[#070a12] via-[#0d1424] to-[#0a1128] relative overflow-hidden">
      {/* Background glow accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main card */}
      <div className="w-full max-w-md relative z-10">
        {/* Logo and header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-xl shadow-blue-500/25 mb-4 ring-1 ring-white/20">
            <Video className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
            SyncLine
          </h1>
          <p className="text-sm text-gray-400 max-w-xs mx-auto">
            Direct 1-on-1 private real-time communication with chat, voice & HD video.
          </p>
        </div>

        {/* Form Card */}
        <div className="glass-panel rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              {error}
            </div>
          )}

          {/* Username Input */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Your Display Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError('');
                }}
                placeholder="e.g. Alex Rivera"
                maxLength={30}
                className="w-full pl-10 pr-4 py-3 bg-gray-900/80 border border-gray-700/60 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
              />
            </div>
          </div>

          <div className="space-y-3">
            {/* Create Room Button */}
            <button
              onClick={handleCreateRoom}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-xl shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 transition-all transform active:scale-[0.98]"
            >
              <Sparkles className="w-4 h-4" />
              <span>Create New Private Room</span>
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-gray-700/60"></div>
              <span className="flex-shrink mx-4 text-xs uppercase tracking-widest text-gray-500">Or Join With Code</span>
              <div className="flex-grow border-t border-gray-700/60"></div>
            </div>

            {/* Join Room Input & Button */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-500">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={roomIdInput}
                  onChange={(e) => {
                    setRoomIdInput(e.target.value.toUpperCase());
                    setError('');
                  }}
                  placeholder="e.g. ROOM-7X9Q"
                  className="w-full pl-10 pr-4 py-3 bg-gray-900/80 border border-gray-700/60 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm uppercase tracking-wider"
                />
              </div>
              <button
                onClick={handleJoinExistingRoom}
                className="px-5 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 font-medium rounded-xl flex items-center gap-1.5 transition-all active:scale-[0.98]"
              >
                <span>Join</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Feature Badges */}
        <div className="grid grid-cols-3 gap-3 mt-6 text-center">
          <div className="p-3 rounded-xl bg-gray-900/40 border border-gray-800/60">
            <MessageSquare className="w-4 h-4 text-blue-400 mx-auto mb-1.5" />
            <p className="text-[11px] font-medium text-gray-300">Live Chat</p>
            <p className="text-[10px] text-gray-500">Instant delivery</p>
          </div>
          <div className="p-3 rounded-xl bg-gray-900/40 border border-gray-800/60">
            <Phone className="w-4 h-4 text-green-400 mx-auto mb-1.5" />
            <p className="text-[11px] font-medium text-gray-300">Voice Call</p>
            <p className="text-[10px] text-gray-500">Low-latency</p>
          </div>
          <div className="p-3 rounded-xl bg-gray-900/40 border border-gray-800/60">
            <Video className="w-4 h-4 text-indigo-400 mx-auto mb-1.5" />
            <p className="text-[11px] font-medium text-gray-300">HD Video</p>
            <p className="text-[10px] text-gray-500">WebRTC P2P</p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 mt-6 text-xs text-gray-500">
          <Shield className="w-3.5 h-3.5 text-blue-400/80" />
          <span>Strict 2-person limit & direct peer-to-peer encryption</span>
        </div>
      </div>
    </div>
  );
}
