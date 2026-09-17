import React, { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { socket } from '../services/socket';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export default function CallModal({
  callState, // { type: 'incoming' | 'outgoing', callType: 'voice' | 'video', peerPhone, peerName, offer }
  currentUser,
  onEndCall
}) {
  // Call Modes: 'outgoing_ringing' | 'incoming_ringing' | 'connected' | 'declined' | 'failed' | 'ended'
  const [mode, setMode] = useState(
    callState.type === 'outgoing' ? 'outgoing_ringing' : 'incoming_ringing'
  );
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  // React state for streams — drives the binding effect below so that
  // whichever side mounts its <video> element *after* the stream is
  // already available still gets the stream attached correctly.
  const [remoteStream, setRemoteStream] = useState(null);
  const [localStream, setLocalStream] = useState(null);

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const ringIntervalRef = useRef(null);
  const timeoutTimerRef = useRef(null);
  const audioContextRef = useRef(null);

  const isVideoCall = callState.callType === 'video';
  const peerDisplay = callState.peerName || callState.peerPhone;

  // --- Pleasant Web Audio API Dual-Tone Telephone Ringing ---
  const startRingingTone = (isIncoming) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      const playRingBurst = () => {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') return;
        try {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc1.type = 'sine';
          osc2.type = 'sine';

          if (isIncoming) {
            // High melody chime for incoming call (523Hz + 659Hz)
            osc1.frequency.setValueAtTime(523.25, ctx.currentTime);
            osc2.frequency.setValueAtTime(659.25, ctx.currentTime);
          } else {
            // Standard telephone ringback tone for caller (440Hz + 480Hz)
            osc1.frequency.setValueAtTime(440, ctx.currentTime);
            osc2.frequency.setValueAtTime(480, ctx.currentTime);
          }

          gain.gain.setValueAtTime(0.04, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);

          osc1.start();
          osc2.start();
          osc1.stop(ctx.currentTime + 1.2);
          osc2.stop(ctx.currentTime + 1.2);
        } catch (e) {}
      };

      playRingBurst();
      ringIntervalRef.current = setInterval(playRingBurst, 3000);
    } catch (e) {
      console.warn('Could not initialize audio ring tone', e);
    }
  };

  const stopRingingTone = () => {
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
  };

  // --- Call Duration Timer (only runs when mode is 'connected') ---
  useEffect(() => {
    let timer = null;
    if (mode === 'connected') {
      timer = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [mode]);

  // --- Bind local + remote streams to their <video>/<audio> elements ---
  // Driven by state (not a one-shot assignment inside ontrack/getUserMedia)
  // so it re-runs and catches up whenever the ref becomes available —
  // e.g. right after `mode` flips to 'connected' and the video element mounts.
  useEffect(() => {
  if (remoteVideoRef.current && remoteStream && isVideoCall) {
    remoteVideoRef.current.srcObject = remoteStream;
    remoteVideoRef.current.play().catch(err => {
      console.warn('[Dialo WebRTC] Remote video play() blocked:', err);
    });
  }
  if (remoteAudioRef.current && remoteStream) {
    remoteAudioRef.current.srcObject = remoteStream;
    remoteAudioRef.current.play().catch(err => {
      console.warn('[Dialo WebRTC] Remote audio play() blocked:', err);
    });
  }
  if (localVideoRef.current && localStream && isVideoCall) {
    localVideoRef.current.srcObject = localStream;
  }
}, [remoteStream, localStream, mode, isVideoCall]);

  // Clean up all media tracks and connections
  const cleanupMediaAndPeer = () => {
    stopRingingTone();
    if (timeoutTimerRef.current) {
      clearTimeout(timeoutTimerRef.current);
      timeoutTimerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  };

  // --- WebRTC Setup & Socket Signaling Handlers ---
  useEffect(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionRef.current = pc;

    // 1. ICE Candidates transmission
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', {
          toPhone: callState.peerPhone,
          candidate: event.candidate
        });
      }
    };

    // 2. Incoming remote tracks
    pc.ontrack = (event) => {
      console.log('[Dialo WebRTC] Remote media track received:', event.track.kind);
      remoteStreamRef.current = event.streams[0];
      setRemoteStream(event.streams[0]); // triggers re-render / binding effect
    };

    // 3. Socket event: ICE Candidate from peer
    const onIceCandidate = ({ fromPhone, candidate }) => {
      if (fromPhone === callState.peerPhone && candidate) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => {
          console.warn('Error adding ice candidate:', e);
        });
      }
    };

    // 4. Socket event: Receiver accepted the call (fired on Caller)
    const onCallAccepted = async ({ fromPhone, answer }) => {
      if (fromPhone === callState.peerPhone && answer) {
        console.log('[Dialo WebRTC] Call accepted by peer! Establishing connection...');
        stopRingingTone();
        if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          setMode('connected');
        } catch (err) {
          console.error('Error applying remote answer:', err);
        }
      }
    };

    // 5. Socket event: Receiver rejected / declined the call (fired on Caller)
    const onCallRejected = ({ fromPhone }) => {
      if (fromPhone === callState.peerPhone) {
        console.log('[Dialo WebRTC] Call was declined by recipient.');
        stopRingingTone();
        if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);

        setMode('declined');
        setFeedbackMessage(`${peerDisplay} declined the call.`);
        setTimeout(() => {
          onEndCall();
        }, 2200);
      }
    };

    // 6. Socket event: Peer hung up or canceled
    const onCallEnded = () => {
      console.log('[Dialo WebRTC] Call ended by peer.');
      stopRingingTone();
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);

      setMode('ended');
      setFeedbackMessage('Call ended.');
      setTimeout(() => {
        onEndCall();
      }, 1500);
    };

    // 7. Socket event: Target user offline
    const onCallFailed = (data) => {
      console.log('[Dialo WebRTC] Call failed:', data.message);
      stopRingingTone();
      if (timeoutTimerRef.current) clearTimeout(timeoutTimerRef.current);

      setMode('failed');
      setFeedbackMessage(data.message || 'User is currently offline.');
      setTimeout(() => {
        onEndCall();
      }, 2500);
    };

    socket.on('ice-candidate', onIceCandidate);
    socket.on('call-accepted', onCallAccepted);
    socket.on('call-rejected', onCallRejected);
    socket.on('call-ended', onCallEnded);
    socket.on('call-failed', onCallFailed);

    // --- Caller Side: Initiate Outgoing Call ---
    if (callState.type === 'outgoing') {
      startRingingTone(false);

      timeoutTimerRef.current = setTimeout(() => {
        stopRingingTone();
        setMode('failed');
        setFeedbackMessage('No answer. Call timed out.');
        setTimeout(() => onEndCall(), 2500);
      }, 40000);

      navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideoCall
      }).then((stream) => {
        // Guard: if this pc was already closed/replaced, bail out
        if (peerConnectionRef.current !== pc || pc.signalingState === 'closed') {
          stream.getTracks().forEach(track => track.stop());
          return Promise.reject(new Error('Stale peer connection, aborting'));
        }

        localStreamRef.current = stream;
        setLocalStream(stream);

        stream.getTracks().forEach(track => pc.addTrack(track, stream));
        return pc.createOffer();
      }).then((offer) => {
        return pc.setLocalDescription(offer);
      }).then(() => {
        console.log('[Dialo WebRTC] Emitting call-user offer to:', callState.peerPhone);
        socket.emit('call-user', {
          toPhone: callState.peerPhone,
          offer: pc.localDescription,
          callType: callState.callType
        });
      }).catch(err => {
        if (err.message === 'Stale peer connection, aborting') {
          console.log('[Dialo WebRTC] Ignored stale getUserMedia resolution after remount.');
          return;
        }
        console.error('Media device permission error:', err);
        stopRingingTone();
        setMode('failed');
        setFeedbackMessage('Microphone/Camera permission denied.');
        setTimeout(() => onEndCall(), 2500);
      });
    }

    // --- Receiver Side: Ringing for Incoming Call ---
    if (callState.type === 'incoming') {
      startRingingTone(true);
    }

    return () => {
      socket.off('ice-candidate', onIceCandidate);
      socket.off('call-accepted', onCallAccepted);
      socket.off('call-rejected', onCallRejected);
      socket.off('call-ended', onCallEnded);
      socket.off('call-failed', onCallFailed);
      cleanupMediaAndPeer();
    };
  }, [callState.peerPhone, callState.callType]);

  // --- Receiver Action: Accept Call ---
  const handleAcceptCall = async () => {
    stopRingingTone();
    const pc = peerConnectionRef.current;
    if (!pc || pc.signalingState === 'closed') return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideoCall
      });

      // Guard: bail out if this pc was closed/replaced while we were waiting
      if (peerConnectionRef.current !== pc || pc.signalingState === 'closed') {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      localStreamRef.current = stream;
      setLocalStream(stream);

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Apply caller's offer
      await pc.setRemoteDescription(new RTCSessionDescription(callState.offer));

      // Create and set local answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Send answer back to caller
      socket.emit('answer-call', {
        toPhone: callState.peerPhone,
        answer: pc.localDescription
      });

      setMode('connected');
    } catch (err) {
      console.error('Error accepting call:', err);
      setMode('failed');
      setFeedbackMessage('Microphone/Camera access error.');
      setTimeout(() => onEndCall(), 2500);
    }
  };

  // --- Receiver Action: Decline Call ---
  const handleDeclineCall = () => {
    stopRingingTone();
    socket.emit('reject-call', { toPhone: callState.peerPhone });
    onEndCall();
  };

  // --- Caller Action: Cancel Call while waiting ---
  const handleCancelCall = () => {
    stopRingingTone();
    socket.emit('end-call', { toPhone: callState.peerPhone });
    onEndCall();
  };

  // --- In-Call Action: End Call ---
  const handleEndCallNow = () => {
    stopRingingTone();
    socket.emit('end-call', { toPhone: callState.peerPhone });
    onEndCall();
  };

  // --- In-Call Controls: Mute Microphone ---
  const handleToggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // --- In-Call Controls: Camera Toggle ---
  const handleToggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const formatTimer = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-xl flex flex-col items-center justify-center p-4">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col items-center justify-between min-h-[460px] p-8">

        {/* Header Badge & Contact Details */}
        <div className="text-center z-10 w-full">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-indigo-400 mb-3">
            {isVideoCall ? <Video className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
            <span className="capitalize">{callState.callType} Call</span>
          </div>

          <h2 className="text-2xl font-bold text-white mb-0.5 truncate">{peerDisplay}</h2>
          <p className="text-xs text-slate-400 font-mono mb-3">{callState.peerPhone}</p>

          {/* Status Indicators */}
          {mode === 'outgoing_ringing' && (
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium animate-pulse">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>Ringing... Waiting for {peerDisplay} to accept or decline</span>
            </div>
          )}

          {mode === 'incoming_ringing' && (
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-medium">
              <Phone className="w-3 h-3 animate-bounce text-indigo-400" />
              <span>Incoming Call... Choose to Accept or Decline</span>
            </div>
          )}

          {mode === 'connected' && (
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-mono font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>{formatTimer(callDuration)}</span>
            </div>
          )}

          {(mode === 'declined' || mode === 'failed' || mode === 'ended') && (
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-medium">
              <span>{feedbackMessage}</span>
            </div>
          )}
        </div>

        {/* Center Area: Video Preview or Avatar Pulse */}
        <div className="w-full flex-1 flex items-center justify-center my-6 relative">
          {isVideoCall && (mode === 'connected' || mode === 'outgoing_ringing') ? (
            <div className="relative w-full h-64 sm:h-72 bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center">
              {/* Remote Video feed (when connected) */}
              {mode === 'connected' ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-4">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-white text-2xl font-bold shadow-xl mb-3">
                    {peerDisplay ? peerDisplay[0].toUpperCase() : '👤'}
                  </div>
                  <p className="text-xs text-slate-400">Camera ready. Waiting for answer...</p>
                </div>
              )}

              {/* Local Picture-in-Picture Video */}
              <div className="absolute top-3 right-3 w-28 h-36 bg-slate-900 border border-slate-700/80 rounded-xl overflow-hidden shadow-xl">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
                />
                {isVideoOff && (
                  <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-[10px]">
                    <VideoOff className="w-5 h-5 mb-1" />
                    <span>Camera Off</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Voice Avatar with Animated Pulse Rings */
            <div className="relative flex flex-col items-center justify-center">
              {(mode === 'outgoing_ringing' || mode === 'incoming_ringing') && (
                <div className="absolute w-36 h-36 rounded-full bg-indigo-500/15 animate-ping pointer-events-none" />
              )}
              {mode === 'connected' && (
                <div className="absolute w-32 h-32 rounded-full bg-emerald-500/10 pointer-events-none animate-pulse" />
              )}
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-white text-3xl font-bold shadow-2xl border-4 border-slate-800 z-10">
                {peerDisplay ? peerDisplay[0].toUpperCase() : '👤'}
              </div>
            </div>
          )}
        </div>

        {/* Action Controls Footer */}
        <div className="flex items-center justify-center w-full z-10">
          {/* 1. OUTGOING CALL (SENDER WAITING) */}
          {mode === 'outgoing_ringing' && (
            <div className="flex flex-col items-center space-y-2">
              <button
                onClick={handleCancelCall}
                className="flex items-center space-x-2 px-6 py-3 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold shadow-lg shadow-rose-600/30 transition-transform active:scale-95"
              >
                <PhoneOff className="w-4 h-4" />
                <span>Cancel Call</span>
              </button>
              <p className="text-[11px] text-slate-400">Waiting for receiver response...</p>
            </div>
          )}

          {/* 2. INCOMING CALL (RECEIVER CHOOSES ACCEPT OR DECLINE) */}
          {mode === 'incoming_ringing' && (
            <div className="flex items-center space-x-8">
              {/* Decline Button */}
              <button
                onClick={handleDeclineCall}
                className="flex flex-col items-center space-y-1.5 group"
              >
                <div className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-600/30 transition-transform active:scale-95 group-hover:scale-105">
                  <PhoneOff className="w-6 h-6" />
                </div>
                <span className="text-xs text-rose-300 font-medium">Decline</span>
              </button>

              {/* Accept Button */}
              <button
                onClick={handleAcceptCall}
                className="flex flex-col items-center space-y-1.5 group"
              >
                <div className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-600/30 transition-transform active:scale-95 group-hover:scale-105 animate-bounce">
                  <Phone className="w-6 h-6" />
                </div>
                <span className="text-xs text-emerald-400 font-semibold">Accept</span>
              </button>
            </div>
          )}

          {/* 3. ACTIVE CONNECTED CALL CONTROLS */}
          {mode === 'connected' && (
            <div className="flex items-center space-x-4">
              {/* Mute Mic */}
              <button
                onClick={handleToggleMute}
                title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                className={`p-3.5 rounded-full transition-all ${
                  isMuted
                    ? 'bg-rose-600/20 text-rose-400 border border-rose-500/40'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
                }`}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {/* Camera Toggle (Video Call only) */}
              {isVideoCall && (
                <button
                  onClick={handleToggleVideo}
                  title={isVideoOff ? 'Turn Camera On' : 'Turn Camera Off'}
                  className={`p-3.5 rounded-full transition-all ${
                    isVideoOff
                      ? 'bg-rose-600/20 text-rose-400 border border-rose-500/40'
                      : 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  {isVideoOff ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </button>
              )}

              {/* End Call */}
              <button
                onClick={handleEndCallNow}
                title="End Call"
                className="flex items-center space-x-2 px-6 py-3.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold uppercase tracking-wider shadow-lg shadow-rose-600/30 transition-transform active:scale-95"
              >
                <PhoneOff className="w-4 h-4" />
                <span>End Call</span>
              </button>
            </div>
          )}

          {/* 4. CALL ENDED / DECLINED / FAILED */}
          {(mode === 'declined' || mode === 'failed' || mode === 'ended') && (
            <button
              onClick={onEndCall}
              className="px-6 py-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
