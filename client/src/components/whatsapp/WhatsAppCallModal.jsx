import React, { useEffect, useRef, useState } from 'react';
import {
  Phone,
  Video,
  PhoneOff,
  Mic,
  MicOff,
  VideoOff,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Sparkles,
  User
} from 'lucide-react';
import { formatDuration } from '../../utils/helpers';

export default function WhatsAppCallModal({
  peerUser,
  callState,
  callType,
  incomingCall,
  localStream,
  remoteStream,
  isAudioMuted,
  isVideoOff,
  peerAudioMuted,
  peerVideoOff,
  isVirtualFeed,
  callDuration,
  onAcceptCall,
  onRejectCall,
  onEndCall,
  onToggleAudio,
  onToggleVideo
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  // Play remote audio
  useEffect(() => {
    if (remoteAudioRef.current && remoteStream && callType === 'audio') {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(e => console.warn('Audio play failed:', e));
    }
  }, [remoteStream, callType]);

  // Bind local video
  useEffect(() => {
    if (localVideoRef.current && localStream && callType === 'video') {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, callType]);

  // Bind remote video
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream && callType === 'video') {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, callType]);

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
  const isVideo = callType === 'video';

  // 1. INCOMING CALL SCREEN
  if (callState === 'incoming' && incomingCall) {
    const isIncomingVideo = incomingCall.callType === 'video';
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
        <div className="w-full max-w-sm bg-[#111b21] rounded-3xl p-6 sm:p-8 text-center shadow-2xl border border-[#2a3942] relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-[#00a884]/15 via-transparent to-transparent pointer-events-none" />

          {/* Pulsing Avatar */}
          <div className="relative my-6 inline-block">
            <div className="absolute inset-0 rounded-full bg-[#00a884]/30 animate-ping pointer-events-none" />
            <div className="relative w-24 h-24 rounded-full bg-[#202c33] border-2 border-[#00a884] flex items-center justify-center text-white text-3xl font-bold shadow-xl overflow-hidden">
              {incomingCall.caller?.avatar ? (
                <img src={incomingCall.caller.avatar} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                incomingCall.caller?.name?.charAt(0) || 'U'
              )}
            </div>
          </div>

          <h3 className="text-xl font-bold text-white mb-1">
            {incomingCall.caller?.name || incomingCall.fromPhone}
          </h3>
          <p className="text-xs font-mono text-[#8696a0] mb-2">{incomingCall.fromPhone}</p>
          <p className="text-xs uppercase tracking-widest text-[#00a884] font-semibold mb-8">
            Incoming WhatsApp {isIncomingVideo ? 'Video Call' : 'Voice Call'}...
          </p>

          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-10">
            {/* Decline */}
            <button
              onClick={onRejectCall}
              className="flex flex-col items-center gap-1.5 group"
            >
              <div className="w-14 h-14 rounded-full bg-[#ea0038] hover:bg-[#c90030] flex items-center justify-center text-white shadow-lg shadow-red-600/30 transition-all transform group-active:scale-90">
                <PhoneOff className="w-6 h-6" />
              </div>
              <span className="text-xs text-[#8696a0] group-hover:text-white">Decline</span>
            </button>

            {/* Accept */}
            <button
              onClick={() => onAcceptCall(false)}
              className="flex flex-col items-center gap-1.5 group"
            >
              <div className="w-14 h-14 rounded-full bg-[#00a884] hover:bg-[#02906f] flex items-center justify-center text-white shadow-lg shadow-green-600/30 transition-all transform group-active:scale-90 animate-bounce">
                {isIncomingVideo ? <Video className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
              </div>
              <span className="text-xs text-[#8696a0] group-hover:text-white font-medium">Accept</span>
            </button>
          </div>

          {/* Virtual Stream Accept Option */}
          <div className="mt-8 pt-4 border-t border-[#202c33]">
            <button
              onClick={() => onAcceptCall(true)}
              className="inline-flex items-center gap-1.5 text-xs text-[#53bdeb] hover:underline"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Accept with Virtual Feed (No hardware needed)</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. ACTIVE AUDIO OR VIDEO CALL SCREEN
  if (callState === 'calling' || callState === 'connected') {
    return (
      <div
        ref={containerRef}
        className="fixed inset-0 z-50 flex flex-col bg-[#0b141a] text-white overflow-hidden select-none"
      >
        {/* Hidden Audio element for voice calls */}
        <audio ref={remoteAudioRef} autoPlay />

        {/* Top Header */}
        <div className="absolute top-0 inset-x-0 z-30 p-4 sm:p-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#202c33] border border-[#2a3942] flex items-center justify-center font-bold text-sm shadow-md overflow-hidden">
              {peerUser?.avatar ? (
                <img src={peerUser.avatar} alt={peerUser.name} className="w-full h-full object-cover" />
              ) : (
                peerUser?.name?.charAt(0) || <User className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-sm sm:text-base leading-tight">
                {peerUser?.name || peerUser?.phone}
              </h3>
              <div className="flex items-center gap-2 text-xs text-[#8696a0]">
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#00a884]' : 'bg-amber-400 animate-pulse'}`} />
                <span>
                  {isConnected
                    ? formatDuration(callDuration)
                    : isVideo
                    ? 'Calling video...'
                    : 'Calling...'}
                </span>
                {isVirtualFeed && (
                  <span className="px-1.5 py-0.5 bg-[#53bdeb]/20 text-[#53bdeb] text-[10px] rounded font-medium">
                    Virtual Feed
                  </span>
                )}
              </div>
            </div>
          </div>

          {isVideo && (
            <button
              onClick={toggleFullscreen}
              className="p-2.5 rounded-xl bg-black/40 hover:bg-black/60 border border-white/10 text-[#aebac1] transition-all backdrop-blur-md"
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          )}
        </div>

        {/* Call Body: Audio View vs Video View */}
        {!isVideo ? (
          /* WhatsApp Voice Call UI */
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            {/* Ambient Lighting */}
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-64 h-64 bg-[#00a884]/15 rounded-full blur-3xl pointer-events-none" />

            {/* Glowing Avatar */}
            <div className="relative my-8">
              {isConnected && (
                <>
                  <div className="absolute inset-0 -m-4 rounded-full border border-[#00a884]/20 animate-ping pointer-events-none" />
                  <div className="absolute inset-0 -m-8 rounded-full border border-[#00a884]/10 animate-pulse pointer-events-none" />
                </>
              )}
              <div className="w-36 h-36 rounded-full bg-[#111b21] border-2 border-[#00a884]/40 flex items-center justify-center shadow-2xl text-4xl font-bold overflow-hidden">
                {peerUser?.avatar ? (
                  <img src={peerUser.avatar} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  peerUser?.name?.charAt(0) || <User className="w-16 h-16" />
                )}
              </div>
            </div>

            <h3 className="text-2xl font-bold text-white mb-1">{peerUser?.name}</h3>
            <p className="text-sm font-mono text-[#8696a0] mb-4">{peerUser?.phone}</p>
            <p className="text-sm font-mono text-emerald-400">
              {isConnected ? formatDuration(callDuration) : 'Ringing...'}
            </p>

            {peerAudioMuted && (
              <div className="mt-4 flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                <VolumeX className="w-3.5 h-3.5" />
                <span>{peerUser?.name} has muted their microphone</span>
              </div>
            )}
          </div>
        ) : (
          /* WhatsApp HD Video Call UI */
          <div className="relative flex-1 w-full h-full flex items-center justify-center bg-black">
            {/* Remote Video */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className={`w-full h-full object-cover sm:object-contain transition-opacity duration-300 ${
                peerVideoOff || !remoteStream ? 'opacity-0' : 'opacity-100'
              }`}
            />

            {/* Remote Video Off Placeholder */}
            {(peerVideoOff || !remoteStream) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#111b21] p-6 text-center">
                <div className="w-32 h-32 rounded-full bg-[#202c33] border border-[#2a3942] flex items-center justify-center text-4xl font-bold mb-4 shadow-2xl overflow-hidden">
                  {peerUser?.avatar ? (
                    <img src={peerUser.avatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    peerUser?.name?.charAt(0) || <User className="w-16 h-16" />
                  )}
                </div>
                <h4 className="text-xl font-medium text-white mb-1">{peerUser?.name}</h4>
                <p className="text-sm text-[#8696a0]">
                  {peerVideoOff ? 'Camera is turned off' : 'Connecting video...'}
                </p>
              </div>
            )}

            {/* Floating Local Video (Picture-in-Picture) */}
            <div className="absolute bottom-28 right-4 sm:bottom-28 sm:right-8 z-30 w-32 h-44 sm:w-44 sm:h-60 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-[#111b21] backdrop-blur-md">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : 'block'}`}
                style={{ transform: 'scaleX(-1)' }}
              />

              {isVideoOff && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-[#202c33] text-[#8696a0] p-2 text-center">
                  <VideoOff className="w-6 h-6 mb-1 text-[#8696a0]" />
                  <span className="text-[11px]">Camera off</span>
                </div>
              )}

              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-[10px] font-medium text-[#e9edef] backdrop-blur-sm">
                You {isAudioMuted && '(Muted)'}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Call Control Actions */}
        <div className="absolute bottom-6 inset-x-0 z-30 flex items-center justify-center gap-4 px-4 pointer-events-auto">
          <div className="flex items-center gap-3 sm:gap-5 p-3 rounded-full bg-[#111b21]/90 backdrop-blur-xl border border-[#2a3942] shadow-2xl">
            {/* Mic Mute / Unmute */}
            <button
              onClick={onToggleAudio}
              className={`p-3.5 rounded-full transition-all active:scale-95 ${
                isAudioMuted
                  ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                  : 'bg-[#202c33] hover:bg-[#2a3942] text-white border border-[#374248]'
              }`}
              title={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isAudioMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>

            {/* Video Camera Toggle (only for video calls) */}
            {isVideo && (
              <button
                onClick={onToggleVideo}
                className={`p-3.5 rounded-full transition-all active:scale-95 ${
                  isVideoOff
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                    : 'bg-[#202c33] hover:bg-[#2a3942] text-white border border-[#374248]'
                }`}
                title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
              >
                {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>
            )}

            {/* End Call Button */}
            <button
              onClick={onEndCall}
              className="p-3.5 px-6 rounded-full bg-[#ea0038] hover:bg-[#c90030] text-white shadow-lg shadow-red-600/30 flex items-center gap-2 transition-all active:scale-95 font-medium text-sm"
              title="End Call"
            >
              <PhoneOff className="w-5 h-5" />
              <span className="hidden sm:inline">End Call</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
