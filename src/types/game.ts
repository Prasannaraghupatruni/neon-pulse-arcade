export type EnemyType = 'scout' | 'hunter' | 'mine' | 'swarm' | 'elite' | 'boss';

export type PickupType = 
  | 'crystal_common' 
  | 'crystal_rare' 
  | 'crystal_epic' 
  | 'multiplier_orb' 
  | 'xp_core' 
  | 'time_warp' 
  | 'shield_gen' 
  | 'magnet_orb' 
  | 'hyper_core';

export type LiveEvent = 
  | 'none' 
  | 'crystal_storm' 
  | 'enemy_rush' 
  | 'golden_frenzy' 
  | 'boss_warning' 
  | 'system_hack';

export type AbilityType = 'magnet' | 'vacuum' | 'lightning' | 'shield_dome';

export interface GameSettings {
  graphics: {
    quality: 'low' | 'medium' | 'high';
    effects: boolean;
    fpsLimit: number;
  };
  tracking: {
    sensitivity: number;
    smoothing: number;
    quality: 'low' | 'medium' | 'high';
  };
  audio: {
    master: number;
    music: number;
    effects: number;
    mute: boolean;
  };
  accessibility: {
    highContrast: boolean;
    largeUI: boolean;
    reducedMotion: boolean;
  };
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  progress: number;
  target: number;
  unlockedAt?: string;
}

export interface SkillUpgrades {
  magnetRadius: number;     // Level 0 to 5
  laserFireRate: number;    // Level 0 to 5
  maxIntegrity: number;     // Level 0 to 5
  shieldEfficiency: number; // Level 0 to 5
}

export interface Mission {
  id: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  reward: number; // Credits rewarded
}

export interface GameState {
  score: number;
  highScore: number;
  health: number;
  shieldEnergy: number;
  comboCount: number;
  comboMultiplier: number;
  xp: number;
  level: number;
  nextLevelXp: number;
  isGameOver: boolean;
  isPlaying: boolean;
  fps: number;
  trackingConfidence: number;
  isHandTracked: boolean;
  isShieldActive: boolean;
  slowMoActive: boolean;
  enemiesDestroyed: number;
  deflections: number;
  // Redesign fields
  timeSurvived: number;
  waveNumber: number;
  activeLiveEvent: LiveEvent;
  activePowerUps: string[];
  creditsEarned: number;
  detectedGesture: 'none' | 'pinch' | 'fist' | 'open' | 'peace' | 'thumbs_up' | 'rock';
  novaBlastCooldown: number;
}

export interface Point {
  x: number;
  y: number;
}
