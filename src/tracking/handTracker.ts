import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export interface TrackingData {
  indexTip: { x: number; y: number; z: number };
  thumbTip: { x: number; y: number; z: number };
  middleTip: { x: number; y: number; z: number };
  confidence: number;
  isLeftHand: boolean;
  rawLandmarks: Array<{ x: number; y: number; z: number }>;
}

export type TrackerStatus = 'idle' | 'loading' | 'ready' | 'error';

class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private status: TrackerStatus = 'idle';
  private errorMessage = '';
  private initPromise: Promise<void> | null = null;

  // Telemetry diagnostics
  private cameraWidth = 0;
  private cameraHeight = 0;
  private trackingFPS = 0;
  private lastFrameTime = 0;
  private fpsBuffer: number[] = [];

  public getStatus(): TrackerStatus {
    return this.status;
  }

  public getErrorMessage(): string {
    return this.errorMessage;
  }

  public getCameraResolution() {
    return { width: this.cameraWidth, height: this.cameraHeight };
  }

  public getTrackingFPS(): number {
    return this.trackingFPS;
  }

  public getModelLoaded(): boolean {
    return this.status === 'ready';
  }

  public getLastDetectionTime(): number {
    return this.lastFrameTime;
  }

  /**
   * Initializes the MediaPipe FilesetResolver and HandLandmarker
   */
  public async initialize(onStatusChange?: (status: TrackerStatus, error?: string) => void): Promise<void> {
    if (this.status === 'ready') {
      if (onStatusChange) onStatusChange('ready');
      return;
    }
    if (this.initPromise) {
      if (onStatusChange) onStatusChange(this.status);
      return this.initPromise;
    }

    const setStatus = (s: TrackerStatus, err = '') => {
      this.status = s;
      this.errorMessage = err;
      if (onStatusChange) onStatusChange(s, err);
    };

    setStatus('loading');

    this.initPromise = (async () => {
      try {
        // Load the WebAssembly vision tasks fileset locally
        const vision = await FilesetResolver.forVisionTasks('/wasm');

        // Load and initialize the hand landmarker model locally
        this.landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/hand_landmarker.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numHands: 1
        });

        setStatus('ready');
      } catch (err) {
        console.error('Failed to initialize MediaPipe Hand Landmarker:', err);
        const errMsg = err instanceof Error ? err.message : String(err);
        setStatus('error', `MediaPipe setup failed: ${errMsg}`);
        this.initPromise = null; // Allow retry
        throw err;
      }
    })();

    return this.initPromise;
  }

  /**
   * Processes a video frame and returns hand tracking data
   * @param videoElement HTMLVideoElement containing the webcam frame
   * @param timestamp Current high-res timestamp (from requestAnimationFrame)
   */
  public detectFrame(videoElement: HTMLVideoElement, timestamp: number): TrackingData | null {
    if (!this.landmarker || this.status !== 'ready') return null;

    // Verify video is actually ready
    if (videoElement.readyState < 2) return null;

    // Update telemetry diagnostics
    this.cameraWidth = videoElement.videoWidth;
    this.cameraHeight = videoElement.videoHeight;
    this.lastFrameTime = timestamp;

    const now = performance.now();
    this.fpsBuffer.push(now);
    while (this.fpsBuffer[0] < now - 1000) {
      this.fpsBuffer.shift();
    }
    this.trackingFPS = this.fpsBuffer.length;

    try {
      const results = this.landmarker.detectForVideo(videoElement, timestamp);

      if (
        results &&
        results.landmarks &&
        results.landmarks.length > 0 &&
        results.handedness &&
        results.handedness.length > 0
      ) {
        const rawLandmarks = results.landmarks[0];
        const handInfo = results.handedness[0][0];

        // Extracted key points
        // Landmark indices: 4 = Thumb Tip, 8 = Index Tip, 12 = Middle Tip
        const thumbTip = rawLandmarks[4];
        const indexTip = rawLandmarks[8];
        const middleTip = rawLandmarks[12];

        // MediaPipe coordinates are in [0, 1] relative to image width/height.
        // We will mirror the X-axis because the webcam stream is mirrored in UI
        const mirror = (pt: typeof indexTip) => ({
          x: 1 - pt.x, // Mirror x-axis
          y: pt.y,
          z: pt.z
        });

        return {
          indexTip: mirror(indexTip),
          thumbTip: mirror(thumbTip),
          middleTip: mirror(middleTip),
          confidence: handInfo.score,
          isLeftHand: handInfo.categoryName === 'Left',
          rawLandmarks: rawLandmarks.map(pt => mirror(pt))
        };
      }
    } catch (err) {
      // Don't crash, log and return null
      console.warn('Error detecting hand landmarks in frame:', err);
    }

    return null;
  }
}

export const handTracker = new HandTracker();
export default HandTracker;
