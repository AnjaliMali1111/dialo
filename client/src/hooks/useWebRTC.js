import { useState, useRef, useEffect, useCallback } from 'react';
import { socket } from '../services/socket';
import { sounds } from '../utils/sound';
import { createVirtualStream, getMediaStreamWithFallback } from '../utils/media';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

export function useWebRTC(activeContact, currentUser) {
  // Call States: 'idle' | 'calling' | 'incoming' | 'connected'
  const [callState, setCallState] = useState('idle');
  const [callType, setCallType] = useState(null); // 'audio' | 'video'
  const [incomingCall, setIncomingCall] = useState(null); // { fromPhone, caller, offer, callType }
  const [callPeer, setCallPeer] = useState(null); // Contact currently in call with

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);

  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [peerAudioMuted, setPeerAudioMuted] = useState(false);
  const [peerVideoOff, setPeerVideoOff] = useState(false);
  const [isVirtualFeed, setIsVirtualFeed] = useState(false);

  const [callDuration, setCallDuration] = useState(0);
  const [mediaError, setMediaError] = useState(null);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const candidateQueue = useRef([]);
  const timerRef = useRef(null);
  const targetPhoneRef = useRef(null);

  // Clean up all media tracks and connection
  const cleanupCall = useCallback(() => {
    sounds.stopRingtone();

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error stopping track', e);
        }
      });
      localStreamRef.current = null;
    }

    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    candidateQueue.current = [];
    targetPhoneRef.current = null;

    setLocalStream(null);
    setRemoteStream(null);
    setCallState('idle');
    setCallType(null);
    setIncomingCall(null);
    setCallPeer(null);
    setIsAudioMuted(false);
    setIsVideoOff(false);
    setPeerAudioMuted(false);
    setPeerVideoOff(false);
    setIsVirtualFeed(false);
    setCallDuration(0);
  }, []);

  // Initialize RTCPeerConnection by target phone
  const createPeerConnection = useCallback((remotePhone) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate && remotePhone) {
        socket.emit('ice-candidate', {
          toPhone: remotePhone,
          candidate: event.candidate
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC] Received remote track:', event.track.kind);
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState);
      if (
        pc.connectionState === 'disconnected' ||
        pc.connectionState === 'failed' ||
        pc.connectionState === 'closed'
      ) {
        cleanupCall();
        sounds.playEndedSound();
      }
    };

    return pc;
  }, [cleanupCall]);

  // Request user media stream with diagnostic error handling & virtual stream fallback
  const acquireMediaStream = async (type, forceVirtual = false) => {
    setMediaError(null);
    const selfName = currentUser?.name || 'You';

    if (forceVirtual) {
      console.log('[WebRTC] Creating Virtual Test Stream for:', selfName);
      const vStream = createVirtualStream(selfName, type);
      localStreamRef.current = vStream;
      setLocalStream(vStream);
      setIsVirtualFeed(true);
      return vStream;
    }

    try {
      const stream = await getMediaStreamWithFallback(type);
      localStreamRef.current = stream;
      setLocalStream(stream);
      setIsVirtualFeed(false);
      return stream;
    } catch (err) {
      console.error('[WebRTC] getUserMedia error details:', err);

      let title = 'Could not access microphone/camera';
      let message = 'Your browser could not start your camera or microphone.';
      let tips = [
        'Click the camera/padlock icon on the left of your browser address bar and select "Allow".',
        'Check Windows Settings > Privacy & security > Camera/Microphone and ensure desktop app access is turned ON.',
        'If testing in two tabs on the same computer, the other tab might be locking the webcam exclusively.'
      ];

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        title = 'Camera / Microphone Permission Blocked';
        message = 'Permission to access your camera or microphone was denied.';
        tips = [
          'Click the lock or camera icon in your browser address bar (URL bar).',
          'Switch Camera and Microphone permissions to "Allow", then refresh.',
          'In Windows: Open Start > Settings > Privacy & Security > Camera (and Microphone), and ensure "Allow apps to access your camera" is ON.'
        ];
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        title = 'No Camera or Microphone Found';
        message = 'No hardware camera or microphone device was detected on your computer.';
        tips = [
          'Plug in a USB webcam, headset, or external microphone.',
          'You can use the "Virtual Stream (Demo Mode)" button below to test calling immediately without any hardware!'
        ];
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        title = 'Camera / Microphone Already In Use';
        message = 'Your camera or microphone is currently locked by another application or browser tab.';
        tips = [
          'Close other video apps like Zoom, Teams, Skype, or other browser tabs using the webcam.',
          'In Windows, only one browser tab can open the physical camera at a time.'
        ];
      } else if (err.name === 'InsecureContextError') {
        title = 'Insecure HTTP Origin Restriction';
        message = err.message || 'WebRTC camera and mic require a Secure Context.';
        tips = [
          'Open the app using http://localhost:5173 instead of an IP address (e.g. 192.168.x.x).',
          'Browsers automatically consider localhost as secure.'
        ];
      } else if (err.name === 'OverconstrainedError') {
        title = 'Camera Resolution Not Supported';
        message = 'Your webcam does not support the requested resolution.';
        tips = ['The app will automatically fall back to basic video resolution.'];
      }

      setMediaError({
        title,
        message,
        tips,
        canUseVirtual: true,
        pendingCallType: type
      });

      throw err;
    }
  };

  // 1. INITIATE CALL TO PHONE NUMBER (Caller)
  const startCall = async (type, targetContact = activeContact, forceVirtual = false) => {
    if (!targetContact || !targetContact.phone) return;

    try {
      const targetPhone = targetContact.phone;
      targetPhoneRef.current = targetPhone;
      setCallPeer(targetContact);
      setCallType(type);
      setCallState('calling');

      const stream = await acquireMediaStream(type, forceVirtual);
      const pc = createPeerConnection(targetPhone);
      pcRef.current = pc;

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === 'video'
      });
      await pc.setLocalDescription(offer);

      socket.emit('call-user', {
        toPhone: targetPhone,
        offer,
        callType: type
      });
    } catch (err) {
      cleanupCall();
    }
  };

  // 2. ACCEPT CALL (Callee)
  const acceptCall = async (forceVirtual = false) => {
    if (!incomingCall) return;
    sounds.stopRingtone();

    try {
      const callerPhone = incomingCall.fromPhone;
      targetPhoneRef.current = callerPhone;
      setCallPeer(incomingCall.caller || { phone: callerPhone, name: callerPhone });
      setCallType(incomingCall.callType);

      const stream = await acquireMediaStream(incomingCall.callType, forceVirtual);
      const pc = createPeerConnection(callerPhone);
      pcRef.current = pc;

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));

      while (candidateQueue.current.length > 0) {
        const cand = candidateQueue.current.shift();
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('answer-call', {
        toPhone: callerPhone,
        answer
      });

      setCallState('connected');
      sounds.playConnectedSound();

      timerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      cleanupCall();
    }
  };

  // 3. REJECT CALL (Callee)
  const rejectCall = () => {
    if (incomingCall) {
      socket.emit('reject-call', { toPhone: incomingCall.fromPhone });
      cleanupCall();
    }
  };

  // 4. END CALL (Both)
  const endCall = () => {
    const target = targetPhoneRef.current || callPeer?.phone || incomingCall?.fromPhone;
    if (target) {
      socket.emit('end-call', { toPhone: target });
    }
    sounds.playEndedSound();
    cleanupCall();
  };

  // Toggle local audio mute
  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const newMuted = !audioTrack.enabled;
        setIsAudioMuted(newMuted);

        const target = targetPhoneRef.current || callPeer?.phone || incomingCall?.fromPhone;
        if (target) {
          socket.emit('toggle-media', {
            toPhone: target,
            type: 'audio',
            enabled: audioTrack.enabled
          });
        }
      }
    }
  };

  // Toggle local video camera
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        const newVideoOff = !videoTrack.enabled;
        setIsVideoOff(newVideoOff);

        const target = targetPhoneRef.current || callPeer?.phone || incomingCall?.fromPhone;
        if (target) {
          socket.emit('toggle-media', {
            toPhone: target,
            type: 'video',
            enabled: videoTrack.enabled
          });
        }
      }
    }
  };

  // Register Socket.io  Call Signaling Listeners
  useEffect(() => {
    const handleIncomingCall = (data) => {
      console.log('[WebRTC] Incoming WhatsApp call received:', data);
      setIncomingCall(data);
      setCallPeer(data.caller);
      setCallType(data.callType);
      setCallState('incoming');
      targetPhoneRef.current = data.fromPhone;
      sounds.startRingtone();
    };

    const handleCallAccepted = async ({ answer }) => {
      console.log('[WebRTC] Call accepted by peer');
      if (pcRef.current) {
        try {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));

          while (candidateQueue.current.length > 0) {
            const cand = candidateQueue.current.shift();
            await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
          }

          setCallState('connected');
          sounds.playConnectedSound();

          timerRef.current = setInterval(() => {
            setCallDuration(prev => prev + 1);
          }, 1000);
        } catch (e) {
          console.error('[WebRTC] Error setting remote description:', e);
        }
      }
    };

    const handleIceCandidate = async ({ candidate }) => {
      if (pcRef.current && pcRef.current.remoteDescription) {
        try {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('[WebRTC] Error adding ICE candidate:', e);
        }
      } else {
        candidateQueue.current.push(candidate);
      }
    };

    const handleCallRejected = () => {
      console.log('[WebRTC] WhatsApp call rejected');
      sounds.playEndedSound();
      cleanupCall();
    };

    const handleCallEnded = () => {
      console.log('[WebRTC] WhatsApp call ended');
      sounds.playEndedSound();
      cleanupCall();
    };

    const handlePeerMediaToggled = ({ type, enabled }) => {
      if (type === 'audio') {
        setPeerAudioMuted(!enabled);
      } else if (type === 'video') {
        setPeerVideoOff(!enabled);
      }
    };

    socket.on('incoming-call', handleIncomingCall);
    socket.on('call-accepted', handleCallAccepted);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('call-rejected', handleCallRejected);
    socket.on('call-ended', handleCallEnded);
    socket.on('peer-media-toggled', handlePeerMediaToggled);

    return () => {
      socket.off('incoming-call', handleIncomingCall);
      socket.off('call-accepted', handleCallAccepted);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('call-rejected', handleCallRejected);
      socket.off('call-ended', handleCallEnded);
      socket.off('peer-media-toggled', handlePeerMediaToggled);
      cleanupCall();
    };
  }, [cleanupCall]);

  return {
    callState,
    callType,
    incomingCall,
    callPeer,
    localStream,
    remoteStream,
    isAudioMuted,
    isVideoOff,
    peerAudioMuted,
    peerVideoOff,
    isVirtualFeed,
    callDuration,
    mediaError,
    setMediaError,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleAudio,
    toggleVideo
  };
}
