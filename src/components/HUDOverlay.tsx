import React, { useState, useEffect } from 'react';
import { Volume2, VolumeX, Pause, Play, Settings, Activity, AlertTriangle, Award } from 'lucide-react';
import { soundSynth } from '../services/soundSynth';
import { LiveEvent, Mission } from '../types/game';

interface HUDOverlayProps {
  score: number;
  comboMultiplier: number;
  comboCount: number;
  level: number;
  xpPercent: number;
  waveNumber: number;
  timeSurvived: number;
  activeLiveEvent: LiveEvent;
  activePowerUps: string[];
  activeMission: Mission | null;
  isPaused: boolean;
  onPauseToggle: () => void;
  onShowInstructions: () => void;
  detectedGesture: 'none' | 'pinch' | 'fist' | 'open' | 'peace' | 'thumbs_up' | 'rock';
  novaBlastCooldown: number;
  controlMode: 'camera' | 'touch';
  onControlModeToggle: () => void;
}

export const HUDOverlay: React.FC<HUDOverlayProps> = ({
  score,
  comboMultiplier,
  comboCount,
  level,
  xpPercent,
  waveNumber,
  timeSurvived,
  activeLiveEvent,
  activePowerUps,
  activeMission,
  isPaused,
  onPauseToggle,
  onShowInstructions,
  detectedGesture,
  novaBlastCooldown,
  controlMode,
  onControlModeToggle
}) => {
  const [volume, setVolume] = useState(soundSynth.getMasterVolume());
  const [isMuted, setIsMuted] = useState(soundSynth.getMuted());

  useEffect(() => {
    soundSynth.setMasterVolume(volume);
  }, [volume]);

  useEffect(() => {
    soundSynth.setMute(isMuted);
  }, [isMuted]);

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (vol > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  // Helper to format live event text
  const getLiveEventText = () => {
    switch (activeLiveEvent) {
      case 'crystal_storm': return 'CRYSTAL STORM ACTIVE';
      case 'enemy_rush': return 'CORRUPTED VECTOR SWARM INCOMING';
      case 'golden_frenzy': return 'GOLD FRENZY DETECTED';
      case 'boss_warning': return 'WARNING: FIREWALL BOSS NEST ACTIVE';
      case 'system_hack': return 'WARNING: GRID HACK IN PROGRESS';
      default: return '';
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {/* 1. TOP HUD HEADER BAR */}
      <div className="hud-header">
        {/* Pause Button */}
        <button 
          className="neon-btn neon-btn-primary neon-btn-sm"
          onClick={onPauseToggle}
          aria-label={isPaused ? "Resume Game" : "Pause Game"}
        >
          {isPaused ? <Play size={16} /> : <Pause size={16} />}
          <span>{isPaused ? "Resume" : "Pause"}</span>
        </button>

        {/* Control Mode Toggle */}
        <button 
          className="neon-btn neon-btn-sm"
          onClick={onControlModeToggle}
          title="Toggle Control Mode"
          style={{
            borderColor: controlMode === 'touch' ? 'var(--neon-yellow)' : 'var(--neon-cyan)',
            color: controlMode === 'touch' ? 'var(--neon-yellow)' : 'var(--neon-cyan)'
          }}
        >
          <span>{controlMode === 'touch' ? '🎮 Touch' : '📷 Camera'}</span>
        </button>

        {/* Center Level & XP display */}
        <div className="glass-panel" style={{
          padding: '6px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          border: '1px solid rgba(0, 255, 255, 0.15)',
          minWidth: '220px',
          pointerEvents: 'none'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
            <span>LVL {level}</span>
            <span>XP PROGRESS</span>
          </div>
          <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${xpPercent * 100}%`, height: '100%', background: 'var(--neon-pink)', boxShadow: '0 0 8px var(--neon-pink)' }} />
          </div>
        </div>

        {/* Right audio controllers & settings */}
        <div className="glass-panel" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '6px 12px',
          borderRadius: '10px'
        }}>
          <button 
            className="neon-btn neon-btn-sm" 
            onClick={onShowInstructions}
            style={{ padding: '6px', background: 'transparent', border: 'none', boxShadow: 'none' }}
            title="System Upgrades"
          >
            <Settings size={16} style={{ color: 'rgba(255, 255, 255, 0.6)' }} />
          </button>

          <div className="volume-control">
            <button 
              onClick={toggleMute}
              style={{
                background: 'none',
                border: 'none',
                color: isMuted ? 'var(--neon-pink)' : 'var(--neon-cyan)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '4px'
              }}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input 
              type="range"
              min="0"
              max="0.8"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="volume-slider"
              style={{ width: '60px' }}
            />
          </div>
        </div>
      </div>

      {/* 2. SIDEBAR GAMEPLAY HUD PANELS (FLOAT LEFT) */}
      <div style={{
        position: 'absolute',
        top: '90px',
        left: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '240px',
        pointerEvents: 'none',
        zIndex: 20
      }}>
        {/* Score display */}
        <div className="glass-panel text-glow-cyan" style={{
          padding: '10px 16px',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid rgba(0, 255, 255, 0.15)'
        }}>
          <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>SCORE</span>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.75rem', fontWeight: 800 }}>{score}</span>
        </div>

        {/* Combo multiplier display */}
        {comboCount > 0 && (
          <div className="glass-panel text-glow-pink" style={{
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 0, 85, 0.05)',
            borderColor: 'rgba(255, 0, 85, 0.2)'
          }}>
            <div>
              <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>COMBO STREAK</span>
              <div style={{ fontSize: '0.78rem', color: 'white', fontWeight: 600 }}>{comboCount} Crystal Plucks</div>
            </div>
            <span style={{
              fontSize: '1.4rem',
              fontWeight: 800,
              color: 'var(--neon-pink)'
            }}>
              x{comboMultiplier}
            </span>
          </div>
        )}

        {/* Wave and time survived display */}
        <div className="glass-panel" style={{
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <Activity size={16} style={{ color: 'var(--neon-green)' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)' }}>TIME SURVIVED</span>
            <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>
              WAVE {waveNumber} // {formatTime(timeSurvived)}
            </span>
          </div>
        </div>

        {/* Current Active Mission Panel */}
        {activeMission && (
          <div className="glass-panel" style={{
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            borderColor: activeMission.completed ? 'var(--neon-green)' : 'rgba(255,255,255,0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: activeMission.completed ? 'var(--neon-green)' : 'var(--neon-cyan)' }}>
              <Award size={14} />
              <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase' }}>GRID OBJECTIVE</span>
            </div>
            <p style={{ fontSize: '0.76rem', color: 'white', fontWeight: 500, lineHeight: 1.2 }}>{activeMission.description}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
              <span>PROGRESS</span>
              <strong style={{ color: 'white', fontFamily: 'monospace' }}>
                {activeMission.progress} / {activeMission.target}
              </strong>
            </div>
          </div>
        )}

        {/* Active Powerups/Abilities node indicators */}
        {activePowerUps.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', paddingLeft: '4px' }}>ACTIVE MODS</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {activePowerUps.map((p, idx) => (
                <div 
                  key={idx} 
                  className="glass-panel" 
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: p.includes('Magnet') ? 'var(--neon-cyan)' : p.includes('Frenzy') ? 'var(--neon-yellow)' : 'var(--neon-pink)',
                    borderColor: 'currentColor',
                    background: 'rgba(255,255,255,0.02)'
                  }}
                >
                  {p}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. CENTER SCREEN FLASHING EVENT WARNING BANNER */}
      {activeLiveEvent !== 'none' && (
        <div style={{
          position: 'absolute',
          top: '90px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 24px',
          borderRadius: '10px',
          background: activeLiveEvent.includes('hack') || activeLiveEvent.includes('warning') ? 'rgba(255, 0, 85, 0.15)' : 'rgba(0, 255, 255, 0.15)',
          border: `1px solid ${activeLiveEvent.includes('hack') || activeLiveEvent.includes('warning') ? 'var(--neon-pink)' : 'var(--neon-cyan)'}`,
          boxShadow: `0 0 15px ${activeLiveEvent.includes('hack') || activeLiveEvent.includes('warning') ? 'var(--neon-pink)44' : 'var(--neon-cyan)44'}`,
          color: 'white',
          fontSize: '0.82rem',
          fontWeight: 700,
          fontFamily: "'Space Grotesk', sans-serif",
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          pointerEvents: 'none',
          zIndex: 10,
          animation: 'pulse 1s infinite alternate'
        }}>
          <AlertTriangle size={15} style={{ color: activeLiveEvent.includes('hack') || activeLiveEvent.includes('warning') ? 'var(--neon-pink)' : 'var(--neon-cyan)' }} />
          <span>{getLiveEventText()}</span>
        </div>
      )}

      {/* 4. BOTTOM GESTURE COMMAND PANEL */}
      {controlMode === 'camera' && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '12px',
          pointerEvents: 'none',
          zIndex: 20
        }}>
          {[
            { key: 'pinch', label: '🤏 PINCH: SHIELD', color: 'var(--neon-cyan)', active: detectedGesture === 'pinch', desc: 'Deflects hazards' },
            { key: 'open', label: '🖐️ OPEN: NOVA BLAST', color: '#39ff14', active: detectedGesture === 'open', desc: 'Clears screen', cooldown: novaBlastCooldown },
            { key: 'fist', label: '✊ FIST: GRAVITY', color: '#bf55ec', active: detectedGesture === 'fist', desc: 'Sucks items & slows foes' },
            { key: 'peace', label: '✌️ PEACE: SABERS', color: '#ffea00', active: detectedGesture === 'peace', desc: 'Melee laser blades' },
            { key: 'rock', label: '🤘 HORNS: QUIT', color: '#ff0055', active: detectedGesture === 'rock', desc: 'Hold 2s to self-destruct' }
          ].map(gesture => (
            <div 
              key={gesture.key}
              className="glass-panel"
              style={{
                padding: '6px 12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: '145px',
                border: `1.5px solid ${gesture.active ? gesture.color : 'rgba(255, 255, 255, 0.08)'}`,
                boxShadow: gesture.active ? `0 0 10px ${gesture.color}44` : 'none',
                background: gesture.active ? `${gesture.color}15` : 'rgba(255,255,255,0.02)',
                opacity: gesture.active ? 1.0 : 0.45,
                transition: 'all 0.15s ease',
                borderRadius: '8px'
              }}
            >
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: gesture.active ? 'white' : 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                {gesture.label}
              </span>
              {gesture.cooldown && gesture.cooldown > 0 ? (
                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--neon-pink)', marginTop: '2px' }}>
                  COOLDOWN: {gesture.cooldown.toFixed(1)}s
                </span>
              ) : (
                <span style={{ fontSize: '0.58rem', color: gesture.active ? 'white' : 'rgba(255,255,255,0.4)', marginTop: '2px', textAlign: 'center' }}>
                  {gesture.desc}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
};
export default HUDOverlay;
