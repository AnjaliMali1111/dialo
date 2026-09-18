import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, UserPlus, Video, VideoOff, X } from 'lucide-react';
import { socket } from '../services/socket';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ]
};

function MediaTile({ stream, isVideo, muted, label, local = false }) {
  const mediaRef = useRef(null);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    const checkVideo = () => {
      if (!stream) {
        setHasVideo(false);
        return;
      }
      const vTracks = stream.getVideoTracks();
      const active = vTracks.some(t => t.enabled && t.readyState === 'live');
      setHasVideo(active);
    };

    if (stream) {
      el.srcObject = stream;
      el.play?.().catch(() => {});
      checkVideo();
      stream.addEventListener('addtrack', checkVideo);
      stream.addEventListener('removetrack', checkVideo);
    } else {
      el.srcObject = null;
      setHasVideo(false);
    }

    return () => {
      if (stream) {
        stream.removeEventListener('addtrack', checkVideo);
        stream.removeEventListener('removetrack', checkVideo);
      }
    };
  }, [stream]);

  if (!isVideo) {
    return (
      <div className="flex min-h-32 items-center gap-4 rounded-2xl border border-slate-700 bg-slate-950 p-5 shadow-lg">
        <audio ref={mediaRef} autoPlay playsInline muted={muted} />
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xl font-bold">
          {(label || 'U').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white truncate">{label}</p>
          <p className="text-xs text-emerald-400">Voice connected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[200px] overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 flex items-center justify-center shadow-lg">
      <video
        ref={mediaRef}
        autoPlay
        playsInline
        muted={muted}
        className={`h-full w-full object-cover ${local ? 'scale-x-[-1]' : ''} ${hasVideo ? 'block' : 'hidden'}`}
      />
      {!hasVideo && (
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600 text-2xl font-bold text-white shadow-lg animate-pulse">
            {(label || 'U').charAt(0).toUpperCase()}
          </div>
          <p className="text-xs text-slate-400 font-medium">{local ? 'Camera loading or off' : `${label} connecting...`}</p>
        </div>
      )}
      <span className="absolute bottom-2 left-2 rounded-md bg-black/70 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-white shadow">
        {label}
      </span>
    </div>
  );
}

export default function CallModal({ callState, currentUser, onEndCall }) {
  const [mode, setMode] = useState(callState.type === 'outgoing' ? 'outgoing_ringing' : 'incoming_ringing');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');

  const pcsRef = useRef(new Map());
  const candidatesRef = useRef(new Map());
  const pendingOffersRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const roomIdRef = useRef(callState.roomId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString()));
  const isVideo = callState.callType === 'video';
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Filter out current user from remote participant tiles
  const participants = Object.values(remoteStreams).filter(
    (p) => p && p.phone && p.phone !== currentUser.phone
  );

  const drainCandidateQueue = async (phone, pc) => {
    const queued = candidatesRef.current.get(phone) || [];
    candidatesRef.current.delete(phone);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn(`[Dialo] Error adding queued ICE candidate for ${phone}:`, err);
      }
    }
  };

  const getLocalMedia = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.warn('[Dialo] Ideal media constraints failed, falling back to basic constraints...', err);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    }
  };

  const removePeer = (phone) => {
    if (!phone) return;
    const pc = pcsRef.current.get(phone);
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.close();
      pcsRef.current.delete(phone);
    }
    candidatesRef.current.delete(phone);
    pendingOffersRef.current.delete(phone);

    setRemoteStreams((prev) => {
      const next = { ...prev };
      delete next[phone];
      return next;
    });

    if (pcsRef.current.size === 0 && modeRef.current === 'connected') {
      onEndCall();
    }
  };

  const createPeer = (phone, shouldOffer = false) => {
    if (!phone || phone === currentUser.phone) return null;
    const existing = pcsRef.current.get(phone);
    if (existing) {
      if (localStreamRef.current) {
        const senders = existing.getSenders();
        localStreamRef.current.getTracks().forEach((track) => {
          if (!senders.some((s) => s.track && s.track.id === track.id)) {
            try {
              existing.addTrack(track, localStreamRef.current);
            } catch (e) {}
          }
        });
      }
      return existing;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcsRef.current.set(phone, pc);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, localStreamRef.current);
        } catch (e) {
          console.warn(`[Dialo] Error adding track to peer ${phone}:`, e);
        }
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', {
          toPhone: phone,
          candidate: event.candidate,
          fromPhone: currentUser.phone
        });
      }
    };

    pc.ontrack = (event) => {
      console.log(`[Dialo] ontrack from ${phone}, kind:`, event.track?.kind);
      const incomingStream = (event.streams && event.streams[0]) || null;
      setRemoteStreams((prev) => {
        const currentEntry = prev[phone];
        let streamToUse = incomingStream;
        if (currentEntry?.stream) {
          streamToUse = currentEntry.stream;
          if (event.track && !streamToUse.getTracks().some((t) => t.id === event.track.id)) {
            streamToUse.addTrack(event.track);
          }
        } else if (!streamToUse && event.track) {
          streamToUse = new MediaStream([event.track]);
        }

        return {
          ...prev,
          [phone]: {
            phone,
            name: currentEntry?.name || phone,
            stream: streamToUse
          }
        };
      });
    };

    pc.onconnectionstatechange = () => {
      console.log(`[Dialo] Connection state with ${phone}: ${pc.connectionState}`);
      if (['failed', 'closed'].includes(pc.connectionState)) {
        removePeer(phone);
      }
    };

    if (shouldOffer) {
      pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: isVideo
      })
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('call-user', {
            toPhone: phone,
            fromName: currentUser.name || currentUser.phone,
            fromPhone: currentUser.phone,
            offer: pc.localDescription,
            callType: callState.callType,
            roomId: roomIdRef.current
          });
        })
        .catch((error) => console.error(`[Dialo] Could not create offer for ${phone}`, error));
    }

    return pc;
  };

  const shouldInitiatePeer = (phone) => currentUser.phone < phone;

  const acceptIncoming = async () => {
    try {
      await getLocalMedia();
      const pc = createPeer(callState.peerPhone);
      await pc.setRemoteDescription(new RTCSessionDescription(callState.offer));
      await drainCandidateQueue(callState.peerPhone, pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      modeRef.current = 'connected';
      setMode('connected');

      socket.emit('answer-call', {
        toPhone: callState.peerPhone,
        answer: pc.localDescription,
        roomId: roomIdRef.current,
        fromName: currentUser.name || currentUser.phone,
        fromPhone: currentUser.phone
      });

      setRemoteStreams((prev) => ({
        ...prev,
        [callState.peerPhone]: {
          phone: callState.peerPhone,
          name: callState.peerName || callState.peerPhone,
          stream: prev[callState.peerPhone]?.stream || null
        }
      }));

      // Process any pending offers received while ringing
      for (const [pendingPhone, pendingData] of pendingOffersRef.current.entries()) {
        try {
          const peerPc = createPeer(pendingPhone);
          await peerPc.setRemoteDescription(new RTCSessionDescription(pendingData.offer));
          await drainCandidateQueue(pendingPhone, peerPc);
          const peerAnswer = await peerPc.createAnswer();
          await peerPc.setLocalDescription(peerAnswer);
          socket.emit('answer-call', {
            toPhone: pendingPhone,
            answer: peerPc.localDescription,
            roomId: roomIdRef.current,
            fromName: currentUser.name || currentUser.phone,
            fromPhone: currentUser.phone
          });
        } catch (e) {
          console.error(`[Dialo] Error answering pending offer from ${pendingPhone}`, e);
        }
      }
      pendingOffersRef.current.clear();
    } catch (error) {
      console.error('[Dialo] Could not accept call', error);
      endCall();
    }
  };

  useEffect(() => {
    let timer;

    // 1. Peer accepted our offer
    const onAccepted = async ({ fromPhone, participantName, answer }) => {
      console.log(`[Dialo] call-accepted from ${fromPhone}`);
      const pc = pcsRef.current.get(fromPhone);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await drainCandidateQueue(fromPhone, pc);
        setRemoteStreams((prev) => ({
          ...prev,
          [fromPhone]: {
            phone: fromPhone,
            name: participantName || prev[fromPhone]?.name || fromPhone,
            stream: prev[fromPhone]?.stream || null
          }
        }));
        setMode('connected');
      } catch (err) {
        console.error(`[Dialo] Error setting remote description for ${fromPhone}`, err);
      }
    };

    // 2. Incoming peer offer (mesh group call or renegotiation)
    const onIncomingPeerOffer = async ({ fromPhone, callerName, offer, roomId }) => {
      if (!fromPhone || fromPhone === currentUser.phone) return;
      if (roomId && roomId !== roomIdRef.current) return;
      console.log(`[Dialo] onIncomingPeerOffer from ${fromPhone}`);

      // If user hasn't accepted the initial incoming call yet, queue it
      if (modeRef.current === 'incoming_ringing') {
        pendingOffersRef.current.set(fromPhone, { callerName, offer, roomId });
        return;
      }

      try {
        await getLocalMedia();
        setRemoteStreams((prev) => ({
          ...prev,
          [fromPhone]: {
            phone: fromPhone,
            name: callerName || prev[fromPhone]?.name || fromPhone,
            stream: prev[fromPhone]?.stream || null
          }
        }));

        const pc = createPeer(fromPhone);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await drainCandidateQueue(fromPhone, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('answer-call', {
          toPhone: fromPhone,
          answer: pc.localDescription,
          roomId: roomIdRef.current,
          fromName: currentUser.name || currentUser.phone,
          fromPhone: currentUser.phone
        });
        setMode('connected');
      } catch (error) {
        console.error(`[Dialo] Could not handle incoming peer offer from ${fromPhone}`, error);
      }
    };

    // 3. Another participant joined the call room
    const onParticipantJoined = async ({ phone, participantName, roomId }) => {
      if (roomId !== roomIdRef.current || !phone || phone === currentUser.phone) return;
      console.log(`[Dialo] onParticipantJoined: ${phone} (${participantName})`);

      setRemoteStreams((prev) => ({
        ...prev,
        [phone]: {
          ...(prev[phone] || {}),
          phone,
          name: participantName || prev[phone]?.name || phone,
          stream: prev[phone]?.stream || null
        }
      }));

      // Existing members initiate only when their phone sorts first. This
      // gives every pair one offerer and avoids WebRTC offer collisions.
      if (shouldInitiatePeer(phone) && !pcsRef.current.has(phone)) {
        try {
          await getLocalMedia();
          createPeer(phone, true);
        } catch (err) {
          console.error(`[Dialo] Error connecting to new participant ${phone}`, err);
        }
      }

    };

    const onRoomMembers = async ({ roomId, roomMembers }) => {
      if (roomId !== roomIdRef.current || modeRef.current !== 'connected') return;

      const peersToCall = (roomMembers || []).filter(
        (phone) => phone && phone !== currentUser.phone && !pcsRef.current.has(phone)
      );

      if (peersToCall.length === 0) return;

      try {
        await getLocalMedia();
        for (const phone of peersToCall) {
          createPeer(phone, shouldInitiatePeer(phone));
        }
      } catch (err) {
        console.error('[Dialo] Error connecting to existing call members', err);
      }
    };

    // 4. ICE candidate exchange
    const onIce = async ({ fromPhone, candidate }) => {
      if (!fromPhone || !candidate) return;
      const pc = pcsRef.current.get(fromPhone);
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn(`[Dialo] Error adding ICE candidate from ${fromPhone}:`, e);
        }
      } else {
        const queued = candidatesRef.current.get(fromPhone) || [];
        queued.push(candidate);
        candidatesRef.current.set(fromPhone, queued);
      }
    };

    // 5. Participant left or ended call
    const onParticipantLeft = ({ phone, roomId }) => {
      if (roomId && roomId !== roomIdRef.current) return;
      if (!phone || phone === currentUser.phone) return;
      console.log(`[Dialo] Participant left: ${phone}`);
      removePeer(phone);
    };

    const onEnded = ({ fromPhone }) => {
      console.log(`[Dialo] Call ended by ${fromPhone}`);
      onParticipantLeft({ phone: fromPhone, roomId: roomIdRef.current });
    };

    const onRejected = ({ fromPhone }) => {
      console.log(`[Dialo] Call rejected by ${fromPhone}`);
      removePeer(fromPhone);
      if (fromPhone === callState.peerPhone && pcsRef.current.size === 0) {
        onEndCall();
      }
    };

    const onFailed = ({ toPhone, message }) => {
      console.log(`[Dialo] Call failed for ${toPhone}: ${message}`);
      removePeer(toPhone);
      if (toPhone === callState.peerPhone && pcsRef.current.size === 0) {
        onEndCall();
      }
    };

    socket.on('call-accepted', onAccepted);
    socket.on('incoming-call', onIncomingPeerOffer);
    socket.on('call-participant-joined', onParticipantJoined);
    socket.on('call-room-members', onRoomMembers);
    socket.on('ice-candidate', onIce);
    socket.on('call-ended', onEnded);
    socket.on('call-participant-left', onParticipantLeft);
    socket.on('call-rejected', onRejected);
    socket.on('call-failed', onFailed);

    if (mode === 'connected') {
      timer = setInterval(() => setDuration((v) => v + 1), 1000);
    }

    if (callState.type === 'outgoing') {
      getLocalMedia()
        .then(() => createPeer(callState.peerPhone, true))
        .catch((err) => {
          console.error('[Dialo] Error starting outgoing call:', err);
          onEndCall();
        });
    }

    return () => {
      clearInterval(timer);
      socket.off('call-accepted', onAccepted);
      socket.off('incoming-call', onIncomingPeerOffer);
      socket.off('call-participant-joined', onParticipantJoined);
      socket.off('call-room-members', onRoomMembers);
      socket.off('ice-candidate', onIce);
      socket.off('call-ended', onEnded);
      socket.off('call-participant-left', onParticipantLeft);
      socket.off('call-rejected', onRejected);
      socket.off('call-failed', onFailed);
    };
  }, [callState.peerPhone, callState.type, mode]);

  const cleanupCall = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {}
      });
      localStreamRef.current = null;
    }
    pcsRef.current.forEach((pc) => {
      try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.close();
      } catch (e) {}
    });
    pcsRef.current.clear();
    candidatesRef.current.clear();
    pendingOffersRef.current.clear();
  };

  useEffect(() => () => {
    cleanupCall();
    socket.emit('leave-call', {
      roomId: roomIdRef.current,
      fromPhone: currentUser.phone
    });
  }, []);

  const endCall = () => {
    pcsRef.current.forEach((_, phone) => {
      socket.emit('end-call', {
        toPhone: phone,
        roomId: roomIdRef.current,
        fromPhone: currentUser.phone
      });
    });
    socket.emit('leave-call', {
      roomId: roomIdRef.current,
      fromPhone: currentUser.phone
    });
    cleanupCall();
    onEndCall();
  };

  const rejectIncoming = () => {
    socket.emit('reject-call', {
      toPhone: callState.peerPhone,
      roomId: roomIdRef.current,
      fromPhone: currentUser.phone
    });
    cleanupCall();
    onEndCall();
  };

  const inviteParticipant = async (event) => {
    event.preventDefault();
    const phone = invitePhone.trim();
    if (!phone || phone === currentUser.phone || pcsRef.current.has(phone)) return;
    try {
      await getLocalMedia();
      createPeer(phone, true);
      setInvitePhone('');
      setInviteMessage(`Calling ${phone}...`);
      setTimeout(() => setInviteMessage(''), 4000);
    } catch {
      setInviteMessage('Microphone or camera permission is required.');
    }
  };

  const toggleAudio = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);
    }
  };

  const toggleVideo = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsVideoOff(!track.enabled);
    }
  };

  const displayTime = `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 p-4 text-white">
      <div className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-auto rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-indigo-400 font-semibold">{isVideo ? 'Video' : 'Voice'} Call</p>
            <h2 className="mt-1 text-xl font-bold">{callState.peerName || callState.peerPhone}</h2>
            <p className="text-sm text-slate-400">
              {mode === 'connected' ? displayTime : mode === 'incoming_ringing' ? 'Incoming call...' : 'Calling...'}
            </p>
          </div>
          <button
            onClick={endCall}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            title="Leave call"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {mode === 'incoming_ringing' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-20">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-indigo-600 text-3xl font-bold shadow-xl animate-bounce">
              {(callState.peerName || callState.peerPhone || 'U')[0].toUpperCase()}
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold">{callState.peerName || callState.peerPhone}</h3>
              <p className="text-slate-400 text-sm mt-1">Incoming {isVideo ? 'video' : 'voice'} call...</p>
            </div>
            <div className="flex gap-6 mt-4">
              <button
                onClick={rejectIncoming}
                className="flex items-center gap-2 rounded-full bg-rose-600 px-6 py-3 font-semibold text-white shadow-lg hover:bg-rose-500 transition-all hover:scale-105"
                title="Decline"
              >
                <PhoneOff className="h-5 w-5" />
                <span>Decline</span>
              </button>
              <button
                onClick={acceptIncoming}
                className="flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white shadow-lg hover:bg-emerald-500 transition-all hover:scale-105"
                title="Accept"
              >
                <Phone className="h-5 w-5" />
                <span>Accept</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={`mt-6 grid min-h-[300px] flex-1 gap-4 ${isVideo ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'}`}>
              {/* Local Tile (You) */}
              {isVideo && localStream && (
                <MediaTile stream={localStream} isVideo muted local label={`${currentUser.name || 'You'} (You)`} />
              )}
              {!isVideo && localStream && (
                <MediaTile stream={localStream} isVideo={false} muted label={`${currentUser.name || 'You'} (You)`} />
              )}

              {/* Remote Participants */}
              {participants.map((participant) => (
                <MediaTile
                  key={participant.phone}
                  stream={participant.stream}
                  isVideo={isVideo}
                  label={participant.name || participant.phone}
                />
              ))}

              {mode !== 'connected' && participants.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 p-8 text-center text-sm text-slate-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mb-3" />
                  <span>Waiting for answer...</span>
                </div>
              )}
            </div>

            {/* Invite Form */}
            {mode === 'connected' && (
              <form onSubmit={inviteParticipant} className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
                <UserPlus className="h-4 w-4 text-indigo-400" />
                <input
                  value={invitePhone}
                  onChange={(event) => setInvitePhone(event.target.value)}
                  placeholder="Invite a phone number (e.g. +198856001071)"
                  className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500"
                />
                <button
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
                  type="submit"
                >
                  Invite
                </button>
                {inviteMessage && <span className="w-full text-xs text-indigo-400 mt-1">{inviteMessage}</span>}
              </form>
            )}

            {/* Bottom Controls */}
            <div className="mt-5 flex items-center justify-center gap-4">
              <button
                onClick={toggleAudio}
                className={`rounded-full p-4 text-white shadow-lg transition-all hover:scale-105 ${
                  isMuted ? 'bg-rose-600 hover:bg-rose-500' : 'bg-slate-800 hover:bg-slate-700'
                }`}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>

              {isVideo && (
                <button
                  onClick={toggleVideo}
                  className={`rounded-full p-4 text-white shadow-lg transition-all hover:scale-105 ${
                    isVideoOff ? 'bg-rose-600 hover:bg-rose-500' : 'bg-slate-800 hover:bg-slate-700'
                  }`}
                  title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
                >
                  {isVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                </button>
              )}

              <button
                onClick={endCall}
                className="flex items-center gap-2 rounded-full bg-rose-600 px-6 py-4 font-semibold text-white shadow-lg hover:bg-rose-500 transition-all hover:scale-105"
                title="End call"
              >
                <PhoneOff className="h-5 w-5" />
                <span>End Call</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
