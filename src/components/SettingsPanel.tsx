import React from 'react';
import { GameSettings } from '../types/game';
import { Sliders, Volume2, Monitor, Accessibility, X } from 'lucide-react';

interface SettingsPanelProps {
  settings: GameSettings;
  onUpdate: (settings: GameSettings) => void;
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, onUpdate, onClose }) => {
  const handleChange = <T extends keyof GameSettings, K extends keyof GameSettings[T]>(
    section: T,
    key: K,
    value: GameSettings[T][K]
  ) => {
    const updated = {
      ...settings,
      [section]: {
        ...settings[section],
        [key]: value
      }
    };
    onUpdate(updated);
  };

  return (
    <div className="center-overlay-container" style={{ pointerEvents: 'auto' }}>
      <div className="glass-panel menu-card" style={{ maxWidth: '520px', animation: 'none', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h2 className="text-glow-cyan" style={{ textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={20} /> Systems Configuration
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ff0055', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '420px', overflowY: 'auto', paddingRight: '8px' }}>
          
          {/* 1. GRAPHICS OPTIONS */}
          <div>
            <h4 style={{ color: 'var(--neon-cyan)', textTransform: 'uppercase', fontSize: '0.82rem', borderBottom: '1px dashed rgba(255,255,255,0.1)', paddingBottom: '4px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Monitor size={14} /> Graphics Quality
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Detail Level</span>
                <select 
                  value={settings.graphics.quality} 
                  onChange={e => handleChange('graphics', 'quality', e.target.value as 'low' | 'medium' | 'high')}
                  style={{ background: '#100c22', color: 'white', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', padding: '4px 8px' }}
                >
                  <option value="low">Low (Max FPS)</option>
                  <option value="medium">Medium</option>
                  <option value="high">High (AAA Glow)</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Particle Effects</span>
                <input 
                  type="checkbox" 
                  checked={settings.graphics.effects} 
                  onChange={e => handleChange('graphics', 'effects', e.target.checked)} 
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>FPS Limiter</span>
                <select 
                  value={settings.graphics.fpsLimit} 
                  onChange={e => handleChange('graphics', 'fpsLimit', parseInt(e.target.value, 10))}
                  style={{ background: '#100c22', color: 'white', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', padding: '4px 8px' }}
                >
                  <option value={30}>30 FPS</option>
                  <option value={60}>60 FPS</option>
                  <option value={120}>120 FPS</option>
                  <option value={144}>144 FPS</option>
                </select>
              </div>
            </div>
          </div>

          {/* 2. TRACKING CALIBRATION */}
          <div>
            <h4 style={{ color: 'var(--neon-green)', textTransform: 'uppercase', fontSize: '0.82rem', borderBottom: '1px dashed rgba(255,255,255,0.1)', paddingBottom: '4px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sliders size={14} /> Hand Tracking & Calibration
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>Sensitivity</span>
                  <span style={{ color: 'var(--neon-green)', fontWeight: 600 }}>{settings.tracking.sensitivity.toFixed(1)}x</span>
                </div>
                <input 
                  type="range" min="0.5" max="2.5" step="0.1" 
                  value={settings.tracking.sensitivity} 
                  onChange={e => handleChange('tracking', 'sensitivity', parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--neon-green)' }}
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>Smoothing (Kalman Noise Rejection)</span>
                  <span style={{ color: 'var(--neon-green)', fontWeight: 600 }}>{Math.round(settings.tracking.smoothing * 100)}%</span>
                </div>
                <input 
                  type="range" min="0.0" max="0.95" step="0.05" 
                  value={settings.tracking.smoothing} 
                  onChange={e => handleChange('tracking', 'smoothing', parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--neon-green)' }}
                />
              </div>
            </div>
          </div>

          {/* 3. AUDIO MIXER */}
          <div>
            <h4 style={{ color: 'var(--neon-yellow)', textTransform: 'uppercase', fontSize: '0.82rem', borderBottom: '1px dashed rgba(255,255,255,0.1)', paddingBottom: '4px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Volume2 size={14} /> Master Mixer
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.85rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>Master Volume</span>
                  <span>{Math.round(settings.audio.master * 100)}%</span>
                </div>
                <input 
                  type="range" min="0" max="1.0" step="0.05" 
                  value={settings.audio.master} 
                  onChange={e => handleChange('audio', 'master', parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--neon-yellow)' }}
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>Music Level</span>
                  <span>{Math.round(settings.audio.music * 100)}%</span>
                </div>
                <input 
                  type="range" min="0" max="1.0" step="0.05" 
                  value={settings.audio.music} 
                  onChange={e => handleChange('audio', 'music', parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--neon-yellow)' }}
                />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <span>Effects Level</span>
                  <span>{Math.round(settings.audio.effects * 100)}%</span>
                </div>
                <input 
                  type="range" min="0" max="1.0" step="0.05" 
                  value={settings.audio.effects} 
                  onChange={e => handleChange('audio', 'effects', parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--neon-yellow)' }}
                />
              </div>
            </div>
          </div>

          {/* 4. ACCESSIBILITY */}
          <div>
            <h4 style={{ color: 'var(--neon-pink)', textTransform: 'uppercase', fontSize: '0.82rem', borderBottom: '1px dashed rgba(255,255,255,0.1)', paddingBottom: '4px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Accessibility size={14} /> Accessibility Toggles
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>High Contrast UI Mode</span>
                <input 
                  type="checkbox" 
                  checked={settings.accessibility.highContrast} 
                  onChange={e => handleChange('accessibility', 'highContrast', e.target.checked)} 
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Enlarged HUD Overlay</span>
                <input 
                  type="checkbox" 
                  checked={settings.accessibility.largeUI} 
                  onChange={e => handleChange('accessibility', 'largeUI', e.target.checked)} 
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Reduced Motion Mode (No shake)</span>
                <input 
                  type="checkbox" 
                  checked={settings.accessibility.reducedMotion} 
                  onChange={e => handleChange('accessibility', 'reducedMotion', e.target.checked)} 
                />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
export default SettingsPanel;
