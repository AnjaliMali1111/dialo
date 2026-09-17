import React, { useEffect, useRef } from 'react';
import { Mic, MicOff, PhoneOff, User, Volume2, VolumeX } from 'lucide-react';
import { formatDuration } from '../utils/helpers';

export default function AudioCallModal({
  peer,
  callState,
  callDuration,
  isAudioMuted,
  peerAudioMuted,
  remoteStream,
  onToggleAudio,
  onEndCall
}) {
  const remoteAudioRef = useRef(null);

  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(e => console.warn('Audio autoplay failed:', e));
    }
  }, [remoteStream]);

  const isConnected = callState === 'connected';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      {/* Hidden audio element for remote audio stream playback */}
      <audio ref={remoteAudioRef} autoPlay />

      <div className="glass-panel w-full max-w-sm rounded-3xl p-6 sm:p-8 text-center shadow-2xl border border-gray-700/60 relative overflow-hidden flex flex-col items-center">
        {/* Background ambient lighting */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-green-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Status text */}
        <div className="text-xs uppercase tracking-widest text-green-400 font-semibold mb-6 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          {isConnected ? 'Voice Call Active' : 'Connecting Audio Call...'}
        </div>

        {/* Avatar with pulsing rings */}
        <div className="relative my-4">
          {isConnected && (
            <>
              <div className="absolute inset-0 -m-3 rounded-full border border-green-500/20 animate-ping pointer-events-none" />
              <div className="absolute inset-0 -m-6 rounded-full border border-green-500/10 animate-pulse pointer-events-none" />
            </>
          )}
          <div className="w-28 h-28 rounded-full bg-gradient-to-tr from-gray-800 to-gray-700 border-2 border-green-500/40 flex items-center justify-center shadow-xl text-white text-3xl font-bold">
            {peer?.username ? peer.username.charAt(0).toUpperCase() : <User className="w-12 h-12" />}
          </div>
        </div>

        {/* Peer name and duration */}
        <h3 className="text-2xl font-bold text-white mt-4 mb-1">
          {peer?.username || 'Peer'}
        </h3>
        <p className="text-sm font-mono text-gray-300 mb-6">
          {isConnected ? formatDuration(callDuration) : 'Calling...'}
        </p>

        {/* Peer Audio status notification */}
        {peerAudioMuted && (
          <div className="mb-6 flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
            <VolumeX className="w-3.5 h-3.5" />
            <span>Peer has muted their microphone</span>
          </div>
        )}

        {/* Controls Bar */}
        <div className="flex items-center gap-4 mt-2">
          {/* Mute / Unmute Button */}
          <button
            onClick={onToggleAudio}
            className={`p-4 rounded-full border transition-all active:scale-95 ${
              isAudioMuted
                ? 'bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30'
                : 'bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700'
            }`}
            title={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isAudioMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>

          {/* End Call Button */}
          <button
            onClick={onEndCall}
            className="p-4 rounded-full bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 transition-all active:scale-95"
            title="End Call"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
