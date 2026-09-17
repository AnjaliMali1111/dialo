import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Maximize2,
  Minimize2,
  User,
  VolumeX
} from 'lucide-react';
import { formatDuration } from '../utils/helpers';

export default function VideoCallModal({
  peer,
  callState,
  callDuration,
  localStream,
  remoteStream,
  isAudioMuted,
  isVideoOff,
  peerAudioMuted,
  peerVideoOff,
  onToggleAudio,
  onToggleVideo,
  onEndCall
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const containerRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Bind local stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Bind remote stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(err => console.warn(err));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(err => console.warn(err));
      setIsFullscreen(false);
    }
  };

  const isConnected = callState === 'connected';

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white overflow-hidden select-none"
    >
      {/* Top Bar Header */}
      <div className="absolute top-0 inset-x-0 z-30 p-4 sm:p-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm shadow-md ring-2 ring-white/20">
            {peer?.username ? peer.username.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="font-semibold text-sm sm:text-base leading-tight">
              {peer?.username || 'Peer'}
            </h3>
            <div className="flex items-center gap-2 text-xs text-gray-300">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-amber-400 animate-pulse'}`} />
              <span>{isConnected ? formatDuration(callDuration) : 'Connecting video...'}</span>
            </div>
          </div>
        </div>

        {/* Fullscreen Button */}
        <button
          onClick={toggleFullscreen}
          className="p-2.5 rounded-xl bg-black/40 hover:bg-black/60 border border-white/10 text-gray-200 transition-all backdrop-blur-md"
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Main Remote Video Area */}
      <div className="relative flex-1 w-full h-full flex items-center justify-center bg-gray-900">
        {/* Remote Video Stream Element */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover sm:object-contain transition-opacity duration-300 ${
            peerVideoOff || !remoteStream ? 'opacity-0' : 'opacity-100'
          }`}
        />

        {/* Fallback display if remote video is disabled or connecting */}
        {(peerVideoOff || !remoteStream) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-gray-900 to-gray-950 p-6 text-center">
            <div className="w-28 h-28 rounded-full bg-gray-800 border-2 border-gray-700 flex items-center justify-center text-gray-300 text-4xl font-bold mb-4 shadow-2xl">
              {peer?.username ? peer.username.charAt(0).toUpperCase() : <User className="w-14 h-14" />}
            </div>
            <h4 className="text-xl font-medium text-white mb-1">{peer?.username || 'Peer'}</h4>
            <p className="text-sm text-gray-400">
              {peerVideoOff ? 'Camera is turned off' : 'Waiting for video stream...'}
            </p>
          </div>
        )}

        {/* Peer Audio status notification overlay */}
        {peerAudioMuted && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-amber-500/30 text-amber-400 text-xs">
            <VolumeX className="w-3.5 h-3.5" />
            <span>{peer?.username || 'Peer'} is muted</span>
          </div>
        )}

        {/* Floating Local Video Picture-in-Picture */}
        <div className="absolute bottom-24 right-4 sm:bottom-28 sm:right-6 z-30 w-32 h-44 sm:w-44 sm:h-60 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-gray-900/90 backdrop-blur-md transition-all">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover mirror-mode ${isVideoOff ? 'hidden' : 'block'}`}
            style={{ transform: 'scaleX(-1)' }}
          />

          {isVideoOff && (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800/95 text-gray-400 p-2 text-center">
              <VideoOff className="w-6 h-6 mb-1 text-gray-500" />
              <span className="text-[11px]">Camera off</span>
            </div>
          )}

          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-[10px] font-medium text-gray-300 backdrop-blur-sm">
            You {isAudioMuted && '(Muted)'}
          </div>
        </div>
      </div>

      {/* Floating Bottom Controls */}
      <div className="absolute bottom-6 inset-x-0 z-30 flex items-center justify-center gap-4 px-4 pointer-events-auto">
        <div className="flex items-center gap-3 sm:gap-4 p-3 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl">
          {/* Mute Audio Toggle */}
          <button
            onClick={onToggleAudio}
            className={`p-3.5 rounded-xl transition-all active:scale-95 ${
              isAudioMuted
                ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
            }`}
            title={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Toggle Video Camera */}
          <button
            onClick={onToggleVideo}
            className={`p-3.5 rounded-xl transition-all active:scale-95 ${
              isVideoOff
                ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
            }`}
            title={isVideoOff ? 'Start camera' : 'Stop camera'}
          >
            {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>

          {/* End Call Button */}
          <button
            onClick={onEndCall}
            className="p-3.5 px-6 rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30 flex items-center gap-2 transition-all active:scale-95 font-medium text-sm"
            title="End Video Call"
          >
            <PhoneOff className="w-5 h-5" />
            <span className="hidden sm:inline">End Call</span>
          </button>
        </div>
      </div>
    </div>
  );
}
