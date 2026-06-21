import React, { useRef, useEffect, useState } from 'react';
import { CameraOff, AlertCircle, RefreshCw } from 'lucide-react';
import { handTracker, TrackerStatus, TrackingData } from '../tracking/handTracker';
import { HandPositionSmoother } from '../tracking/smoothing';
import { GameSettings } from '../types/game';

interface WebcamViewProps {
  settings: GameSettings;
  onTrackingUpdate: (
    x: number,
    y: number,
    isPinching: boolean,
    confidence: number,
    isHandTracked: boolean,
    landmarks?: Array<{ x: number; y: number }>
  ) => void;
  isPaused: boolean;
  onTelemetryUpdate: (data: {
    cameraStatus: 'ready' | 'permission_denied' | 'loading' | 'error';
    trackingStatus: 'active' | 'searching' | 'lost';
    resolution: { width: number; height: number };
    trackingFps: number;
    confidence: number;
    handsCount: number;
    lastTimestamp: number;
  }) => void;
}

export const WebcamView: React.FC<WebcamViewProps> = ({
  settings,
  onTrackingUpdate,
  isPaused,
  onTelemetryUpdate
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus>('idle');
  const [trackerError, setTrackerError] = useState<string>('');
  const [cameraStatus, setCameraStatus] = useState<'ready' | 'permission_denied' | 'loading' | 'error'>('loading');
  const [isHandVisible, setIsHandVisible] = useState<boolean>(false);
  const [confidence, setConfidence] = useState<number>(0);
  const [cameraResolution, setCameraResolution] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // References
  const smootherRef = useRef<HandPositionSmoother>(new HandPositionSmoother());
  const animationFrameRef = useRef<number | null>(null);
  const lastDetectionTimeRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);

  // Apply tracking calibration settings
  useEffect(() => {
    smootherRef.current.updateSettings(
      settings.tracking.sensitivity,
      settings.tracking.smoothing
    );
  }, [settings.tracking.sensitivity, settings.tracking.smoothing]);

  // 1. Initialize MediaPipe HandLandmarker Model
  useEffect(() => {
    const loadModel = async () => {
      try {
        setTrackerStatus('loading');
        await handTracker.initialize((status, err) => {
          setTrackerStatus(status);
          if (err) setTrackerError(err);
        });
        // Double safety fallback: ensure component status matches resolved tracker status
        const currentStatus = handTracker.getStatus();
        setTrackerStatus(currentStatus);
        if (currentStatus === 'error') {
          setTrackerError(handTracker.getErrorMessage());
        }
      } catch (err) {
        setTrackerStatus('error');
        setTrackerError(err instanceof Error ? err.message : 'Model startup failed.');
      }
    };
    loadModel();

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // 2. Camera Access Setup & Automatic Reconnection Loop
  const startCamera = async () => {
    setCameraStatus('loading');
    
    // Stop any existing tracks before requesting a new stream
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(t => t.stop());
      activeStreamRef.current = null;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          frameRate: { ideal: 30 }
        },
        audio: false
      });

      activeStreamRef.current = mediaStream;
      setCameraStatus('ready');

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(e => console.warn("Auto-play blocked:", e));
          
          // Log initial capture resolution
          if (videoRef.current) {
            setCameraResolution({
              width: videoRef.current.videoWidth,
              height: videoRef.current.videoHeight
            });
          }
        };
      }
    } catch (err) {
      console.error('Webcam initialization failed:', err);
      const name = (err as { name?: string }).name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraStatus('permission_denied');
      } else {
        setCameraStatus('error');
      }
      
      // Auto-reconnect: try restarting in 4 seconds
      reconnectTimeoutRef.current = window.setTimeout(startCamera, 4000);
    }
  };

  useEffect(() => {
    startCamera();
    return () => {
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // 3. Sensor Frame Tracking Loop
  useEffect(() => {
    const video = videoRef.current;
    if (!video || trackerStatus !== 'ready' || cameraStatus !== 'ready' || isPaused) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      onTrackingUpdate(0.5, 0.5, false, 0, false);
      return;
    }

    const processFrame = () => {
      const now = performance.now();
      const dt = (now - lastDetectionTimeRef.current) / 1000;
      lastDetectionTimeRef.current = now;

      if (video.readyState >= 2) {
        const trackingData: TrackingData | null = handTracker.detectFrame(video, now);

        if (trackingData) {
          setIsHandVisible(true);
          setConfidence(trackingData.confidence);

          // Apply Kalman and adaptive smoothing filters
          const smoothedPos = smootherRef.current.smooth(trackingData.indexTip, dt);

          // Pinch gesture detection (3D normalized euclidean distance)
          const distIndexThumb = Math.hypot(
            trackingData.indexTip.x - trackingData.thumbTip.x,
            trackingData.indexTip.y - trackingData.thumbTip.y,
            trackingData.indexTip.z - trackingData.thumbTip.z
          );
          const isPinching = distIndexThumb < 0.045;

          onTrackingUpdate(
            smoothedPos.x,
            smoothedPos.y,
            isPinching,
            trackingData.confidence,
            true,
            trackingData.rawLandmarks
          );

          // Draw knuckles colored overlay based on confidence
          drawOverlay(trackingData);

          // Propagate telemetry
          onTelemetryUpdate({
            cameraStatus,
            trackingStatus: 'active',
            resolution: cameraResolution,
            trackingFps: handTracker.getTrackingFPS(),
            confidence: trackingData.confidence,
            handsCount: 1,
            lastTimestamp: handTracker.getLastDetectionTime()
          });
        } else {
          // Hand lost searching state
          setIsHandVisible(false);
          setConfidence(0);
          smootherRef.current.reset();
          
          onTrackingUpdate(0.5, 0.5, false, 0, false);
          clearOverlay();

          onTelemetryUpdate({
            cameraStatus,
            trackingStatus: 'searching',
            resolution: cameraResolution,
            trackingFps: handTracker.getTrackingFPS(),
            confidence: 0,
            handsCount: 0,
            lastTimestamp: handTracker.getLastDetectionTime()
          });
        }
      }

      animationFrameRef.current = requestAnimationFrame(processFrame);
    };

    animationFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [trackerStatus, cameraStatus, isPaused, cameraResolution, onTrackingUpdate, onTelemetryUpdate]);

  // Render skeleton with colors mapped to tracking confidence
  const drawOverlay = (data: TrackingData) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Pick skeleton glow color based on confidence thresholds
    // Green = Excellent (>80%), Yellow = Medium (50-80%), Red = Weak (<50%)
    let statusColor = 'rgba(255, 0, 85, 0.6)'; // Red lost fallback
    if (data.confidence >= 0.80) {
      statusColor = 'rgba(57, 255, 20, 0.65)'; // Neon Green
    } else if (data.confidence >= 0.50) {
      statusColor = 'rgba(255, 234, 0, 0.65)'; // Neon Yellow
    }

    ctx.strokeStyle = statusColor;
    ctx.lineWidth = 2.0;

    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // Index
      [9, 10], [10, 11], [11, 12],     // Middle
      [13, 14], [14, 15], [15, 16],    // Ring
      [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
      [5, 9], [9, 13], [13, 17]
    ];

    for (const [sIdx, eIdx] of connections) {
      const pt1 = data.rawLandmarks[sIdx];
      const pt2 = data.rawLandmarks[eIdx];
      if (pt1 && pt2) {
        ctx.beginPath();
        ctx.moveTo(pt1.x * canvas.width, pt1.y * canvas.height);
        ctx.lineTo(pt2.x * canvas.width, pt2.y * canvas.height);
        ctx.stroke();
      }
    }

    // Draw knuckle joints
    for (let i = 0; i < data.rawLandmarks.length; i++) {
      const pt = data.rawLandmarks[i];
      if (pt) {
        ctx.beginPath();
        if (i === 4 || i === 8 || i === 12) {
          ctx.fillStyle = '#ff0055'; // fingertip targets
          ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 4.0, 0, Math.PI * 2);
        } else {
          ctx.fillStyle = data.confidence >= 0.8 ? '#00ffff' : '#ffea00';
          ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 2.0, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }

    // Hand distance calibration check
    const wrist = data.rawLandmarks[0];
    const knuckle = data.rawLandmarks[5];
    let distancePrompt = 'ACQUIRING...';
    let promptColor = '#ff0055';
    
    if (wrist && knuckle) {
      const dx = wrist.x - knuckle.x;
      const dy = wrist.y - knuckle.y;
      const size = Math.hypot(dx * canvas.width, dy * canvas.height);
      
      if (size < 48) {
        distancePrompt = 'MOVE CLOSER';
        promptColor = '#ffea00';
      } else if (size > 120) {
        distancePrompt = 'TOO CLOSE - MOVE BACK';
        promptColor = '#ff0055';
      } else {
        distancePrompt = 'PERFECT DISTANCE';
        promptColor = '#39ff14';
      }
    }

    ctx.save();
    ctx.fillStyle = promptColor;
    ctx.font = "bold 9px 'Space Grotesk', sans-serif";
    ctx.textAlign = 'center';
    ctx.shadowBlur = 6;
    ctx.shadowColor = promptColor;
    ctx.fillText(distancePrompt, canvas.width / 2, 20);
    ctx.restore();
  };

  const clearOverlay = () => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw holographic guide silhouette in center
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.22)';
    ctx.lineWidth = 1.0;
    ctx.setLineDash([4, 4]);

    const cx = canvas.width / 2;
    const cy = canvas.height * 0.55;

    ctx.beginPath();
    // Wrist base
    ctx.arc(cx, cy + 30, 12, Math.PI, 0);
    // Palm lines up to knuckles
    ctx.lineTo(cx + 20, cy - 8);
    // Index finger guide
    ctx.lineTo(cx + 20, cy - 45);
    ctx.arc(cx + 16, cy - 45, 4, 0, Math.PI, true);
    ctx.lineTo(cx + 12, cy - 8);
    // Middle finger guide
    ctx.lineTo(cx + 8, cy - 48);
    ctx.arc(cx + 4, cy - 48, 4, 0, Math.PI, true);
    ctx.lineTo(cx, cy - 8);
    // Thumb guide
    ctx.lineTo(cx - 20, cy + 8);
    ctx.arc(cx - 20, cy + 12, 5, -Math.PI/2, Math.PI/2, true);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = 'rgba(0, 255, 255, 0.45)';
    ctx.font = "bold 9px 'Space Grotesk', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('ALIGN HAND HERE', cx, cy - 2);
    ctx.restore();
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <h3 style={{ fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SENSOR</h3>
        <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)' }}>Keep hand within frame.</p>
      </div>

      {/* Video Preview Feed Container */}
      <div className="webcam-feed-container">
        {cameraStatus === 'permission_denied' ? (
          <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '12px',
            textAlign: 'center',
            color: 'var(--neon-pink)',
            gap: '10px'
          }}>
            <CameraOff size={28} />
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Webcam Blocked</span>
            <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)' }}>Please allow camera permission in browser URL settings.</p>
            <button className="neon-btn neon-btn-primary neon-btn-sm" onClick={startCamera} style={{ padding: '6px 12px', fontSize: '0.7rem' }}>
              <RefreshCw size={10} /> Retry Consent
            </button>
          </div>
        ) : cameraStatus === 'loading' || trackerStatus === 'loading' ? (
          <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
            color: 'rgba(255,255,255,0.6)'
          }}>
            <RefreshCw className="spinner" size={24} style={{ borderTopColor: 'var(--neon-cyan)', border: '2px solid rgba(255,255,255,0.1)' }} />
            <span style={{ fontSize: '0.75rem' }}>Acquiring stream...</span>
          </div>
        ) : cameraStatus === 'error' || trackerStatus === 'error' ? (
          <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '10px',
            color: 'var(--neon-pink)',
            gap: '8px'
          }}>
            <AlertCircle size={28} />
            <span style={{ fontSize: '0.75rem', textAlign: 'center' }}>Sensor offline</span>
            <p style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
              {trackerError || 'Reconnecting...'}
            </p>
          </div>
        ) : (
          <>
            <video 
              ref={videoRef}
              playsInline 
              muted 
              className="webcam-video"
            />
            <canvas 
              ref={overlayCanvasRef}
              className="webcam-canvas-overlay"
            />
          </>
        )}
      </div>

      {/* Diagnostics panel quick indicator */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
          <span>Sensor quality:</span>
          <span style={{
            color: confidence >= 0.8 ? 'var(--neon-green)' : confidence >= 0.5 ? 'var(--neon-yellow)' : 'var(--neon-pink)',
            fontWeight: 700
          }}>
            {confidence >= 0.8 ? 'EXCELLENT' : confidence >= 0.5 ? 'MODERATE' : 'WEAK / SEARCHING'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
          <span>Hand tracked:</span>
          <span style={{
            color: isHandVisible ? 'var(--neon-cyan)' : 'var(--neon-pink)',
            fontWeight: 700
          }}>
            {isHandVisible ? 'CONNECTED' : 'LOST'}
          </span>
        </div>
      </div>
    </div>
  );
};
export default WebcamView;
