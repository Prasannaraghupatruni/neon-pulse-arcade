import React from 'react';
import { ShieldAlert, Cpu, Layers, Video } from 'lucide-react';

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
  onClose
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
      borderLeft: '1px solid rgba(0, 255, 255, 0.15)'
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
            <span>Last Frame:</span>
            <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{Math.round(lastTimestamp)} ms</span>
          </div>
        </div>
      </div>

    </div>
  );
};
export default DiagnosticsPanel;
