/**
 * Media Stream utilities with resilient fallback and Virtual Stream generator
 * for testing 1-on-1 WebRTC calling even without physical hardware or in multi-tab testing.
 */

/**
 * Creates a synthetic animated Video + Audio MediaStream for testing
 * when physical camera or microphone is unavailable, locked, or denied.
 */
export function createVirtualStream(username = 'You', callType = 'video') {
  const tracks = [];

  // 1. Synthetic Audio Track (using Web Audio API Oscillator)
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const dst = ctx.createMediaStreamDestination();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime); // A4
      // Very low volume so it doesn't disturb, but sends real audio data packets over WebRTC
      gain.gain.setValueAtTime(0.005, ctx.currentTime);

      osc.connect(gain);
      gain.connect(dst);
      osc.start();

      const audioTrack = dst.stream.getAudioTracks()[0];
      if (audioTrack) {
        // Label it for clarity
        Object.defineProperty(audioTrack, 'label', { value: 'Virtual Test Audio' });
        tracks.push(audioTrack);
      }
    }
  } catch (err) {
    console.warn('[VirtualStream] Could not create virtual audio track:', err);
  }

  // 2. Synthetic Video Track (animated Canvas)
  if (callType === 'video') {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      let frame = 0;
      let animId;

      const draw = () => {
        frame++;
        // Gradient background
        const grad = ctx.createLinearGradient(0, 0, 640, 480);
        grad.addColorStop(0, '#1e1b4b');
        grad.addColorStop(0.5, '#0f172a');
        grad.addColorStop(1, '#020617');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 640, 480);

        // Animated subtle grid lines
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.1)';
        ctx.lineWidth = 1;
        for (let x = 0; x < 640; x += 40) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 480);
          ctx.stroke();
        }
        for (let y = 0; y < 480; y += 40) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(640, y);
          ctx.stroke();
        }

        // Pulsing glowing circle
        const radius = 65 + Math.sin(frame * 0.06) * 8;
        const circleGrad = ctx.createRadialGradient(320, 200, 20, 320, 200, radius + 20);
        circleGrad.addColorStop(0, '#3b82f6');
        circleGrad.addColorStop(0.8, '#1d4ed8');
        circleGrad.addColorStop(1, 'rgba(29, 78, 216, 0)');
        ctx.fillStyle = circleGrad;
        ctx.beginPath();
        ctx.arc(320, 200, radius + 15, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.arc(320, 200, radius, 0, Math.PI * 2);
        ctx.fill();

        // Initial in avatar
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 52px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((username || 'U')[0].toUpperCase(), 320, 200);

        // Username
        ctx.font = '600 24px Inter, sans-serif';
        ctx.fillText(username || 'You', 320, 305);

        // Virtual badge
        ctx.fillStyle = '#38bdf8';
        ctx.font = '500 14px Inter, sans-serif';
        ctx.fillText('⚡ Virtual Test Stream Active', 320, 335);

        // Subtitle instructions
        ctx.fillStyle = '#64748b';
        ctx.font = '12px Inter, sans-serif';
        ctx.fillText('WebRTC Video Connection Working Perfectly', 320, 360);

        // Live time indicator
        const timeStr = new Date().toLocaleTimeString();
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'mono 13px monospace';
        ctx.fillText(timeStr, 320, 420);

        animId = requestAnimationFrame(draw);
      };

      draw();

      const canvasStream = canvas.captureStream(30);
      const videoTrack = canvasStream.getVideoTracks()[0];
      if (videoTrack) {
        // Clean up animation when track ends
        videoTrack.addEventListener('ended', () => {
          if (animId) cancelAnimationFrame(animId);
        });
        Object.defineProperty(videoTrack, 'label', { value: 'Virtual Test Video' });
        tracks.push(videoTrack);
      }
    } catch (err) {
      console.warn('[VirtualStream] Could not create virtual video track:', err);
    }
  }

  return new MediaStream(tracks);
}

/**
 * Attempts to capture hardware media stream with multiple fallback tiers.
 * If all fail, returns a detailed, actionable error diagnosis.
 */
export async function getMediaStreamWithFallback(type) {
  // 1. Check browser support and secure context
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (!window.isSecureContext) {
      throw {
        name: 'InsecureContextError',
        message:
          'Camera and microphone are blocked because this page is not in a Secure Context. Please access the app via http://localhost:5173 (not an IP address), or configure HTTPS.'
      };
    }
    throw {
      name: 'NotSupportedError',
      message: 'Your web browser does not support mediaDevices.getUserMedia.'
    };
  }

  // Tier 1: Standard constraints
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false
    });
    return stream;
  } catch (tier1Err) {
    console.warn('[WebRTC] Tier 1 getUserMedia failed, trying relaxed constraints...', tier1Err);

    // If permission was explicitly denied, don't keep retrying as it will keep failing
    if (tier1Err.name === 'NotAllowedError' || tier1Err.name === 'PermissionDeniedError') {
      throw tier1Err;
    }

    // Tier 2: Relaxed constraints (no resolution requirements)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video' ? true : false
      });
      return stream;
    } catch (tier2Err) {
      console.warn('[WebRTC] Tier 2 getUserMedia failed...', tier2Err);

      // Tier 3: If video call requested but camera missing/locked, try audio-only fallback
      if (type === 'video') {
        try {
          console.warn('[WebRTC] Trying audio-only fallback for video call...');
          const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
          });
          audioOnlyStream._audioOnlyFallback = true;
          return audioOnlyStream;
        } catch (audioErr) {
          // If even audio failed, re-throw the original error
        }
      }

      throw tier2Err;
    }
  }
}
