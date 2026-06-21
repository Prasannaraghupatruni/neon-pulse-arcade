import React, { useRef, useEffect, useState } from 'react';
import { Play, RotateCcw, Award, Sparkles, Volume2, Settings, Shield, Coins } from 'lucide-react';
import { GameEngine } from './game/gameEngine';
import { GameState, GameSettings, Achievement, SkillUpgrades, Mission } from './types/game';
import { HUDOverlay } from './components/HUDOverlay';
import { WebcamView } from './components/WebcamView';
import { SettingsPanel } from './components/SettingsPanel';
import { AchievementsPanel } from './components/AchievementsPanel';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { UpgradesPanel } from './components/UpgradesPanel';
import { soundSynth } from './services/soundSynth';

type ViewMode = 'menu' | 'loading' | 'playing' | 'paused' | 'gameover' | 'sandbox';

const defaultSettings: GameSettings = {
  graphics: {
    quality: 'high',
    effects: true,
    fpsLimit: 60
  },
  tracking: {
    sensitivity: 1.0,
    smoothing: 0.4,
    quality: 'high'
  },
  audio: {
    master: 0.25,
    music: 0.25,
    effects: 0.3,
    mute: false
  },
  accessibility: {
    highContrast: false,
    largeUI: false,
    reducedMotion: false
  }
};

const defaultUpgrades: SkillUpgrades = {
  magnetRadius: 0,
  laserFireRate: 0,
  maxIntegrity: 0,
  shieldEfficiency: 0
};

const defaultAchievements: Achievement[] = [
  {
    id: 'first_blood',
    title: 'Pulse Initiate',
    description: 'Destroy 50 enemy cyber-vectors in a single run.',
    unlocked: false,
    progress: 0,
    target: 50
  },
  {
    id: 'shield_master',
    title: 'Iron Shield',
    description: 'Deflect 30 incoming hazards using your energy shield.',
    unlocked: false,
    progress: 0,
    target: 30
  },
  {
    id: 'combo_king',
    title: 'Hyper Pulse',
    description: 'Reach a combo multiplier of 5x or higher.',
    unlocked: false,
    progress: 0,
    target: 5
  },
  {
    id: 'high_score_10k',
    title: 'Neon Legend',
    description: 'Score 10,000 points or more in a single run.',
    unlocked: false,
    progress: 0,
    target: 10000
  },
  {
    id: 'level_5',
    title: 'Core Overdrive',
    description: 'Reach XP Level 5 in a single run.',
    unlocked: false,
    progress: 0,
    target: 5
  }
];

