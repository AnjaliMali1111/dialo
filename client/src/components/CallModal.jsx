import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Phone, PhoneOff, UserPlus, Video, VideoOff, X } from 'lucide-react';
import { socket } from '../services/socket';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

function MediaTile({ stream, isVideo, muted, label, local = false }) {
  const mediaRef = useRef(null);

  useEffect(() => {
    if (mediaRef.current && stream) {
      mediaRef.current.srcObject = stream;
      mediaRef.current.play?.().catch(() => {});
    }
  }, [stream]);

  if (!isVideo) {
    return (
      <div className="flex min-h-32 items-center gap-4 rounded-2xl border border-slate-700 bg-slate-950 p-5">
        <audio ref={mediaRef} autoPlay playsInline muted={muted} />
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xl font-bold">
          {label.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-white">{label}</p>
          <p className="text-xs text-emerald-400">Voice connected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
      <video ref={mediaRef} autoPlay playsInline muted={muted} className={`h-full w-full object-cover ${local ? 'scale-x-[-1]' : ''}`} />
      <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-xs text-white">{label}</span>
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
  const localStreamRef = useRef(null);
  const roomIdRef = useRef(callState.roomId || crypto.randomUUID());
  const isVideo = callState.callType === 'video';
  const participants = Object.values(remoteStreams);

  const createPeer = (phone, shouldOffer = false) => {
    const existing = pcsRef.current.get(phone);
    if (existing) return existing;

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcsRef.current.set(phone, pc);
    localStreamRef.current?.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
    pc.onicecandidate = event => {
      if (event.candidate) socket.emit('ice-candidate', { toPhone: phone, candidate: event.candidate });
    };
    pc.ontrack = event => {
      if (event.streams[0]) {
        setRemoteStreams(prev => ({ ...prev, [phone]: { ...(prev[phone] || {}), phone, name: prev[phone]?.name || phone, stream: event.streams[0] } }));
      }
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(pc.connectionState)) {
        pcsRef.current.delete(phone);
        setRemoteStreams(prev => {
          const next = { ...prev };
          delete next[phone];
          return next;
        });
      }
    };

    if (shouldOffer) {
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => socket.emit('call-user', {
          toPhone: phone,
          fromName: currentUser.name || currentUser.phone,
          offer: pc.localDescription,
          callType: callState.callType,
          roomId: roomIdRef.current
        }))
        .catch(error => console.error('[Dialo] Could not create peer offer', error));
    }
    return pc;
  };

  const getLocalMedia = async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  };

  const acceptIncoming = async () => {
    try {
      await getLocalMedia();
      const pc = createPeer(callState.peerPhone);
      await pc.setRemoteDescription(new RTCSessionDescription(callState.offer));
      const queued = candidatesRef.current.get(callState.peerPhone) || [];
      for (const candidate of queued) await pc.addIceCandidate(new RTCIceCandidate(candidate));
      candidatesRef.current.delete(callState.peerPhone);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer-call', { toPhone: callState.peerPhone, answer: pc.localDescription, roomId: roomIdRef.current, fromName: currentUser.name || currentUser.phone });
      setMode('connected');
    } catch (error) {
      console.error('[Dialo] Could not accept call', error);
      onEndCall();
    }
  };

  useEffect(() => {
    let timer;
    const onAccepted = async ({ fromPhone, participantName, answer }) => {
      const pc = pcsRef.current.get(fromPhone);
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      setRemoteStreams(prev => ({
        ...prev,
        [fromPhone]: { ...(prev[fromPhone] || {}), phone: fromPhone, name: participantName || prev[fromPhone]?.name || fromPhone }
      }));
      setMode('connected');
    };
    const onIncomingPeerOffer = async ({ fromPhone, callerName, offer, roomId }) => {
      if (mode === 'incoming_ringing' || roomId !== roomIdRef.current || fromPhone === currentUser.phone) return;
      try {
        await getLocalMedia();
        setRemoteStreams(prev => ({ ...prev, [fromPhone]: { ...(prev[fromPhone] || {}), phone: fromPhone, name: callerName || fromPhone } }));
        const pc = createPeer(fromPhone);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const queued = candidatesRef.current.get(fromPhone) || [];
        for (const candidate of queued) await pc.addIceCandidate(new RTCIceCandidate(candidate));
        candidatesRef.current.delete(fromPhone);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer-call', { toPhone: fromPhone, answer: pc.localDescription, roomId: roomIdRef.current, fromName: currentUser.name || currentUser.phone });
        setMode('connected');
      } catch (error) {
        console.error('[Dialo] Could not join peer connection', error);
      }
    };
    const onParticipantJoined = ({ phone, participantName, roomId, roomMembers }) => {
      if (roomId !== roomIdRef.current) return;
      setRemoteStreams(prev => ({ ...prev, [phone]: { ...(prev[phone] || {}), phone, name: participantName || prev[phone]?.name || phone } }));
      roomMembers.filter(member => member !== currentUser.phone).forEach(member => {
        if (currentUser.phone < member && !pcsRef.current.has(member)) {
          getLocalMedia().then(() => createPeer(member, true)).catch(error => console.error('[Dialo] Could not connect participant', error));
        }
      });
    };
    const onIce = async ({ fromPhone, candidate }) => {
      const pc = pcsRef.current.get(fromPhone);
      if (pc?.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(candidate));
      else candidatesRef.current.set(fromPhone, [...(candidatesRef.current.get(fromPhone) || []), candidate]);
    };
    const onEnded = ({ fromPhone }) => {
      pcsRef.current.get(fromPhone)?.close();
      pcsRef.current.delete(fromPhone);
      setRemoteStreams(prev => {
        const next = { ...prev };
        delete next[fromPhone];
        return next;
      });
      if (pcsRef.current.size === 0) onEndCall();
    };
    const onRejected = ({ fromPhone }) => {
      if (fromPhone === callState.peerPhone) onEndCall();
    };
    const onFailed = ({ toPhone }) => {
      if (toPhone === callState.peerPhone) onEndCall();
    };

    socket.on('call-accepted', onAccepted);
    socket.on('incoming-call', onIncomingPeerOffer);
    socket.on('call-participant-joined', onParticipantJoined);
    socket.on('ice-candidate', onIce);
    socket.on('call-ended', onEnded);
    socket.on('call-rejected', onRejected);
    socket.on('call-failed', onFailed);
    if (mode === 'connected') timer = setInterval(() => setDuration(value => value + 1), 1000);
    if (callState.type === 'outgoing') {
      getLocalMedia().then(() => createPeer(callState.peerPhone, true)).catch(() => onEndCall());
    }

    return () => {
      clearInterval(timer);
      socket.off('call-accepted', onAccepted);
      socket.off('incoming-call', onIncomingPeerOffer);
      socket.off('call-participant-joined', onParticipantJoined);
      socket.off('ice-candidate', onIce);
      socket.off('call-ended', onEnded);
      socket.off('call-rejected', onRejected);
      socket.off('call-failed', onFailed);
    };
  }, [callState.peerPhone, callState.type, mode]);

  useEffect(() => () => {
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    pcsRef.current.forEach(pc => pc.close());
  }, []);

  const endCall = () => {
    pcsRef.current.forEach((_, phone) => socket.emit('end-call', { toPhone: phone, roomId: roomIdRef.current }));
    onEndCall();
  };

  const rejectIncoming = () => {
    socket.emit('reject-call', { toPhone: callState.peerPhone, roomId: roomIdRef.current });
    onEndCall();
  };

  const inviteParticipant = async event => {
    event.preventDefault();
    const phone = invitePhone.trim();
    if (!phone || phone === currentUser.phone || pcsRef.current.has(phone) || pcsRef.current.size >= 2) return;
    try {
      await getLocalMedia();
      createPeer(phone, true);
      setInvitePhone('');
      setInviteMessage(`Invited ${phone}`);
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
            <p className="text-xs uppercase tracking-widest text-indigo-400">{isVideo ? 'Video' : 'Voice'} group call</p>
            <h2 className="mt-1 text-xl font-bold">{callState.peerName || callState.peerPhone}</h2>
            <p className="text-sm text-slate-400">{mode === 'connected' ? displayTime : mode === 'incoming_ringing' ? 'Incoming call' : 'Calling...'}</p>
          </div>
          <button onClick={endCall} className="rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white" title="Leave call"><X /></button>
        </div>

        {mode === 'incoming_ringing' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 py-20">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-indigo-600 text-3xl font-bold">{(callState.peerName || 'U')[0]}</div>
            <div className="flex gap-5">
              <button onClick={rejectIncoming} className="rounded-full bg-rose-600 p-4" title="Decline"><PhoneOff /></button>
              <button onClick={acceptIncoming} className="rounded-full bg-emerald-600 p-4" title="Accept"><Phone /></button>
            </div>
          </div>
        ) : (
          <>
            <div className={`mt-6 grid min-h-[280px] flex-1 gap-3 ${isVideo ? 'grid-cols-1 sm:grid-cols-2' : ''}`}>
              {isVideo && localStream && <MediaTile stream={localStream} isVideo muted local label={`${currentUser.name || 'You'} (You)`} />}
              {participants.map(participant => <MediaTile key={participant.phone} stream={participant.stream} isVideo={isVideo} label={participant.name} />)}
              {mode !== 'connected' && <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-700 text-sm text-slate-400">Waiting for answer...</div>}
            </div>
            {mode === 'connected' && (
              <form onSubmit={inviteParticipant} className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
                <UserPlus className="h-4 w-4 text-indigo-400" />
                <input value={invitePhone} onChange={event => setInvitePhone(event.target.value)} placeholder="Invite a phone number" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-indigo-500" />
                <button className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500" type="submit">Invite</button>
                {inviteMessage && <span className="w-full text-xs text-slate-400">{inviteMessage}</span>}
              </form>
            )}
            <div className="mt-5 flex items-center justify-center gap-4">
              <button onClick={toggleAudio} className={`rounded-full p-4 ${isMuted ? 'bg-rose-600' : 'bg-slate-800'}`} title={isMuted ? 'Unmute' : 'Mute'}>{isMuted ? <MicOff /> : <Mic />}</button>
              {isVideo && <button onClick={toggleVideo} className={`rounded-full p-4 ${isVideoOff ? 'bg-rose-600' : 'bg-slate-800'}`} title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}>{isVideoOff ? <VideoOff /> : <Video />}</button>}
              <button onClick={endCall} className="rounded-full bg-rose-600 px-6 py-4" title="End call"><PhoneOff /></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
