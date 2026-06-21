import React from 'react';
import { ShieldAlert, Cpu, Layers, Video, Activity } from 'lucide-react';

interface DiagnosticsPanelProps {
  cameraStatus: 'ready' | 'permission_denied' | 'loading' | 'error';
  trackingStatus: 'active' | 'searching' | 'lost';
  resolution: { width: number; height: number };
  trackingFps: number;
  renderFps: number;
  handsCount: number;
  confidence: number;
  lastTimestamp: number;
  modelLoaded: boolean;
  onClose?: () => void;
  // New diagnostics fields
  streamActive?: boolean;
  videoTracksCount?: number;
  videoReadyState?: number;
  frameCount?: number;
  diagnosticLogs?: string[];
  onRunCameraTest?: () => void;
  isTestingCamera?: boolean;
  cameraTestResults?: Record<string, 'pending' | 'success' | 'fail' | 'none'>;
}

export const DiagnosticsPanel: React.FC<DiagnosticsPanelProps> = ({
  cameraStatus,
  trackingStatus,
  resolution,
  trackingFps,
  renderFps,
  handsCount,
  confidence,
  lastTimestamp,
  modelLoaded,
  onClose,
  streamActive = false,
  videoTracksCount = 0,
  videoReadyState = 0,
  frameCount = 0,
  diagnosticLogs = [],
  onRunCameraTest,
  isTestingCamera = false,
  cameraTestResults = {}
}) => {
  return (
    <div className="glass-panel" style={{
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      fontSize: '0.82rem',
      color: 'rgba(255, 255, 255, 0.85)',
      width: '260px',
      pointerEvents: 'auto',
      borderLeft: '1px solid rgba(0, 255, 255, 0.15)',
      maxHeight: '90vh',
      overflowY: 'auto'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px' }}>
        <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--neon-cyan)' }}>
          <Cpu size={14} /> Telemetry
        </span>
        {onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '0.75rem' }}>
            [HIDE]
          </button>
        )}
      </div>

      {/* Camera telemetry */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Video size={13} style={{ color: 'var(--neon-cyan)' }} />
          <strong>Webcam Feed</strong>
        </div>
        <div style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Feed status:</span>
            <span style={{ 
              color: cameraStatus === 'ready' ? 'var(--neon-green)' : cameraStatus === 'loading' ? 'var(--neon-yellow)' : 'var(--neon-pink)', 
              fontWeight: 600, 
              textTransform: 'uppercase' 
            }}>
              {cameraStatus}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Resolution:</span>
            <span>{resolution.width > 0 ? `${resolution.width}x${resolution.height}` : 'N/A'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Stream Active:</span>
            <span style={{ color: streamActive ? 'var(--neon-green)' : 'var(--neon-pink)', fontWeight: 600 }}>
              {streamActive ? 'YES' : 'NO'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Video Tracks:</span>
            <span>{videoTracksCount}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Video ReadyState:</span>
            <span style={{ color: videoReadyState >= 4 ? 'var(--neon-green)' : 'var(--neon-yellow)', fontWeight: 600 }}>
              {videoReadyState}
            </span>
          </div>
        </div>
      </div>

      {/* Model telemetry */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Layers size={13} style={{ color: 'var(--neon-green)' }} />
          <strong>Vision AI Model</strong>
        </div>
        <div style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Model status:</span>
            <span style={{ color: modelLoaded ? 'var(--neon-green)' : 'var(--neon-yellow)', fontWeight: 600 }}>
              {modelLoaded ? 'LOADED (LOCAL)' : 'LOADING...'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Tracking status:</span>
            <span style={{ 
              color: trackingStatus === 'active' ? 'var(--neon-green)' : trackingStatus === 'searching' ? 'var(--neon-yellow)' : 'var(--neon-pink)', 
              fontWeight: 600,
              textTransform: 'uppercase'
            }}>
              {trackingStatus}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Hands:</span>
            <span>{handsCount} / 1</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Confidence:</span>
            <span>{Math.round(confidence * 100)}%</span>
          </div>
        </div>
      </div>

      {/* Performance telemetry */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ShieldAlert size={13} style={{ color: 'var(--neon-pink)' }} />
          <strong>Engine Frames</strong>
        </div>
        <div style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Vite Render FPS:</span>
            <span style={{ color: renderFps >= 58 ? 'var(--neon-green)' : renderFps >= 30 ? 'var(--neon-yellow)' : 'var(--neon-pink)', fontWeight: 600 }}>
              {renderFps} FPS
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>MediaPipe FPS:</span>
            <span style={{ color: trackingFps >= 25 ? 'var(--neon-green)' : trackingFps >= 15 ? 'var(--neon-yellow)' : 'var(--neon-pink)', fontWeight: 600 }}>
              {trackingFps} FPS
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Frames Captured:</span>
            <span>{frameCount}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Last Timestamp:</span>
            <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{Math.round(lastTimestamp)} ms</span>
          </div>
        </div>
      </div>

      {/* Diagnostics Logs */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Activity size={13} style={{ color: 'var(--neon-yellow)' }} />
          <strong>Diagnostics Logs</strong>
        </div>
        <div style={{
          fontFamily: 'monospace',
          fontSize: '0.65rem',
          background: 'rgba(0, 0, 0, 0.45)',
          padding: '6px',
          borderRadius: '4px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          maxHeight: '90px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          lineHeight: '1.2'
        }}>
          {diagnosticLogs.length === 0 ? (
            <span style={{ color: 'rgba(255, 255, 255, 0.3)' }}>No logs recorded yet.</span>
          ) : (
            diagnosticLogs.map((log, idx) => {
              const isError = log.includes('[ERROR]');
              const isRecovery = log.includes('[RECOVERY]');
              const isTest = log.includes('[TEST]');
              let color = 'rgba(255,255,255,0.7)';
              if (isError) color = 'var(--neon-pink)';
              else if (isRecovery) color = 'var(--neon-yellow)';
              else if (isTest) color = 'var(--neon-cyan)';
              return (
                <div key={idx} style={{ color }}>
                  {log}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Camera Test Checklist */}
      {(isTestingCamera || (cameraTestResults && Object.keys(cameraTestResults).length > 0)) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Activity size={13} style={{ color: 'var(--neon-cyan)' }} />
            <strong>Camera Test Results</strong>
          </div>
          <div style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.72rem' }}>
            {[
              { key: 'cameraAccessible', label: 'Camera Accessible' },
              { key: 'streamActive', label: 'Stream Active' },
              { key: 'videoPlaying', label: 'Video Playing' },
              { key: 'videoDimensions', label: 'Dimensions Available' },
              { key: 'framesUpdating', label: 'Frames Updating' },
              { key: 'mediaPipeReceiving', label: 'MediaPipe Receiving' },
              { key: 'handDetection', label: 'Hand Engine Operational' }
            ].map(item => {
              const res = cameraTestResults?.[item.key];
              let statusText = 'Pending';
              let statusColor = 'rgba(255,255,255,0.4)';
              if (res === 'success') {
                statusText = '✓ Pass';
                statusColor = 'var(--neon-green)';
              } else if (res === 'fail') {
                statusText = '✗ Fail';
                statusColor = 'var(--neon-pink)';
              }
              return (
                <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{item.label}:</span>
                  <span style={{ color: statusColor, fontWeight: 600 }}>{statusText}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {onRunCameraTest && (
        <button 
          onClick={onRunCameraTest}
          disabled={isTestingCamera}
          className="neon-btn"
          style={{
            marginTop: '6px',
            width: '100%',
            fontSize: '0.75rem',
            padding: '8px 12px',
            borderColor: isTestingCamera ? 'rgba(255,255,255,0.1)' : 'var(--neon-cyan)',
            color: isTestingCamera ? 'rgba(255,255,255,0.3)' : 'var(--neon-cyan)',
            boxShadow: isTestingCamera ? 'none' : '0 0 5px rgba(0, 255, 255, 0.2)',
            cursor: isTestingCamera ? 'not-allowed' : 'pointer'
          }}
        >
          {isTestingCamera ? 'RUNNING TEST...' : 'RUN CAMERA TEST'}
        </button>
      )}

    </div>
  );
};
export default DiagnosticsPanel;
