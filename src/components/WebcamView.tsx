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
    streamActive: boolean;
    videoTracksCount: number;
    videoReadyState: number;
    frameCount: number;
    diagnosticLogs: string[];
    isTestingCamera: boolean;
    cameraTestResults: Record<string, 'pending' | 'success' | 'fail' | 'none'>;
  }) => void;
  triggerCameraTest?: boolean;
  onCameraTestComplete?: () => void;
  controlMode: 'camera' | 'touch';
}

export const WebcamView: React.FC<WebcamViewProps> = ({
  settings,
  onTrackingUpdate,
  isPaused,
  onTelemetryUpdate,
  triggerCameraTest = false,
  onCameraTestComplete,
  controlMode
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const [trackerStatus, setTrackerStatus] = useState<TrackerStatus>('idle');
  const [trackerError, setTrackerError] = useState<string>('');
  const [cameraStatus, setCameraStatus] = useState<'ready' | 'permission_denied' | 'loading' | 'error'>('loading');
  const [isHandVisible, setIsHandVisible] = useState<boolean>(false);
  const [confidence, setConfidence] = useState<number>(0);

  // Diagnostics and Test state
  const [isTestingCamera, setIsTestingCamera] = useState<boolean>(false);

  // Refs to avoid stale closure issues
  const smootherRef = useRef<HandPositionSmoother>(new HandPositionSmoother());
  const animationFrameRef = useRef<number | null>(null);
  const lastDetectionTimeRef = useRef<number>(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);

  const logsRef = useRef<string[]>([]);
  const frameCountRef = useRef<number>(0);
  const lastFrameProcessedTime = useRef<number>(performance.now());
  const isTestingCameraRef = useRef<boolean>(false);
  const cameraTestResultsRef = useRef<Record<string, 'pending' | 'success' | 'fail' | 'none'>>({});

  // Helper to log diagnostics message and propagate telemetry
  const logMsg = (msg: string) => {
    console.log(msg);
    const timestamp = new Date().toLocaleTimeString();
    const formatted = `[${timestamp}] ${msg}`;
    logsRef.current = [...logsRef.current, formatted].slice(-8); // Keep last 8 logs
    updateTelemetry();
  };

  const updateTestingState = (testing: boolean) => {
    isTestingCameraRef.current = testing;
    setIsTestingCamera(testing);
    updateTelemetry();
  };

  const updateTestResultsState = (results: Record<string, 'pending' | 'success' | 'fail' | 'none'>) => {
    cameraTestResultsRef.current = results;
    updateTelemetry();
  };

  // Apply tracking calibration settings
  useEffect(() => {
    smootherRef.current.updateSettings(
      settings.tracking.sensitivity,
      settings.tracking.smoothing
    );
  }, [settings.tracking.sensitivity, settings.tracking.smoothing]);

  // Telemetry update propagator
  const updateTelemetry = (
    cStatus = cameraStatus,
    tStatus = trackerStatus
  ) => {
    const video = videoRef.current;
    onTelemetryUpdate({
      cameraStatus: cStatus,
      trackingStatus: tStatus === 'ready' ? (isHandVisible ? 'active' : 'searching') : 'lost',
      resolution: video ? { width: video.videoWidth, height: video.videoHeight } : { width: 0, height: 0 },
      trackingFps: handTracker.getTrackingFPS(),
      confidence: confidence,
      handsCount: isHandVisible ? 1 : 0,
      lastTimestamp: handTracker.getLastDetectionTime(),
      streamActive: activeStreamRef.current ? activeStreamRef.current.active : false,
      videoTracksCount: activeStreamRef.current ? activeStreamRef.current.getVideoTracks().length : 0,
      videoReadyState: video ? video.readyState : 0,
      frameCount: frameCountRef.current,
      diagnosticLogs: logsRef.current,
      isTestingCamera: isTestingCameraRef.current,
      cameraTestResults: cameraTestResultsRef.current
    });
  };

  // 1 & 2. Camera Access Setup and Pipeline Verification Loop
  const setupPipeline = async () => {
    logMsg("Initializing pipeline...");
    setCameraStatus('loading');
    setTrackerStatus('loading');
    
    // Stop any existing tracks/streams before starting
    if (activeStreamRef.current) {
      logMsg("Stopping existing camera stream...");
      activeStreamRef.current.getTracks().forEach(t => t.stop());
      activeStreamRef.current = null;
    }
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    let stream: MediaStream;
    try {
      logMsg("Requesting webcam stream (getUserMedia)...");
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
          frameRate: { ideal: 30 }
        },
        audio: false
      });
      activeStreamRef.current = stream;
      setCameraStatus('ready');
      logMsg(`Stream attached. Active: ${stream.active}. Video tracks: ${stream.getVideoTracks().length}`);
    } catch (err) {
      console.error('Webcam initialization failed:', err);
      logMsg(`[ERROR] Webcam access failed: ${err instanceof Error ? err.message : String(err)}`);
      const name = (err as { name?: string }).name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraStatus('permission_denied');
      } else {
        setCameraStatus('error');
      }
      return;
    }

    const video = videoRef.current;
    if (!video) {
      logMsg("[ERROR] Video element ref is null!");
      return;
    }

    try {
      video.srcObject = stream;
      logMsg("Stream attached to video element.");
      
      logMsg("Calling video.play()...");
      await video.play();
      logMsg("Video playing successfully.");
    } catch (playErr) {
      logMsg(`[ERROR] video.play() failed: ${playErr instanceof Error ? playErr.message : String(playErr)}`);
      setCameraStatus('error');
      return;
    }

    // Wait until video readyState and dimensions are valid
    logMsg("Waiting for video elements to become fully ready...");
    const checkVideoReady = (): Promise<void> => {
      return new Promise((resolve) => {
        const interval = setInterval(() => {
          if (
            video.readyState >= 4 &&
            video.videoWidth > 0 &&
            video.videoHeight > 0
          ) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });
    };

    await checkVideoReady();
    logMsg(`Video dimensions detected: ${video.videoWidth}x${video.videoHeight}. ReadyState: ${video.readyState}`);

    // Initialize MediaPipe HandLandmarker locally
    try {
      logMsg("Initializing MediaPipe HandLandmarker...");
      await handTracker.initialize((status, err) => {
        setTrackerStatus(status);
        if (err) {
          setTrackerError(err);
          logMsg(`[ERROR] MediaPipe status change: ${status}, error: ${err}`);
        } else {
          logMsg(`MediaPipe status: ${status}`);
        }
      });
      
      const currentStatus = handTracker.getStatus();
      setTrackerStatus(currentStatus);
      if (currentStatus === 'ready') {
        logMsg("MediaPipe initialized successfully.");
      } else if (currentStatus === 'error') {
        logMsg(`[ERROR] MediaPipe initialization error: ${handTracker.getErrorMessage()}`);
        return;
      }
    } catch (err) {
      logMsg(`[ERROR] MediaPipe initialization failed: ${err instanceof Error ? err.message : String(err)}`);
      setTrackerStatus('error');
      return;
    }

    // Start frame processing loop
    logMsg("Starting frame processing loop...");
    startFrameLoop();
  };

  useEffect(() => {
    if (controlMode === 'camera') {
      setupPipeline();
    } else {
      logMsg("Pausing WebcamView for Touch Mode...");
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach(track => track.stop());
        activeStreamRef.current = null;
      }
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setCameraStatus('loading');
      setTrackerStatus('idle');
    }
    return () => {
      logMsg("Cleaning up WebcamView component...");
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach(track => track.stop());
        activeStreamRef.current = null;
      }
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [controlMode]);

  // 3. Sensor Frame Tracking Loop
  const startFrameLoop = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    let isFirstFrame = true;
    let isFirstHand = true;
    lastFrameProcessedTime.current = performance.now();

    const processFrame = () => {
      const video = videoRef.current;
      if (!video || isPaused) {
        animationFrameRef.current = requestAnimationFrame(processFrame);
        return;
      }

      const now = performance.now();
      const dt = (now - lastDetectionTimeRef.current) / 1000;
      lastDetectionTimeRef.current = now;

      if (video.readyState >= 2) {
        frameCountRef.current++;
        lastFrameProcessedTime.current = now;

        if (isFirstFrame) {
          isFirstFrame = false;
          logMsg("First frame processed.");
        }

        const trackingData: TrackingData | null = handTracker.detectFrame(video, now);

        if (trackingData) {
          setIsHandVisible(true);
          setConfidence(trackingData.confidence);

          if (isFirstHand) {
            isFirstHand = false;
            logMsg("First hand detected!");
          }

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

          drawOverlay(trackingData);
        } else {
          setIsHandVisible(false);
          setConfidence(0);
          smootherRef.current.reset();
          
          onTrackingUpdate(0.5, 0.5, false, 0, false);
          clearOverlay();
        }

        // Propagate telemetry updates on every frame
        updateTelemetry();
      }

      animationFrameRef.current = requestAnimationFrame(processFrame);
    };

    animationFrameRef.current = requestAnimationFrame(processFrame);
  };

  // Automatic recovery monitor: restart pipeline if no frames for 5s
  useEffect(() => {
    const monitor = setInterval(() => {
      if (isPaused || cameraStatus !== 'ready' || trackerStatus !== 'ready' || isTestingCameraRef.current) return;

      const now = performance.now();
      const timeSinceLastFrame = now - lastFrameProcessedTime.current;

      if (timeSinceLastFrame > 5000) {
        logMsg(`[RECOVERY] No frames received for ${Math.round(timeSinceLastFrame / 1000)}s! Initiating automatic recovery...`);
        setupPipeline();
      }
    }, 1000);

    return () => clearInterval(monitor);
  }, [cameraStatus, trackerStatus, isPaused]);

  // Run Camera Diagnostic test
  const runCameraTest = async () => {
    if (isTestingCameraRef.current) return;
    updateTestingState(true);
    logMsg("[TEST] Starting Camera Test...");
    
    const results: Record<string, 'pending' | 'success' | 'fail' | 'none'> = {
      cameraAccessible: 'pending',
      streamActive: 'pending',
      videoPlaying: 'pending',
      videoDimensions: 'pending',
      framesUpdating: 'pending',
      mediaPipeReceiving: 'pending',
      handDetection: 'pending'
    };
    
    updateTestResultsState({ ...results });

    // Step 1: Camera Accessible
    try {
      const testStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      results.cameraAccessible = 'success';
      updateTestResultsState({ ...results });
      
      // Step 2: Stream Active
      if (testStream && testStream.active) {
        results.streamActive = 'success';
      } else {
        results.streamActive = 'fail';
      }
      updateTestResultsState({ ...results });
      
      testStream.getTracks().forEach(t => t.stop());
    } catch (err) {
      results.cameraAccessible = 'fail';
      results.streamActive = 'fail';
      results.videoPlaying = 'fail';
      results.videoDimensions = 'fail';
      results.framesUpdating = 'fail';
      results.mediaPipeReceiving = 'fail';
      results.handDetection = 'fail';
      updateTestResultsState({ ...results });
      updateTestingState(false);
      logMsg(`[TEST] Camera Test failed at step 1: ${err}`);
      return;
    }

    // Inspect live app resources
    const video = videoRef.current;
    const stream = activeStreamRef.current;

    if (!video || !stream) {
      logMsg("[TEST] Application webcam stream or video element is not active.");
      results.videoPlaying = 'fail';
      results.videoDimensions = 'fail';
      results.framesUpdating = 'fail';
      results.mediaPipeReceiving = 'fail';
      results.handDetection = 'fail';
      updateTestResultsState({ ...results });
      updateTestingState(false);
      return;
    }

    // Step 3: Video Playing
    if (!video.paused && video.currentTime > 0) {
      results.videoPlaying = 'success';
    } else {
      await new Promise(r => setTimeout(r, 600));
      if (!video.paused && video.currentTime > 0) {
        results.videoPlaying = 'success';
      } else {
        results.videoPlaying = 'fail';
      }
    }
    updateTestResultsState({ ...results });

    // Step 4: Video Dimensions Available
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      results.videoDimensions = 'success';
    } else {
      results.videoDimensions = 'fail';
    }
    updateTestResultsState({ ...results });

    // Step 5: Frames Updating
    const startFrames = frameCountRef.current;
    await new Promise(r => setTimeout(r, 600));
    const endFrames = frameCountRef.current;
    if (endFrames > startFrames) {
      results.framesUpdating = 'success';
    } else {
      results.framesUpdating = 'fail';
    }
    updateTestResultsState({ ...results });

    // Step 6: MediaPipe Receiving Frames
    if (handTracker.getTrackingFPS() > 0 || (endFrames > startFrames && handTracker.getStatus() === 'ready')) {
      results.mediaPipeReceiving = 'success';
    } else {
      results.mediaPipeReceiving = 'fail';
    }
    updateTestResultsState({ ...results });

    // Step 7: Hand Detection Operational
    if (handTracker.getStatus() === 'ready') {
      results.handDetection = 'success';
    } else {
      results.handDetection = 'fail';
    }
    updateTestResultsState({ ...results });
    updateTestingState(false);
    
    logMsg("[TEST] Camera Test completed.");
  };

  // External test trigger listener
  useEffect(() => {
    if (triggerCameraTest) {
      runCameraTest().then(() => {
        if (onCameraTestComplete) onCameraTestComplete();
      });
    }
  }, [triggerCameraTest]);

  // Render skeleton overlays with colors mapped to confidence
  const drawOverlay = (data: TrackingData) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let statusColor = 'rgba(255, 0, 85, 0.6)';
    if (data.confidence >= 0.80) {
      statusColor = 'rgba(57, 255, 20, 0.65)';
    } else if (data.confidence >= 0.50) {
      statusColor = 'rgba(255, 234, 0, 0.65)';
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

    for (let i = 0; i < data.rawLandmarks.length; i++) {
      const pt = data.rawLandmarks[i];
      if (pt) {
        ctx.beginPath();
        if (i === 4 || i === 8 || i === 12) {
          ctx.fillStyle = '#ff0055';
          ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 4.0, 0, Math.PI * 2);
        } else {
          ctx.fillStyle = data.confidence >= 0.8 ? '#00ffff' : '#ffea00';
          ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 2.0, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }

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

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.22)';
    ctx.lineWidth = 1.0;
    ctx.setLineDash([4, 4]);

    const cx = canvas.width / 2;
    const cy = canvas.height * 0.55;

    ctx.beginPath();
    ctx.arc(cx, cy + 30, 12, Math.PI, 0);
    ctx.lineTo(cx + 20, cy - 8);
    ctx.lineTo(cx + 20, cy - 45);
    ctx.arc(cx + 16, cy - 45, 4, 0, Math.PI, true);
    ctx.lineTo(cx + 12, cy - 8);
    ctx.lineTo(cx + 8, cy - 48);
    ctx.arc(cx + 4, cy - 48, 4, 0, Math.PI, true);
    ctx.lineTo(cx, cy - 8);
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

      <div className="webcam-feed-container" style={{ position: 'relative' }}>
        {/* Render status overlays on top of the video container */}
        {cameraStatus === 'permission_denied' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '12px',
            textAlign: 'center',
            color: 'var(--neon-pink)',
            gap: '10px',
            background: 'rgba(10, 10, 15, 0.9)',
            zIndex: 5
          }}>
            <CameraOff size={28} />
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Webcam Blocked</span>
            <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)' }}>Please allow camera permission in browser URL settings.</p>
            <button className="neon-btn neon-btn-primary neon-btn-sm" onClick={setupPipeline} style={{ padding: '6px 12px', fontSize: '0.7rem' }}>
              <RefreshCw size={10} /> Retry Consent
            </button>
          </div>
        )}

        {(cameraStatus === 'loading' || trackerStatus === 'loading') && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
            color: 'rgba(255,255,255,0.6)',
            background: 'rgba(10, 10, 15, 0.85)',
            zIndex: 5
          }}>
            <RefreshCw className="spinner" size={24} style={{ borderTopColor: 'var(--neon-cyan)', border: '2px solid rgba(255,255,255,0.1)' }} />
            <span style={{ fontSize: '0.75rem' }}>Acquiring stream & loading AI...</span>
          </div>
        )}

        {(cameraStatus === 'error' || trackerStatus === 'error') && cameraStatus !== 'permission_denied' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '10px',
            color: 'var(--neon-pink)',
            gap: '8px',
            background: 'rgba(10, 10, 15, 0.9)',
            zIndex: 5
          }}>
            <AlertCircle size={28} />
            <span style={{ fontSize: '0.75rem', textAlign: 'center' }}>Sensor offline</span>
            <p style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
              {trackerError || 'Reconnecting...'}
            </p>
            <button className="neon-btn neon-btn-primary neon-btn-sm" onClick={setupPipeline} style={{ padding: '6px 12px', fontSize: '0.7rem', marginTop: '4px' }}>
              <RefreshCw size={10} /> Restart Sensor
            </button>
          </div>
        )}

        {/* Always render the video and canvas so the refs are always active! */}
        <video 
          ref={videoRef}
          playsInline 
          muted 
          className="webcam-video"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: (cameraStatus === 'ready' && trackerStatus === 'ready') ? 'block' : 'none'
          }}
        />
        <canvas 
          ref={overlayCanvasRef}
          className="webcam-canvas-overlay"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            display: (cameraStatus === 'ready' && trackerStatus === 'ready') ? 'block' : 'none',
            zIndex: 2
          }}
        />
      </div>

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

      <button
        onClick={runCameraTest}
        disabled={isTestingCamera}
        className="neon-btn"
        style={{
          width: '100%',
          fontSize: '0.7rem',
          padding: '6px',
          borderColor: isTestingCamera ? 'rgba(255,255,255,0.1)' : 'var(--neon-cyan)',
          color: isTestingCamera ? 'rgba(255,255,255,0.3)' : 'var(--neon-cyan)',
          boxShadow: isTestingCamera ? 'none' : '0 0 5px rgba(0, 255, 255, 0.1)',
          cursor: isTestingCamera ? 'not-allowed' : 'pointer',
          marginTop: '4px'
        }}
      >
        {isTestingCamera ? 'TESTING CAMERA...' : 'TEST CAMERA'}
      </button>
    </div>
  );
};
export default WebcamView;
