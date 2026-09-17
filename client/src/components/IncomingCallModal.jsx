import React from 'react';
import { Phone, Video, PhoneOff, PhoneCall, Sparkles } from 'lucide-react';

export default function IncomingCallModal({ incomingCall, onAccept, onReject }) {
  if (!incomingCall) return null;

  const isVideo = incomingCall.callType === 'video';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="glass-panel w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl border border-blue-500/30 relative overflow-hidden">
        {/* Glowing background animation */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 via-transparent to-transparent pointer-events-none" />

        {/* Pulsing ring around avatar */}
        <div className="relative my-6 inline-block">
          <div className="absolute inset-0 rounded-full bg-blue-500/30 animate-ping" />
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/40 text-white">
            {isVideo ? (
              <Video className="w-10 h-10 animate-bounce" />
            ) : (
              <PhoneCall className="w-10 h-10 animate-pulse" />
            )}
          </div>
        </div>

        {/* Caller Info */}
        <h3 className="text-xl font-bold text-white mb-1">
          {incomingCall.callerName}
        </h3>
        <p className="text-xs uppercase tracking-widest text-blue-400 font-semibold mb-6">
          Incoming {isVideo ? 'Video Call' : 'Voice Call'}...
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-8">
          {/* Decline Button */}
          <button
            onClick={onReject}
            className="flex flex-col items-center gap-1.5 group"
          >
            <div className="w-14 h-14 rounded-full bg-red-600/90 hover:bg-red-500 flex items-center justify-center text-white shadow-lg shadow-red-600/30 transition-all transform group-active:scale-90">
              <PhoneOff className="w-6 h-6" />
            </div>
            <span className="text-xs text-gray-400 group-hover:text-gray-200">Decline</span>
          </button>

          {/* Standard Accept Button */}
          <button
            onClick={() => onAccept(false)}
            className="flex flex-col items-center gap-1.5 group"
          >
            <div className="w-14 h-14 rounded-full bg-green-600/90 hover:bg-green-500 flex items-center justify-center text-white shadow-lg shadow-green-600/30 transition-all transform group-active:scale-90 animate-bounce">
              {isVideo ? <Video className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
            </div>
            <span className="text-xs text-gray-400 group-hover:text-gray-200 font-medium">Accept</span>
          </button>
        </div>

        {/* Fallback Virtual Stream Option */}
        <div className="mt-6 pt-4 border-t border-gray-800">
          <button
            onClick={() => onAccept(true)}
            className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Accept with Virtual Feed (No Camera/Mic)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