export const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('menu');
  const [score, setScore] = useState<number>(0);
  const [highScores, setHighScores] = useState<number[]>([]);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [engineState, setEngineState] = useState<GameState | null>(null);

  // Overlays state
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showAchievements, setShowAchievements] = useState<boolean>(false);
  const [showUpgrades, setShowUpgrades] = useState<boolean>(false);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(true);

  // Persistent arcade stats
  const [credits, setCredits] = useState<number>(() => {
    const saved = localStorage.getItem('neon_pulse_credits');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [upgrades, setUpgrades] = useState<SkillUpgrades>(() => {
    const saved = localStorage.getItem('neon_pulse_upgrades');
    return saved ? JSON.parse(saved) : defaultUpgrades;
  });

  const [settings, setSettings] = useState<GameSettings>(() => {
    const saved = localStorage.getItem('neon_pulse_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        soundSynth.setMasterVolume(parsed.audio.master);
        soundSynth.setMusicVolume(parsed.audio.music);
        soundSynth.setEffectsVolume(parsed.audio.effects);
        soundSynth.setMute(parsed.audio.mute);
        return parsed;
      } catch (e) {
        console.error(e);
      }
    }
    return defaultSettings;
  });

  const [achievements, setAchievements] = useState<Achievement[]>(() => {
    const saved = localStorage.getItem('neon_pulse_achievements');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return defaultAchievements;
  });

  // Active missions
  const [activeMissions, setActiveMissions] = useState<Mission[]>([]);

  const [telemetry, setTelemetry] = useState({
    cameraStatus: 'loading' as 'ready' | 'permission_denied' | 'loading' | 'error',
    trackingStatus: 'lost' as 'active' | 'searching' | 'lost',
    resolution: { width: 0, height: 0 },
    trackingFps: 0,
    confidence: 0,
    handsCount: 0,
    lastTimestamp: 0,
    streamActive: false,
    videoTracksCount: 0,
    videoReadyState: 0,
    frameCount: 0,
    diagnosticLogs: [] as string[],
    isTestingCamera: false,
    cameraTestResults: {} as Record<string, 'pending' | 'success' | 'fail' | 'none'>
  });

  const [triggerCameraTest, setTriggerCameraTest] = useState(false);

  const [controlMode, setControlMode] = useState<'camera' | 'touch'>(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return isMobile ? 'touch' : 'camera';
  });
  const [isPointerDown, setIsPointerDown] = useState(false);

  // Fetch High Scores on mount
  useEffect(() => {
    const savedScores = localStorage.getItem('neon_pulse_leaderboard');
    if (savedScores) {
      setHighScores(JSON.parse(savedScores));
    } else {
      const defaultScores = [5000, 3000, 1500, 800, 300];
      localStorage.setItem('neon_pulse_leaderboard', JSON.stringify(defaultScores));
      setHighScores(defaultScores);
    }
  }, []);

  const registerScore = (finalScore: number) => {
    setScore(finalScore);
    const updated = [...highScores, finalScore]
      .sort((a, b) => b - a)
      .slice(0, 5);
    setHighScores(updated);
    localStorage.setItem('neon_pulse_leaderboard', JSON.stringify(updated));
  };

  // Initialize GameEngine
  useEffect(() => {
    if (canvasRef.current && (viewMode === 'playing' || viewMode === 'sandbox')) {
      const callbacks = {
        onStateUpdate: (state: GameState) => {
          setEngineState(state);
          if (viewMode !== 'sandbox') {
            checkAchievements(state);
            checkMissions(state);
          }
        },
        onGameOver: (finalScore: number) => {
          registerScore(finalScore);
          setViewMode('gameover');
          engineRef.current?.stop();
        }
      };

      const engine = new GameEngine(canvasRef.current, settings, upgrades, callbacks, viewMode === 'sandbox');
      engine.setControlMode(controlMode);
      engineRef.current = engine;
      engine.start();

      return () => {
        engine.destroy();
        engineRef.current = null;
      };
    }
  }, [viewMode]);

  // Synchronize controlMode changes to the active game engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setControlMode(controlMode);
    }
  }, [controlMode]);

  // Set up random missions on game start
  const setupMissions = () => {
    const missionsPool: Mission[] = [
      { id: 'collect_shards', description: 'Collect 100 Shards / Credits', target: 100, progress: 0, completed: false, reward: 250 },
      { id: 'reach_combo', description: 'Stack a 20x pluck combo streak', target: 20, progress: 0, completed: false, reward: 300 },
      { id: 'survive_time', description: 'Survive in the grid for 2:00 minutes', target: 120, progress: 0, completed: false, reward: 400 },
      { id: 'deflect_hazards', description: 'Shield deflect 15 corrupted items', target: 15, progress: 0, completed: false, reward: 300 },
      { id: 'level_five', description: 'Overclock Core to level 5', target: 5, progress: 0, completed: false, reward: 350 }
    ];
    const shuffled = [...missionsPool].sort(() => 0.5 - Math.random());
    setActiveMissions(shuffled.slice(0, 3));
  };

  const checkMissions = (state: GameState) => {
    let updated = false;
    const nextMissions = activeMissions.map(m => {
      if (m.completed) return m;

      let progress = m.progress;
      if (m.id === 'collect_shards') {
        progress = state.creditsEarned;
      } else if (m.id === 'reach_combo') {
        progress = Math.max(progress, state.comboCount);
      } else if (m.id === 'survive_time') {
        progress = Math.max(progress, state.timeSurvived);
      } else if (m.id === 'deflect_hazards') {
        progress = Math.max(progress, state.deflections);
      } else if (m.id === 'level_five') {
        progress = Math.max(progress, state.level);
      }

      const completed = progress >= m.target;
      if (completed) {
        updated = true;
        soundSynth.playAchievement();
        setCredits(prev => {
          const next = prev + m.reward;
          localStorage.setItem('neon_pulse_credits', next.toString());
          return next;
        });
        return { ...m, progress, completed };
      }

      if (progress !== m.progress) {
        updated = true;
        return { ...m, progress };
      }

      return m;
    });

    if (updated) {
      setActiveMissions(nextMissions);
    }
  };

  const checkAchievements = (state: GameState) => {
    let updated = false;
    const newAchievements = achievements.map(ach => {
      if (ach.unlocked) return ach;

      let progress = ach.progress;
      if (ach.id === 'first_blood') {
        progress = Math.max(progress, state.enemiesDestroyed);
      } else if (ach.id === 'shield_master') {
        progress = Math.max(progress, state.deflections);
      } else if (ach.id === 'combo_king') {
        progress = Math.max(progress, state.comboMultiplier);
      } else if (ach.id === 'high_score_10k') {
        progress = Math.max(progress, state.score);
      } else if (ach.id === 'level_5') {
        progress = Math.max(progress, state.level);
      }

      const unlocked = progress >= ach.target;
      if (unlocked !== ach.unlocked) {
        updated = true;
        soundSynth.playAchievement();
        return {
          ...ach,
          progress,
          unlocked,
          unlockedAt: new Date().toLocaleTimeString()
        };
      }

      if (progress !== ach.progress) {
        updated = true;
        return { ...ach, progress };
      }

      return ach;
    });

    if (updated) {
      setAchievements(newAchievements);
      localStorage.setItem('neon_pulse_achievements', JSON.stringify(newAchievements));
    }
  };

  const handleTrackingUpdate = (
    x: number,
    y: number,
    isPinching: boolean,
    confidence: number,
    isHandTracked: boolean,
    landmarks?: Array<{ x: number; y: number }>
  ) => {
    if (engineRef.current) {
      engineRef.current.updateTracking(x, y, isPinching, confidence, isHandTracked, landmarks);
    }
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!canvasRef.current || !engineRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    const clampedX = Math.max(0, Math.min(1, x));
    const clampedY = Math.max(0, Math.min(1, y));
    engineRef.current.updateTracking(clampedX, clampedY, false, 1.0, true);
  };

  const handleCanvasTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (controlMode !== 'touch') return;
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      handlePointerMove(touch.clientX, touch.clientY);
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (controlMode !== 'touch') return;
    setIsPointerDown(true);
    handlePointerMove(e.clientX, e.clientY);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (controlMode !== 'touch' || !isPointerDown) return;
    handlePointerMove(e.clientX, e.clientY);
  };

  const handleCanvasMouseUp = () => {
    setIsPointerDown(false);
  };

  const handleTelemetryUpdate = (data: typeof telemetry) => {
    setTelemetry(data);
  };

  const handleSettingsUpdate = (newSettings: GameSettings) => {
    setSettings(newSettings);
    localStorage.setItem('neon_pulse_settings', JSON.stringify(newSettings));
    if (engineRef.current) {
      engineRef.current.updateSettings(newSettings, upgrades);
    }
  };

  const handleUpgradePurchase = (trait: keyof SkillUpgrades, cost: number) => {
    const nextUpgrades = {
      ...upgrades,
      [trait]: upgrades[trait] + 1
    };
    setUpgrades(nextUpgrades);
    localStorage.setItem('neon_pulse_upgrades', JSON.stringify(nextUpgrades));
    
    const nextCredits = credits - cost;
    setCredits(nextCredits);
    localStorage.setItem('neon_pulse_credits', nextCredits.toString());

    if (engineRef.current) {
      engineRef.current.updateSettings(settings, nextUpgrades);
    }
  };

  const startGame = () => {
    soundSynth.playCollect();
    setupMissions();
    setViewMode('playing');
  };

  const startSandbox = () => {
    soundSynth.playCollect();
    setViewMode('sandbox');
  };

  const handlePauseToggle = () => {
    if (viewMode === 'playing' || viewMode === 'sandbox') {
      setViewMode('paused');
      engineRef.current?.stop();
    } else if (viewMode === 'paused') {
      if (engineRef.current?.isSandbox) {
        setViewMode('sandbox');
      } else {
        setViewMode('playing');
      }
      engineRef.current?.start();
    }
  };

  const quitToMenu = () => {
    engineRef.current?.stop();
    setViewMode('menu');
  };

  // Convert collected credits on GameOver
  const handleGameOverCreditsSave = () => {
    if (engineState) {
      const added = engineState.creditsEarned;
      if (added > 0) {
        setCredits(prev => {
          const next = prev + added;
          localStorage.setItem('neon_pulse_credits', next.toString());
          return next;
        });
      }
    }
    setViewMode('menu');
  };

  return (
    <div className="game-container scanline-sweep">
      <div className="scanlines"></div>

      {viewMode === 'playing' || viewMode === 'sandbox' || viewMode === 'paused' ? (
        <canvas 
          ref={canvasRef} 
          onTouchStart={handleCanvasTouch}
          onTouchMove={handleCanvasTouch}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseUp}
          style={{
            gridColumn: '1',
            gridRow: '1',
            width: '100%',
            height: '100%',
            display: 'block',
            touchAction: 'none'
          }}
        />
      ) : null}

      {/* ====================================================
          1. MENU SCREEN VIEW
          ==================================================== */}
      {viewMode === 'menu' && (
        <div className="center-overlay-container">
          <div className="glass-panel menu-card">
            <div className="logo-container">
              <h1 className="logo-main">Neon Pulse</h1>
              <div className="logo-sub">Grid Conductor Survival</div>
            </div>

            <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', lineHeight: 1.5 }}>
              Pluck crystals with your <span style={{ color: 'var(--neon-cyan)', fontWeight: 600 }}>index finger</span> to compose arpeggios. 
              Pinch your thumb & index to form a <span style={{ color: 'var(--neon-cyan)', fontWeight: 600 }}>Shield Dome</span>. 
              Purchase upgrades with credits!
            </div>

            {/* Instruction quick panel */}
            <div className="instructions-grid">
              <div className="instruction-item">
                <div className="instruction-icon"><Sparkles size={16} /></div>
                <div className="instruction-text">
                  <h4>Melodic Plucking</h4>
                  <p>Catch items in succession to build dynamic soundwave arpeggios.</p>
                </div>
              </div>

              <div className="instruction-item">
                <div className="instruction-icon"><Shield size={16} /></div>
                <div className="instruction-text">
                  <h4>Corrupted Defense</h4>
                  <p>Deflect Mines, Swarms & Boss projectiles using the Shield Dome.</p>
                </div>
              </div>
            </div>

            {/* persistent balance indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Coins size={16} style={{ color: 'var(--neon-yellow)' }} />
              <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>ACCUMULATED BALANCE:</span>
              <strong style={{ color: 'var(--neon-yellow)', fontFamily: 'monospace' }}>{credits} CR</strong>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button className="neon-btn neon-btn-primary" onClick={startGame}>
                  <Play size={18} /> Enter Grid
                </button>
                <button className="neon-btn neon-btn-primary" style={{ borderColor: 'var(--neon-yellow)', color: 'var(--neon-yellow)' }} onClick={startSandbox}>
                  <Sparkles size={18} /> Practice Mode
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button className="neon-btn" onClick={() => setShowUpgrades(true)}>
                  <Coins size={16} /> Upgrades Shop
                </button>
                <button className="neon-btn" onClick={() => setShowAchievements(true)}>
                  <Award size={16} /> Trophy Cabinet
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button className="neon-btn" onClick={() => setShowSettings(true)}>
                  <Settings size={16} /> Settings
                </button>
                <button className="neon-btn" onClick={() => setShowHelp(!showHelp)}>
                  Leaderboard
                </button>
              </div>
            </div>

            {showHelp && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left', marginTop: '10px' }}>
                <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>GRID TOP RUNS</h4>
                <div className="leaderboard-list">
                  {highScores.map((scoreItem, idx) => (
                    <div key={idx} className="leaderboard-item">
                      <span>RANK {idx + 1}</span>
                      <strong style={{ color: idx === 0 ? 'var(--neon-yellow)' : 'white' }}>{scoreItem} pts</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================
          2. ACTIVE PLAYING VIEW HUD & CAMERA
          ==================================================== */}
      {(viewMode === 'playing' || viewMode === 'sandbox') && (
        <div className="playing-layout" style={{
          gridTemplateColumns: controlMode === 'touch' ? '1fr' : undefined
        }}>
          <HUDOverlay 
            score={engineState?.score || 0}
            comboMultiplier={engineState?.comboMultiplier || 1}
            comboCount={engineState?.comboCount || 0}
            level={engineState?.level || 1}
            xpPercent={(engineState?.xp || 0) / (engineState?.nextLevelXp || 150)}
            waveNumber={engineState?.waveNumber || 1}
            timeSurvived={engineState?.timeSurvived || 0}
            activeLiveEvent={engineState?.activeLiveEvent || 'none'}
            activePowerUps={engineState?.activePowerUps || []}
            activeMission={activeMissions.find(m => !m.completed) || activeMissions[activeMissions.length - 1] || null}
            isPaused={false}
            onPauseToggle={handlePauseToggle}
            onShowInstructions={handlePauseToggle}
            detectedGesture={engineState?.detectedGesture || 'none'}
            novaBlastCooldown={engineState?.novaBlastCooldown || 0}
            controlMode={controlMode}
            onControlModeToggle={() => setControlMode(prev => prev === 'camera' ? 'touch' : 'camera')}
          />

          {controlMode === 'camera' && (
            <div className="webcam-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '16px', pointerEvents: 'auto' }}>
              <WebcamView 
                settings={settings}
                onTrackingUpdate={handleTrackingUpdate}
                isPaused={false}
                onTelemetryUpdate={handleTelemetryUpdate}
                triggerCameraTest={triggerCameraTest}
                onCameraTestComplete={() => setTriggerCameraTest(false)}
                controlMode={controlMode}
              />

              {showDiagnostics && (
                <DiagnosticsPanel
                  cameraStatus={telemetry.cameraStatus}
                  trackingStatus={telemetry.trackingStatus}
                  resolution={telemetry.resolution}
                  trackingFps={telemetry.trackingFps}
                  renderFps={engineState?.fps || 0}
                  handsCount={telemetry.handsCount}
                  confidence={telemetry.confidence}
                  lastTimestamp={telemetry.lastTimestamp}
                  modelLoaded={telemetry.cameraStatus === 'ready'}
                  onClose={() => setShowDiagnostics(false)}
                  streamActive={telemetry.streamActive}
                  videoTracksCount={telemetry.videoTracksCount}
                  videoReadyState={telemetry.videoReadyState}
                  frameCount={telemetry.frameCount}
                  diagnosticLogs={telemetry.diagnosticLogs}
                  onRunCameraTest={() => setTriggerCameraTest(true)}
                  isTestingCamera={telemetry.isTestingCamera}
                  cameraTestResults={telemetry.cameraTestResults}
                />
              )}
            </div>
          )}

          {controlMode === 'touch' && (
            <div className="virtual-gamepad">
              {/* Left Action Pad (Shield & Gravity) */}
              <div className="gamepad-zone left-zone">
                <button 
                  className="gamepad-btn shield-btn"
                  onTouchStart={() => engineRef.current?.setVirtualGesture('pinch')}
                  onTouchEnd={() => engineRef.current?.setVirtualGesture('none')}
                  onTouchCancel={() => engineRef.current?.setVirtualGesture('none')}
                  onMouseDown={() => engineRef.current?.setVirtualGesture('pinch')}
                  onMouseUp={() => engineRef.current?.setVirtualGesture('none')}
                  onMouseLeave={() => engineRef.current?.setVirtualGesture('none')}
                  title="Deploy Shield"
                >
                  <span className="btn-glyph">🤏</span>
                  <span className="btn-label">Shield</span>
                </button>
                <button 
                  className="gamepad-btn gravity-btn"
                  onTouchStart={() => engineRef.current?.setVirtualGesture('fist')}
                  onTouchEnd={() => engineRef.current?.setVirtualGesture('none')}
                  onTouchCancel={() => engineRef.current?.setVirtualGesture('none')}
                  onMouseDown={() => engineRef.current?.setVirtualGesture('fist')}
                  onMouseUp={() => engineRef.current?.setVirtualGesture('none')}
                  onMouseLeave={() => engineRef.current?.setVirtualGesture('none')}
                  title="Gravity Vortex"
                >
                  <span className="btn-glyph">✊</span>
                  <span className="btn-label">Gravity</span>
                </button>
              </div>

              {/* Right Action Pad (Nova & Sabers) */}
              <div className="gamepad-zone right-zone">
                <button 
                  className="gamepad-btn nova-btn"
                  onTouchStart={() => engineRef.current?.setVirtualGesture('open')}
                  onTouchEnd={() => engineRef.current?.setVirtualGesture('none')}
                  onTouchCancel={() => engineRef.current?.setVirtualGesture('none')}
                  onMouseDown={() => engineRef.current?.setVirtualGesture('open')}
                  onMouseUp={() => engineRef.current?.setVirtualGesture('none')}
                  onMouseLeave={() => engineRef.current?.setVirtualGesture('none')}
                  title="Nova Blast"
                >
                  <span className="btn-glyph">🖐️</span>
                  <span className="btn-label">Nova</span>
                </button>
                <button 
                  className="gamepad-btn sabers-btn"
                  onTouchStart={() => engineRef.current?.setVirtualGesture('peace')}
                  onTouchEnd={() => engineRef.current?.setVirtualGesture('none')}
                  onTouchCancel={() => engineRef.current?.setVirtualGesture('none')}
                  onMouseDown={() => engineRef.current?.setVirtualGesture('peace')}
                  onMouseUp={() => engineRef.current?.setVirtualGesture('none')}
                  onMouseLeave={() => engineRef.current?.setVirtualGesture('none')}
                  title="Cyber Sabers"
                >
                  <span className="btn-glyph">✌️</span>
                  <span className="btn-label">Sabers</span>
                </button>
              </div>
            </div>
          )}

          <div className="glass-panel" style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            padding: '8px 12px',
            fontSize: '0.7rem',
            color: 'rgba(255,255,255,0.6)',
            fontFamily: 'monospace',
            display: 'flex',
            gap: '16px',
            borderRadius: '8px',
            pointerEvents: 'none'
          }}>
            <span>FPS: {engineState?.fps || 0}</span>
            <span>SHIELD: {Math.round(engineState?.shieldEnergy || 0)}%</span>
            <span>EARNED: {engineState?.creditsEarned || 0} CR</span>
            <span style={{ cursor: 'pointer', pointerEvents: 'auto', color: 'var(--neon-cyan)' }} onClick={() => setShowDiagnostics(!showDiagnostics)}>
              [TELEMETRY]
            </span>
          </div>
        </div>
      )}

      {/* ====================================================
          3. PAUSE SCREEN VIEW
          ==================================================== */}
      {viewMode === 'paused' && (
        <div className="center-overlay-container">
          <div className="glass-panel menu-card" style={{ maxWidth: '400px' }}>
            <h2 className="text-glow-cyan" style={{ fontSize: '2.2rem', textTransform: 'uppercase' }}>Game Paused</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
              Calibration settings can be updated below.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
              <button className="neon-btn neon-btn-primary" onClick={handlePauseToggle}>
                <Play size={16} /> Resume Game
              </button>
              <button className="neon-btn" onClick={() => setShowSettings(true)}>
                <Settings size={16} /> Systems Config
              </button>
              <button className="neon-btn" onClick={() => setShowUpgrades(true)}>
                <Coins size={16} /> Upgrades Shop
              </button>
              <button className="neon-btn" onClick={() => setShowAchievements(true)}>
                <Award size={16} /> Trophies List
              </button>
              <button className="neon-btn neon-btn-secondary" onClick={quitToMenu}>
                Quit to Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================
          4. GAME OVER VIEW
          ==================================================== */}
      {viewMode === 'gameover' && (
        <div className="center-overlay-container">
          <div className="glass-panel menu-card" style={{ maxWidth: '440px' }}>
            <h2 className="text-glow-pink" style={{ fontSize: '2.8rem', textTransform: 'uppercase' }}>Integrity Lost</h2>
            <div style={{ margin: '10px 0' }}>
              <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>FINAL SCORE</div>
              <div style={{ fontSize: '3.2rem', fontWeight: 800, color: 'var(--neon-cyan)' }} className="text-glow-cyan">
                {score}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', color: 'var(--neon-yellow)', fontSize: '0.9rem', fontWeight: 700, margin: '8px 0' }}>
                <Coins size={14} /> CREDITS HARVESTED: +{engineState?.creditsEarned || 0} CR
              </div>
              {score >= (highScores[0] || 0) && score > 0 && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--neon-yellow)', fontSize: '0.85rem', fontWeight: 700 }}>
                  <Volume2 size={14} /> NEW PERSONAL BEST!
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
              <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', paddingLeft: '4px' }}>LEADERBOARD</h4>
              <div className="leaderboard-list">
                {highScores.map((scoreItem, idx) => {
                  const isCurrentRun = scoreItem === score && score > 0;
                  return (
                    <div key={idx} className={`leaderboard-item ${isCurrentRun ? 'highlight' : ''}`}>
                      <span>RANK {idx + 1} {isCurrentRun && '• YOUR RUN'}</span>
                      <strong>{scoreItem}</strong>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
              <button className="neon-btn neon-btn-primary" onClick={startGame}>
                <RotateCcw size={16} /> Run Again
              </button>
              <button className="neon-btn" onClick={handleGameOverCreditsSave}>
                Save & Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onUpdate={handleSettingsUpdate}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showAchievements && (
        <AchievementsPanel
          achievements={achievements}
          onClose={() => setShowAchievements(false)}
        />
      )}

      {showUpgrades && (
        <UpgradesPanel
          upgrades={upgrades}
          credits={credits}
          onUpgradePurchase={handleUpgradePurchase}
          onClose={() => setShowUpgrades(false)}
        />
      )}
    </div>
  );
};

export default App;
