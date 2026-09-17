import React, { useState, useEffect } from 'react';
import {
  Phone,
  Video,
  LogOut,
  Copy,
  Check,
  User,
  AlertCircle,
  Clock,
  Sparkles,
  HelpCircle,
  X,
  Play
} from 'lucide-react';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import IncomingCallModal from './IncomingCallModal';
import AudioCallModal from './AudioCallModal';
import VideoCallModal from './VideoCallModal';
import { useWebRTC } from '../hooks/useWebRTC';
import { socket } from '../services/socket';
import { sounds } from '../utils/sound';

export default function ChatRoom({ roomId, username, onLeaveRoom }) {
  const [peer, setPeer] = useState(null);
  const [messages, setMessages] = useState([]);
  const [peerTyping, setPeerTyping] = useState(false);
  const [copied, setCopied] = useState(false);

  // WebRTC Call Hook (with username for virtual stream branding)
  const {
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
    mediaError,
    setMediaError,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleAudio,
    toggleVideo
  } = useWebRTC(peer, username);

  // Copy Room Link / Code
  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Socket event handlers for room and chat
  useEffect(() => {
    // 1. Initial acknowledgment of room join
    const handleRoomJoined = ({ peer: existingPeer }) => {
      console.log('[Room Joined] Initial peer in room:', existingPeer);
      if (existingPeer) {
        setPeer(existingPeer);
        setMessages((prev) => [
          ...prev,
          {
            id: `sys-${Date.now()}`,
            isSystem: true,
            text: `${existingPeer.username} is in the room.`
          }
        ]);
      }
    };

    // 2. Peer joined afterwards
    const handlePeerJoined = ({ peer: newPeer }) => {
      console.log('[Peer Joined]:', newPeer);
      setPeer(newPeer);
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          isSystem: true,
          text: `${newPeer.username} joined the conversation.`
        }
      ]);
    };

    // 3. Peer left
    const handlePeerLeft = ({ username: leftUsername }) => {
      console.log('[Peer Left]:', leftUsername);
      setPeer(null);
      setPeerTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          isSystem: true,
          text: `${leftUsername || 'Your peer'} left the room.`
        }
      ]);
      if (callState !== 'idle') {
        endCall();
      }
    };

    // 4. Incoming chat message
    const handleReceiveMessage = (msg) => {
      setMessages((prev) => [...prev, msg]);
      if (msg.senderId !== socket.id) {
        sounds.playMessageChime();
      }
    };

    // 5. Peer typing indicators
    const handlePeerTyping = () => {
      setPeerTyping(true);
    };

    const handlePeerStopTyping = () => {
      setPeerTyping(false);
    };

    socket.on('room-joined', handleRoomJoined);
    socket.on('peer-joined', handlePeerJoined);
    socket.on('peer-left', handlePeerLeft);
    socket.on('receive-message', handleReceiveMessage);
    socket.on('peer-typing', handlePeerTyping);
    socket.on('peer-stop-typing', handlePeerStopTyping);

    return () => {
      socket.off('room-joined', handleRoomJoined);
      socket.off('peer-joined', handlePeerJoined);
      socket.off('peer-left', handlePeerLeft);
      socket.off('receive-message', handleReceiveMessage);
      socket.off('peer-typing', handlePeerTyping);
      socket.off('peer-stop-typing', handlePeerStopTyping);
    };
  }, [callState, endCall]);

  const handleSendMessage = (text) => {
    socket.emit('send-message', { roomId, text });
  };

  const isCallingOrConnected = callState === 'calling' || callState === 'connected';

  return (
    <div className="flex flex-col h-screen max-w-5xl mx-auto bg-gray-900 border-x border-gray-800 shadow-2xl relative overflow-hidden">
      {/* Detailed Diagnostic & Troubleshooting Modal when Camera/Mic fails */}
      {mediaError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-panel w-full max-w-lg rounded-3xl p-6 sm:p-7 shadow-2xl border border-amber-500/30 text-left relative overflow-hidden">
            {/* Ambient accent */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    {mediaError.title || 'Could not access microphone/camera'}
                  </h3>
                  <p className="text-xs text-amber-300/90 mt-0.5">
                    {mediaError.message}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setMediaError(null)}
                className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Steps to fix */}
            <div className="bg-gray-950/60 rounded-2xl p-4 border border-gray-800/80 my-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-300">
                <HelpCircle className="w-3.5 h-3.5 text-blue-400" />
                <span>How to enable camera & microphone:</span>
              </div>
              <ul className="text-xs text-gray-400 space-y-2 pl-4 list-disc">
                {(mediaError.tips || [
                  'Click the padlock/camera icon in your browser address bar and choose "Allow".',
                  'In Windows: Settings > Privacy & security > Camera / Microphone -> Turn ON desktop app access.',
                  'Close other video applications (Zoom, Teams) or other browser tabs that may be locking the webcam.'
                ]).map((tip, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {tip}
                  </li>
                ))}
              </ul>
            </div>

            {/* Actions: Start with Virtual Test Stream or Dismiss */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={() => {
                  const targetType = mediaError.pendingCallType || 'video';
                  setMediaError(null);
                  startCall(targetType, true);
                }}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-xl shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 text-xs transition-all active:scale-[0.98]"
              >
                <Sparkles className="w-4 h-4 text-cyan-300" />
                <span>Test Call with Virtual Feed (No Hardware Needed)</span>
              </button>

              <button
                onClick={() => setMediaError(null)}
                className="py-3 px-5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-xl border border-gray-700 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="p-3 sm:p-4 bg-gray-950/80 backdrop-blur-md border-b border-gray-800 flex items-center justify-between z-20">
        {/* Left: Room ID & Copy */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center justify-center w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/20">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold tracking-wider text-gray-200">
                {roomId}
              </span>
              <button
                onClick={copyRoomCode}
                className="p-1 text-gray-400 hover:text-white rounded-md hover:bg-gray-800 transition-colors"
                title="Copy Room ID"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            {/* Peer presence status */}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  peer ? 'bg-green-500' : 'bg-amber-400 animate-pulse'
                }`}
              />
              <span className="text-[11px] text-gray-400">
                {peer ? (
                  <>Connected with <strong className="text-gray-200 font-medium">{peer.username}</strong></>
                ) : (
                  'Waiting for peer to join...'
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Voice Call Button */}
          <button
            onClick={() => startCall('audio')}
            disabled={!peer || isCallingOrConnected}
            className="p-2.5 rounded-xl bg-gray-800 hover:bg-green-600/20 border border-gray-700 hover:border-green-500/40 text-gray-300 hover:text-green-400 disabled:opacity-30 disabled:pointer-events-none transition-all"
            title={peer ? 'Start voice call' : 'Waiting for peer to join'}
          >
            <Phone className="w-4 h-4" />
          </button>

          {/* Video Call Button */}
          <button
            onClick={() => startCall('video')}
            disabled={!peer || isCallingOrConnected}
            className="p-2.5 rounded-xl bg-gray-800 hover:bg-blue-600/20 border border-gray-700 hover:border-blue-500/40 text-gray-300 hover:text-blue-400 disabled:opacity-30 disabled:pointer-events-none transition-all"
            title={peer ? 'Start video call' : 'Waiting for peer to join'}
          >
            <Video className="w-4 h-4" />
          </button>

          {/* Leave Room Button */}
          <button
            onClick={onLeaveRoom}
            className="p-2.5 rounded-xl bg-gray-800 hover:bg-red-600/20 border border-gray-700 hover:border-red-500/40 text-gray-300 hover:text-red-400 transition-all ml-1"
            title="Leave room"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Chat Stream */}
      <MessageList
        messages={messages}
        selfId={socket.id}
        peerTyping={peerTyping}
        peer={peer}
      />

      {/* Chat Input Bar */}
      <MessageInput roomId={roomId} onSendMessage={handleSendMessage} />

      {/* Incoming Call Dialog Modal */}
      {callState === 'incoming' && (
        <IncomingCallModal
          incomingCall={incomingCall}
          onAccept={acceptCall}
          onReject={rejectCall}
        />
      )}

      {/* Active Voice / Audio Call Modal */}
      {callType === 'audio' && isCallingOrConnected && (
        <AudioCallModal
          peer={peer || { username: incomingCall?.callerName }}
          callState={callState}
          callDuration={callDuration}
          isAudioMuted={isAudioMuted}
          peerAudioMuted={peerAudioMuted}
          remoteStream={remoteStream}
          onToggleAudio={toggleAudio}
          onEndCall={endCall}
        />
      )}

      {/* Active Video Call Screen Modal */}
      {callType === 'video' && isCallingOrConnected && (
        <VideoCallModal
          peer={peer || { username: incomingCall?.callerName }}
          callState={callState}
          callDuration={callDuration}
          localStream={localStream}
          remoteStream={remoteStream}
          isAudioMuted={isAudioMuted}
          isVideoOff={isVideoOff}
          peerAudioMuted={peerAudioMuted}
          peerVideoOff={peerVideoOff}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onEndCall={endCall}
        />
      )}
    </div>
  );
}
