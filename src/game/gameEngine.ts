import { ParticlePool } from './particleSystem';
import { soundSynth } from '../services/soundSynth';
import { GameSettings, GameState, EnemyType, PickupType, LiveEvent, Point, SkillUpgrades } from '../types/game';
import { HandPositionSmoother } from '../tracking/smoothing';

interface Enemy {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: EnemyType;
  size: number;
  color: string;
  hp: number;
  maxHp: number;
  trail: Point[];
  phase: number;
  shieldActive?: boolean;
  beamChargeTimer?: number;
  isFiringBeam?: boolean;
  // Boss & Mine specific
  isBoss?: boolean;
  orbitalAngle?: number;
  mineExploded?: boolean;
  mineWarnTimer?: number;
  bulletTimer?: number;
}

interface Pickup {
  id: number;
  x: number;
  y: number;
  vy: number;
  type: PickupType;
  size: number;
  color: string;
  phase: number;
  magnetized?: boolean;
}

interface Laser {
  x: number;
  y: number;
  vy: number;
  size: number;
  color: string;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: {
    onStateUpdate: (state: GameState) => void;
    onGameOver: (finalScore: number) => void;
  };

  // Game Settings & permanent upgrades (applied at runtime)
  private settings: GameSettings;
  private upgrades: SkillUpgrades;
  private smoother: HandPositionSmoother;

  // Primary Gameplay variables
  private score = 0;
  private highScore = 0;
  private health = 100;
  private shieldEnergy = 100;
  private comboCount = 0;
  private comboMultiplier = 1;
  private isGameOver = false;
  private isPlaying = false;
  private isShieldActive = false;

  // XP, Levels & Waves
  private xp = 0;
  private level = 1;
  private nextLevelXp = 150;
  private waveNumber = 1;
  private timeSurvived = 0;
  private creditsEarned = 0;

  // Physics Time Scale & Hit Stop
  private slowMoTimer = 0;
  private slowMoScale = 1.0;
  private hitStopTimer = 0;
  private screenShakeDuration = 0;
  private screenShakeIntensity = 0;

  // Entities lists
  private enemies: Enemy[] = [];
  private lasers: Laser[] = [];
  private pickups: Pickup[] = [];
  private bullets: Bullet[] = [];
  private particles: ParticlePool;

  // Player cursor variables
  private playerX = 0;
  private playerY = 0;
  private playerTargetX = 0;
  private playerTargetY = 0;
  private playerSize = 15;
  private playerTrail: Point[] = [];
  private maxTrailLength = 20;

  // Spawning schedules
  private lastTime = 0;
  private animationFrameId: number | null = null;
  private enemySpawnTimer = 0;
  private laserFireTimer = 0;
  private liveEventTimer = 0;
  private lightningTimer = 0;

  // ID Counters
  private enemyIdCounter = 0;
  private pickupIdCounter = 0;
  private deflectionsCount = 0;

  // Starfield & 3D grid parameters
  private stars: Array<{ x: number; y: number; z: number; size: number }> = [];
  private gridOffset = 0;
  private perspectiveY = 0.55; // Horizon height ratio

  // Live Events & Abilities states
  private activeLiveEvent: LiveEvent = 'none';
  private liveEventDuration = 0;
  private activePowerUps: string[] = [];
  private magnetTimer = 0;
  private vacuumActive = false;
  private hyperCoreTimer = 0;
  public controlMode: 'camera' | 'touch' = 'camera';
  private virtualGesture: 'none' | 'pinch' | 'fist' | 'open' | 'peace' | 'thumbs_up' | 'rock' = 'none';
  private detectedGesture: 'none' | 'pinch' | 'fist' | 'open' | 'peace' | 'thumbs_up' | 'rock' = 'none';
  private novaBlastCooldown = 0;
  private novaBlastCooldownMax = 8;
  private cyberSaberAngle = 0;
  private isLevelUpPending = false;
  private levelUpProgress = 0;
  private quitProgress = 0;

  // Diagnostic metrics
  private fps = 0;
  private fpsBuffer: number[] = [];
  private trackingConfidence = 0;
  private isHandTracked = false;
  private rawHandLandmarks: Point[] = [];
  public isSandbox = false;

  constructor(
    canvas: HTMLCanvasElement, 
    initialSettings: GameSettings, 
    upgrades: SkillUpgrades,
    callbacks: typeof GameEngine.prototype.callbacks,
    isSandbox = false
  ) {
    this.isSandbox = isSandbox;
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not retrieve Canvas 2D context.');
    this.ctx = context;
    this.callbacks = callbacks;
    this.settings = initialSettings;
    this.upgrades = upgrades;
    this.particles = new ParticlePool();

    this.smoother = new HandPositionSmoother();
    this.smoother.updateSettings(
      this.settings.tracking.sensitivity,
      this.settings.tracking.smoothing
    );

    // Initialize 100 starfield points
    for (let i = 0; i < 100; i++) {
      this.stars.push({
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2,
        z: Math.random() * 2,
        size: 1 + Math.random() * 2
      });
    }

    const savedHighScore = localStorage.getItem('neon_pulse_high_score');
    if (savedHighScore) {
      this.highScore = parseInt(savedHighScore, 10);
    }

    this.resizeCanvas();
    window.addEventListener('resize', this.resizeCanvas);
  }

  public destroy() {
    this.stop();
    window.removeEventListener('resize', this.resizeCanvas);
  }

  private resizeCanvas = () => {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
  };

  public updateSettings(newSettings: GameSettings, newUpgrades?: SkillUpgrades) {
    this.settings = newSettings;
    if (newUpgrades) {
      this.upgrades = newUpgrades;
    }
    this.smoother.updateSettings(
      newSettings.tracking.sensitivity,
      newSettings.tracking.smoothing
    );
    soundSynth.setMasterVolume(newSettings.audio.master);
    soundSynth.setMusicVolume(newSettings.audio.music);
    soundSynth.setEffectsVolume(newSettings.audio.effects);
    soundSynth.setMute(newSettings.audio.mute);
  }

  public start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.isGameOver = false;
    this.score = 0;
    // Set starting health using Structural Armor upgrades (+20 HP per level)
    const baseHealth = 100 + this.upgrades.maxIntegrity * 20;
    this.health = baseHealth;
    this.shieldEnergy = 100;
    this.comboCount = 0;
    this.comboMultiplier = 1;
    this.xp = 0;
    this.level = 1;
    this.nextLevelXp = 150;
    this.waveNumber = 1;
    this.timeSurvived = 0;
    this.creditsEarned = 0;
    
    this.slowMoTimer = 0;
    this.slowMoScale = 1.0;
    this.hitStopTimer = 0;
    this.screenShakeDuration = 0;
    this.screenShakeIntensity = 0;
    
    this.enemies = [];
    this.lasers = [];
    this.pickups = [];
    this.bullets = [];
    this.playerTrail = [];
    this.activePowerUps = [];
    
    this.enemyIdCounter = 0;
    this.pickupIdCounter = 0;
    this.liveEventTimer = 0;
    this.activeLiveEvent = 'none';

    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    this.playerX = width / 2;
    this.playerY = height * 0.75;
    this.playerTargetX = width / 2;
    this.playerTargetY = height * 0.75;

    this.lastTime = performance.now();
    soundSynth.startBgm();
    soundSynth.setComboLevel(1);

    // Initial constant spawns of shards
    for (let i = 0; i < 10; i++) {
      this.spawnPickup(Math.random() * height);
    }

    this.loop(this.lastTime);
  }

  public stop() {
    this.isPlaying = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    soundSynth.stopBgm();
  }

  public setControlMode(mode: 'camera' | 'touch') {
    this.controlMode = mode;
    if (mode === 'touch') {
      this.isHandTracked = true;
    }
  }

  public setVirtualGesture(gesture: 'none' | 'pinch' | 'fist' | 'open' | 'peace' | 'thumbs_up' | 'rock') {
    const prevGesture = this.detectedGesture;
    this.virtualGesture = gesture;
    this.detectedGesture = gesture;
    
    if (gesture === 'open' && prevGesture !== 'open' && this.novaBlastCooldown <= 0) {
      this.triggerNovaBlast();
    }
    
    this.isShieldActive = this.detectedGesture === 'pinch' && this.shieldEnergy > 0;
  }

  public updateTracking(
    x: number,
    y: number,
    isPinching: boolean,
    confidence: number,
    isHandTracked: boolean,
    landmarks?: Point[]
  ) {
    if (this.controlMode === 'touch') {
      if (landmarks !== undefined) return; // Ignore camera tracking updates in Touch Mode
      this.isHandTracked = true;
      this.trackingConfidence = 1.0;
    } else {
      this.isHandTracked = isHandTracked;
      this.trackingConfidence = confidence;
      if (landmarks) {
        this.rawHandLandmarks = landmarks;
      }

      if (!isHandTracked) {
        this.isShieldActive = false;
        this.detectedGesture = 'none';
        return;
      }
    }

    const dt = 0.033; // estimated tracking interval
    const smoothed = this.smoother.smooth({ x, y }, dt);

    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);

    // Handle System Hack inverted controls live event
    if (this.activeLiveEvent === 'system_hack') {
      // Invert coordinates around screen center (0.5, 0.5)
      const invX = 0.5 - (smoothed.x - 0.5);
      const invY = 0.5 - (smoothed.y - 0.5);
      this.playerTargetX = invX * width;
      this.playerTargetY = invY * height;
    } else {
      this.playerTargetX = smoothed.x * width;
      this.playerTargetY = smoothed.y * height;
    }

    // Gesture detection logic (using 2D distances relative to hand landmarks)
    let currentGesture: 'none' | 'pinch' | 'fist' | 'open' | 'peace' | 'thumbs_up' | 'rock' = 'none';
    if (landmarks && landmarks.length >= 21) {
      const wrist = landmarks[0];
      const d = (p1: Point, p2: Point) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
      
      const indexMCP = landmarks[5];
      const indexTip = landmarks[8];
      const middleMCP = landmarks[9];
      const middleTip = landmarks[12];
      const ringMCP = landmarks[13];
      const ringTip = landmarks[16];
      const pinkyMCP = landmarks[17];
      const pinkyTip = landmarks[20];
      
      const thumbTip = landmarks[4];
      const thumbMCP = landmarks[2];

      // Calculate distance ratios relative to wrist-to-MCP distance
      const dWristIndexMCP = d(indexMCP, wrist);
      const dWristMiddleMCP = d(middleMCP, wrist);
      const dWristRingMCP = d(ringMCP, wrist);
      const dWristPinkyMCP = d(pinkyMCP, wrist);
      const dWristThumbMCP = d(thumbMCP, wrist);

      // Guard against division by zero (though extremely rare)
      const rIndex = dWristIndexMCP > 0 ? d(indexTip, wrist) / dWristIndexMCP : 0;
      const rMiddle = dWristMiddleMCP > 0 ? d(middleTip, wrist) / dWristMiddleMCP : 0;
      const rRing = dWristRingMCP > 0 ? d(ringTip, wrist) / dWristRingMCP : 0;
      const rPinky = dWristPinkyMCP > 0 ? d(pinkyTip, wrist) / dWristPinkyMCP : 0;
      const rThumb = dWristThumbMCP > 0 ? d(thumbTip, wrist) / dWristThumbMCP : 0;

      // Thresholds: extended > 1.25, curled < 1.12
      const indexExtended = rIndex > 1.25;
      const indexCurled = rIndex < 1.12;
      const middleExtended = rMiddle > 1.25;
      const middleCurled = rMiddle < 1.12;
      const ringExtended = rRing > 1.25;
      const ringCurled = rRing < 1.12;
      const pinkyExtended = rPinky > 1.25;
      const pinkyCurled = rPinky < 1.12;
      const thumbExtended = rThumb > 1.25 && thumbTip.y < indexMCP.y;

      if (indexExtended && middleCurled && ringCurled && pinkyExtended) {
        currentGesture = 'rock';
      } else if (indexCurled && middleCurled && ringCurled && pinkyCurled && thumbExtended) {
        currentGesture = 'thumbs_up';
      } else if (indexCurled && middleCurled && ringCurled && pinkyCurled) {
        currentGesture = 'fist';
      } else if (indexExtended && middleExtended && ringExtended && pinkyExtended) {
        currentGesture = 'open';
      } else if (indexExtended && middleExtended && ringCurled && pinkyCurled) {
        currentGesture = 'peace';
      } else if (isPinching) {
        currentGesture = 'pinch';
      }
    } else if (isPinching) {
      currentGesture = 'pinch';
    } else {
      currentGesture = this.virtualGesture;
    }

    if (currentGesture === 'open' && this.detectedGesture !== 'open' && this.novaBlastCooldown <= 0) {
      this.triggerNovaBlast();
    }

    this.detectedGesture = currentGesture;

    this.isShieldActive = this.detectedGesture === 'pinch' && this.shieldEnergy > 0;
  }

  private loop = (currentTime: number) => {
    if (!this.isPlaying) return;

    const dt = Math.min(0.05, (currentTime - this.lastTime) / 1000);
    this.lastTime = currentTime;

    this.update(dt);
    this.draw();
    this.updateFPS(currentTime);

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private updateFPS(currentTime: number) {
    this.fpsBuffer.push(currentTime);
    while (this.fpsBuffer[0] < currentTime - 1000) {
      this.fpsBuffer.shift();
    }
    this.fps = this.fpsBuffer.length;
  }

  private update(dt: number) {
    if (this.isGameOver) return;

    // Check for exit/quit gesture (always active during play!)
    this.updateQuitGesture(dt);

    if (this.isLevelUpPending) {
      // Easing player coordinates (so cursor remains responsive!)
      const easing = 0.25;
      if (this.isHandTracked) {
        this.playerX += (this.playerTargetX - this.playerX) * easing;
        this.playerY += (this.playerTargetY - this.playerY) * easing;
      }
      this.playerTrail.push({ x: this.playerX, y: this.playerY });
      if (this.playerTrail.length > this.maxTrailLength) {
        this.playerTrail.shift();
      }

      // Update particles so level-up text and shockwaves animate out
      this.particles.update(dt * this.slowMoScale);

      // Check for proceed gestures
      if (this.detectedGesture === 'thumbs_up') {
        this.levelUpProgress += dt;
        if (this.levelUpProgress >= 1.5) { // 1.5s hold
          this.proceedToNextLevel();
        }
      } else if (this.isShieldActive) { // Pinch is shield active, acts as override!
        this.levelUpProgress += dt * 1.5; // overrides slightly faster
        if (this.levelUpProgress >= 1.5) {
          this.proceedToNextLevel();
        }
      } else {
        this.levelUpProgress = Math.max(0, this.levelUpProgress - dt * 2.0); // decay progress
      }

      this.sendStateUpdate();
      return; // Skip normal physics, enemy spawner, time survived, collision checks!
    }

    if (this.isSandbox) {
      this.health = 100 + this.upgrades.maxIntegrity * 20;
    }

    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);

    // 1. Hit Stop freeze
    if (this.hitStopTimer > 0) {
      this.hitStopTimer -= dt;
      return;
    }

    // 2. Slow-Motion timers
    if (this.slowMoTimer > 0) {
      this.slowMoTimer = Math.max(0, this.slowMoTimer - dt);
      this.slowMoScale += (0.35 - this.slowMoScale) * 0.1;
      soundSynth.setBgmSpeed(this.slowMoScale);
      if (this.slowMoTimer <= 0) {
        soundSynth.playSlowMoEnd();
      }
    } else {
      this.slowMoScale += (1.0 - this.slowMoScale) * 0.1;
      soundSynth.setBgmSpeed(this.slowMoScale);
    }

    const physicsDt = dt * this.slowMoScale;
    this.timeSurvived += dt;

    // Wave Progression Difficulty multiplier
    this.waveNumber = 1 + Math.floor(this.timeSurvived / 45); // Waves increase every 45s
    const speedMult = 1.0 + (this.waveNumber - 1) * 0.10;

    // 3. Player Easing
    const easing = 0.25;
    if (this.isHandTracked) {
      this.playerX += (this.playerTargetX - this.playerX) * easing;
      this.playerY += (this.playerTargetY - this.playerY) * easing;
    }

    this.playerTrail.push({ x: this.playerX, y: this.playerY });
    if (this.playerTrail.length > this.maxTrailLength) {
      this.playerTrail.shift();
    }

    // 4. Gesture Timers and Energy Management
    this.novaBlastCooldown = Math.max(0, this.novaBlastCooldown - dt);

    if (this.isShieldActive) {
      const drainRate = 32 - this.upgrades.shieldEfficiency * 3.5;
      this.shieldEnergy = Math.max(0, this.shieldEnergy - dt * drainRate);
      if (this.shieldEnergy <= 0) {
        this.isShieldActive = false;
        this.detectedGesture = 'none';
      }
    } else if (this.detectedGesture === 'peace' && this.shieldEnergy > 0) {
      // Cyber Sabers drain
      const drainRate = 18 - this.upgrades.shieldEfficiency * 2.0;
      this.shieldEnergy = Math.max(0, this.shieldEnergy - dt * drainRate);
      this.cyberSaberAngle += 9.0 * dt;
      if (this.shieldEnergy <= 0) {
        this.detectedGesture = 'none';
      }
    } else {
      this.shieldEnergy = Math.min(100, this.shieldEnergy + dt * 18);
    }

    // Autocast weapon lasers when hand is tracked, except in special combat gestures
    if (this.isHandTracked && this.detectedGesture !== 'fist' && this.detectedGesture !== 'open' && this.detectedGesture !== 'peace') {
      this.laserFireTimer += dt;
      // Cadence Upgrade increases fire rate: Level 0 = 240ms, Level 5 = 110ms
      // Shield active overclocks the fire rate (Level 0 = 140ms, Level 5 = 65ms)
      const baseInterval = this.isShieldActive ? 0.14 : 0.24;
      const fireInterval = baseInterval - this.upgrades.laserFireRate * 0.022;
      if (this.laserFireTimer >= fireInterval) {
        this.laserFireTimer = 0;
        this.fireLaser();
      }
    }

    // Gravity Vortex (Fist) particle generator
    if (this.detectedGesture === 'fist') {
      if (Math.random() < 0.35) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 80 + Math.random() * 120;
        const px = this.playerX + Math.cos(angle) * dist;
        const py = this.playerY + Math.sin(angle) * dist;
        this.particles.spawnExplosion(px, py, '#bf55ec', 1, 1);
      }
    }

    // Update Lasers (Fixing the moving lasers bug!)
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const laser = this.lasers[i];
      laser.y += laser.vy * physicsDt;
      if (laser.y < -20) {
        this.lasers.splice(i, 1);
      }
    }

    // 5. Active Power-ups Tickers
    // Magnet Field timer
    if (this.magnetTimer > 0) {
      this.magnetTimer -= dt;
      if (this.magnetTimer <= 0) {
        this.activePowerUps = this.activePowerUps.filter(p => p !== 'Magnet');
      }
    }

    // Hyper Core timer
    if (this.hyperCoreTimer > 0) {
      this.hyperCoreTimer -= dt;
      if (this.hyperCoreTimer <= 0) {
        this.activePowerUps = this.activePowerUps.filter(p => p !== 'Hyper Core');
      }
    }

    // Chain Lightning trigger
    if (this.activePowerUps.includes('Lightning')) {
      this.lightningTimer += dt;
      if (this.lightningTimer >= 1.6) {
        this.lightningTimer = 0;
        this.triggerChainLightning();
      }
    }

    // 6. Scrolling Grid Floor offset
    const gridSpeed = 160 * this.slowMoScale * speedMult;
    this.gridOffset = (this.gridOffset + gridSpeed * dt) % 60;

    // 7. Live Events Scheduling
    this.liveEventTimer += dt;
    if (this.activeLiveEvent === 'none' && this.liveEventTimer >= 40) {
      this.triggerLiveEvent();
    } else if (this.activeLiveEvent !== 'none') {
      this.liveEventDuration -= dt;
      if (this.liveEventDuration <= 0) {
        this.activeLiveEvent = 'none';
        this.liveEventTimer = 0;
      }
    }

    // 8. Spawn & Update Collectibles (shards spawn constantly!)
    const targetPickups = this.activeLiveEvent === 'crystal_storm' ? 22 : 12;
    while (this.pickups.length < targetPickups) {
      this.spawnPickup();
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];
      pickup.phase += physicsDt;

      // Magnet attraction physics
      // Upgrade increases default magnet range: Level 0 = 150px, Level 5 = 300px
      const upgradeRange = 150 + this.upgrades.magnetRadius * 30;
      // Gravity Vortex (fist) pulls ALL crystals from up to 450px!
      const isFistActive = this.detectedGesture === 'fist';
      const magnetRange = isFistActive ? 450 : (this.activePowerUps.includes('Magnet') ? 350 : upgradeRange);

      const dx = this.playerX - pickup.x;
      const dy = this.playerY - pickup.y;
      const dist = Math.hypot(dx, dy);

      if (dist < magnetRange || this.vacuumActive || pickup.magnetized) {
        pickup.magnetized = true;
        // Gravity Vortex pulls crystals even faster (0.28 vs 0.18 easing)
        const pullSpeed = isFistActive ? 0.28 : 0.18;
        pickup.x += (this.playerX - pickup.x) * pullSpeed;
        pickup.y += (this.playerY - pickup.y) * pullSpeed;
      } else {
        pickup.y += pickup.vy * physicsDt;
      }

      // Cleanup
      if (pickup.y > height + 40 || pickup.x < -40 || pickup.x > width + 40) {
        this.pickups.splice(i, 1);
        continue;
      }

      // Collection Check
      if (this.isHandTracked && dist < this.playerSize + pickup.size + 15) {
        this.collectPickup(pickup);
        this.pickups.splice(i, 1);
      }
    }

    if (this.vacuumActive) {
      this.vacuumActive = false; // vacuum is instantaneous arpeggio sweep
    }

    // 9. Update Starfield
    for (const star of this.stars) {
      star.z -= dt * 0.3 * this.slowMoScale;
      if (star.z <= 0) {
        star.z = 2.0;
        star.x = (Math.random() - 0.5) * 2;
        star.y = (Math.random() - 0.5) * 2;
      }
    }

    // 10. Update Particles
    this.particles.update(physicsDt);

    // 11. Spawn & Update Enemies
    this.enemySpawnTimer += physicsDt;
    let spawnRate = Math.max(0.6, 2.2 - (this.waveNumber - 1) * 0.15);
    if (this.activeLiveEvent === 'enemy_rush') spawnRate *= 0.35; // Spawn 3x faster!
    if (this.activeLiveEvent === 'crystal_storm') spawnRate *= 2.5;  // Spawn slower

    if (this.enemySpawnTimer >= spawnRate && !this.isSandbox) {
      this.enemySpawnTimer = 0;
      this.spawnEnemyWave();
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      
      // Gravity Vortex (fist) slow-down check
      const distToPlayerForVortex = Math.hypot(enemy.x - this.playerX, enemy.y - this.playerY);
      const isSlowed = this.detectedGesture === 'fist' && distToPlayerForVortex < 300;
      const enemyDt = isSlowed ? physicsDt * 0.4 : physicsDt; // slow down by 60% if inside Gravity Vortex

      enemy.phase += enemyDt;

      // Boss special firing timer
      if (enemy.isBoss && enemy.bulletTimer !== undefined) {
        enemy.bulletTimer -= enemyDt;
        if (enemy.bulletTimer <= 0) {
          enemy.bulletTimer = 1.2;
          this.fireBossProjectiles(enemy);
        }
      }

      // AI movement logic by type
      if (enemy.type === 'scout') {
        enemy.y += enemy.vy * enemyDt * speedMult;
        enemy.x += Math.sin(enemy.phase * 5.0) * 120 * enemyDt;
      } else if (enemy.type === 'hunter') {
        const dx = this.playerX - enemy.x;
        const dy = this.playerY - enemy.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 5) {
          const steerX = (dx / dist) * 140 - enemy.vx;
          const steerY = (dy / dist) * 140 - enemy.vy;
          enemy.vx += steerX * enemyDt * 2.0;
          enemy.vy += steerY * enemyDt * 2.0;
        }
        enemy.x += enemy.vx * enemyDt;
        enemy.y += enemy.vy * enemyDt;
      } else if (enemy.type === 'mine') {
        // Drifts down and parks at target depth
        if (enemy.y < height * 0.4 && !enemy.mineExploded) {
          enemy.y += enemy.vy * enemyDt;
        } else {
          enemy.vx = 0;
          enemy.vy = 0;
          // Explode if player is close
          const distToPlayer = Math.hypot(enemy.x - this.playerX, enemy.y - this.playerY);
          if (distToPlayer < 90 && !enemy.mineExploded) {
            this.detonateMine(enemy);
          }
        }
      } else if (enemy.type === 'swarm') {
        // Small, fast horizontal drift
        enemy.x += enemy.vx * enemyDt * speedMult;
        enemy.y += enemy.vy * enemyDt * speedMult;
      } else if (enemy.type === 'elite') {
        if (enemy.y < height * 0.25) {
          enemy.y += enemy.vy * enemyDt;
        } else {
          enemy.vx = 0;
          enemy.vy = 0;
          if (enemy.beamChargeTimer !== undefined) {
            enemy.beamChargeTimer -= enemyDt;
            if (enemy.beamChargeTimer <= 0) {
              if (!enemy.isFiringBeam) {
                enemy.isFiringBeam = true;
                enemy.beamChargeTimer = 1.8;
                this.triggerScreenShake(0.4, 6);
                soundSynth.playHit();
              } else {
                enemy.isFiringBeam = false;
                enemy.beamChargeTimer = 3.0;
              }
            }
          }
        }
      } else if (enemy.type === 'boss') {
        // Slow sway at top screen
        enemy.x = width / 2 + Math.sin(enemy.phase * 0.6) * (width * 0.25);
        if (enemy.y < height * 0.2) {
          enemy.y += enemy.vy * enemyDt;
        }
        if (enemy.orbitalAngle !== undefined) {
          enemy.orbitalAngle += enemyDt * 0.8;
        }
      }

      // Trail
      if (this.settings.graphics.quality !== 'low' && !enemy.isBoss) {
        enemy.trail.push({ x: enemy.x, y: enemy.y });
        if (enemy.trail.length > 8) enemy.trail.shift();
      }

      // Cleanup offscreen
      if (enemy.y > height + 60 || enemy.x < -60 || enemy.x > width + 60) {
        this.enemies.splice(i, 1);
        continue;
      }

      // Collision checks with Player
      if (!this.isHandTracked) continue;

      // Cyber Sabers collision check
      if (this.detectedGesture === 'peace' && this.shieldEnergy > 0) {
        const saberLength = 95;
        const angles = [this.cyberSaberAngle, this.cyberSaberAngle + Math.PI];
        let hitSaber = false;
        let hitX = 0, hitY = 0;

        for (const angle of angles) {
          const vx = Math.cos(angle) * saberLength;
          const vy = Math.sin(angle) * saberLength;
          const ux = enemy.x - this.playerX;
          const uy = enemy.y - this.playerY;

          // Projection factor clamped to [0, 1]
          const dot = ux * vx + uy * vy;
          const lenSq = saberLength * saberLength;
          const t = Math.max(0, Math.min(1, dot / lenSq));

          const cx = this.playerX + t * vx;
          const cy = this.playerY + t * vy;
          const distToSaber = Math.hypot(enemy.x - cx, enemy.y - cy);

          if (distToSaber < enemy.size + 8) { // 8 is saber thickness
            hitSaber = true;
            hitX = cx;
            hitY = cy;
            break;
          }
        }

        if (hitSaber) {
          this.damageEnemy(enemy, 24 * dt); // continuous saber damage (24 DPS)
          this.particles.spawnExplosion(hitX, hitY, '#ffaa00', 2, 1.5);
          
          if (enemy.hp <= 0) {
            this.destroyEnemy(enemy);
            this.enemies.splice(i, 1);
            continue;
          }
        }
      }

      const distToPlayer = Math.hypot(enemy.x - this.playerX, enemy.y - this.playerY);
      const shieldRadius = this.playerSize + 22;

      // Beam damage
      if (enemy.type === 'elite' && enemy.isFiringBeam) {
        const beamLeft = enemy.x - 30;
        const beamRight = enemy.x + 30;
        if (this.playerX > beamLeft && this.playerX < beamRight && this.playerY > enemy.y) {
          if (this.isShieldActive) {
            // Shield efficiency scales down energy absorption
            const loss = 25 - this.upgrades.shieldEfficiency * 2.5;
            this.shieldEnergy = Math.max(0, this.shieldEnergy - dt * loss);
            this.particles.spawnExplosion(this.playerX, this.playerY, '#00ffff', 3, 4);
          } else {
            this.damagePlayer(15 * dt);
          }
        }
      }

      if (this.isShieldActive && distToPlayer < shieldRadius + enemy.size) {
        // Shield Deflection!
        this.damageEnemy(enemy, 1.5);
        const loss = 8 - this.upgrades.shieldEfficiency * 0.8;
        this.shieldEnergy = Math.max(0, this.shieldEnergy - loss);
        this.particles.spawnShockwave(enemy.x, enemy.y, '#00ffff');
        this.particles.spawnExplosion(enemy.x, enemy.y, '#00ffff', 8, 4);
        this.deflectionsCount++;
        this.triggerScreenShake(0.1, 2);

        if (enemy.hp <= 0) {
          this.destroyEnemy(enemy);
          this.enemies.splice(i, 1);
          continue;
        }
      } else if (distToPlayer < this.playerSize + enemy.size) {
        // Crash hit
        this.damagePlayer(enemy.isBoss ? 40 : enemy.type === 'mine' ? 30 : 25);
        this.particles.spawnExplosion(enemy.x, enemy.y, '#ff0055', 20, 6);
        this.triggerScreenShake(0.3, 10);
        this.enemies.splice(i, 1);
        continue;
      }

      // Lasers Collision check
      for (let j = this.lasers.length - 1; j >= 0; j--) {
        const laser = this.lasers[j];
        const distToLaser = Math.hypot(enemy.x - laser.x, enemy.y - laser.y);
        if (distToLaser < enemy.size + laser.size) {
          this.damageEnemy(enemy, 1);
          this.lasers.splice(j, 1);
          this.particles.spawnExplosion(laser.x, laser.y, laser.color, 5, 2);

          if (enemy.hp <= 0) {
            this.destroyEnemy(enemy);
            this.enemies.splice(i, 1);
            break;
          }
        }
      }
    }

    // 12. Update Boss Bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Clean offscreen
      if (b.y > height + 20 || b.y < -20 || b.x < -20 || b.x > width + 20) {
        this.bullets.splice(i, 1);
        continue;
      }

      if (!this.isHandTracked) continue;

      // Cyber Sabers bullet vaporize
      if (this.detectedGesture === 'peace' && this.shieldEnergy > 0) {
        const saberLength = 95;
        const angles = [this.cyberSaberAngle, this.cyberSaberAngle + Math.PI];
        let hitSaber = false;

        for (const angle of angles) {
          const vx = Math.cos(angle) * saberLength;
          const vy = Math.sin(angle) * saberLength;
          const ux = b.x - this.playerX;
          const uy = b.y - this.playerY;

          const dot = ux * vx + uy * vy;
          const lenSq = saberLength * saberLength;
          const t = Math.max(0, Math.min(1, dot / lenSq));

          const cx = this.playerX + t * vx;
          const cy = this.playerY + t * vy;
          const distToSaber = Math.hypot(b.x - cx, b.y - cy);

          if (distToSaber < b.size + 8) {
            hitSaber = true;
            break;
          }
        }

        if (hitSaber) {
          this.bullets.splice(i, 1);
          this.particles.spawnExplosion(b.x, b.y, '#ffaa00', 3, 1.5);
          this.deflectionsCount++;
          continue;
        }
      }

      const dist = Math.hypot(b.x - this.playerX, b.y - this.playerY);
      const shieldRadius = this.playerSize + 22;

      if (this.isShieldActive && dist < shieldRadius + b.size) {
        // Deflect bullet!
        this.bullets.splice(i, 1);
        this.particles.spawnExplosion(b.x, b.y, '#00ffff', 4, 2);
        this.deflectionsCount++;
      } else if (dist < this.playerSize + b.size) {
        // Hit player
        this.bullets.splice(i, 1);
        this.damagePlayer(12);
        this.particles.spawnExplosion(b.x, b.y, '#ff0055', 8, 3);
      }
    }

    // Update Leaderboard score
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('neon_pulse_high_score', this.score.toString());
    }

    this.sendStateUpdate();
  }

  private fireLaser() {
    soundSynth.playClick();
    this.lasers.push({
      x: this.playerX,
      y: this.playerY - 20,
      vy: -600,
      size: 3,
      color: '#00ffff'
    });
  }

  private spawnPickup(startingY = -40) {
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const roll = Math.random();

    let type: PickupType = 'crystal_common';
    let color = '#00ffff'; // Neon Cyan
    let size = 9;

    if (this.activeLiveEvent === 'golden_frenzy') {
      // Golden frenzy force spawns epic and multipliers!
      if (roll < 0.6) {
        type = 'crystal_epic';
        color = '#ffff00'; // Gold
        size = 12;
      } else {
        type = 'multiplier_orb';
        color = '#ff00ff'; // Neon Magenta multiplier
        size = 11;
      }
    } else {
      if (roll < 0.05) {
        type = 'hyper_core';
        color = '#ff3300'; // Red frenzy
        size = 13;
      } else if (roll < 0.12) {
        type = 'magnet_orb';
        color = '#00ffcc'; // Turquoise magnet
        size = 11;
      } else if (roll < 0.18) {
        type = 'shield_gen';
        color = '#39ff14'; // Green dome
        size = 11;
      } else if (roll < 0.25) {
        type = 'time_warp';
        color = '#b026ff'; // Purple slowmo
        size = 12;
      } else if (roll < 0.35) {
        type = 'xp_core';
        color = '#ff0055'; // Pink XP
        size = 10;
      } else if (roll < 0.42) {
        type = 'multiplier_orb';
        color = '#ff00ff'; // Magenta
        size = 11;
      } else if (roll < 0.55) {
        type = 'crystal_epic';
        color = '#ffff00'; // Gold
        size = 12;
      } else if (roll < 0.72) {
        type = 'crystal_rare';
        color = '#ff7700'; // Rare orange
        size = 10;
      }
    }

    this.pickups.push({
      id: this.pickupIdCounter++,
      x: Math.random() * (width - 80) + 40,
      y: startingY,
      vy: 80 + Math.random() * 40,
      type,
      size,
      color,
      phase: Math.random() * Math.PI
    });
  }

  private collectPickup(pickup: Pickup) {
    // Spark and arpeggio notes synthesis plucking
    this.particles.spawnExplosion(pickup.x, pickup.y, pickup.color, 12, 4);
    this.particles.spawnShockwave(pickup.x, pickup.y, pickup.color);
    soundSynth.playShardCollect(pickup.type);

    let scoreReward = 10;
    let xpReward = 10;

    // Apply hyper core double score frenzy mod
    const scoreMultiplier = this.activePowerUps.includes('Hyper Core') ? 2 : 1;

    switch (pickup.type) {
      case 'crystal_common':
        scoreReward = 10;
        xpReward = 8;
        break;
      case 'crystal_rare':
        scoreReward = 50;
        xpReward = 15;
        break;
      case 'crystal_epic':
        scoreReward = 100;
        xpReward = 25;
        break;
      case 'multiplier_orb':
        this.comboCount += 2;
        this.comboMultiplier = 1 + Math.floor(this.comboCount / 5);
        this.particles.spawnFloatText(pickup.x, pickup.y, 'COMBO BOOST', pickup.color);
        break;
      case 'xp_core':
        xpReward = 55;
        break;
      case 'time_warp':
        this.slowMoTimer = 5.0;
        this.slowMoScale = 0.35;
        soundSynth.playSlowMoStart();
        this.particles.spawnFloatText(pickup.x, pickup.y, 'TIME WARP', pickup.color);
        break;
      case 'shield_gen':
        this.shieldEnergy = 100;
        this.particles.spawnFloatText(pickup.x, pickup.y, 'SHIELD MAX', pickup.color);
        break;
      case 'magnet_orb':
        this.magnetTimer = 8.0;
        if (!this.activePowerUps.includes('Magnet')) {
          this.activePowerUps.push('Magnet');
        }
        this.particles.spawnFloatText(pickup.x, pickup.y, 'MAGNET ACTIVE', pickup.color);
        break;
      case 'hyper_core':
        this.hyperCoreTimer = 6.0;
        if (!this.activePowerUps.includes('Hyper Core')) {
          this.activePowerUps.push('Hyper Core');
        }
        this.vacuumActive = true; // pull all active crystals instantly
        this.particles.spawnFloatText(pickup.x, pickup.y, 'SCORE FRENZY', pickup.color);
        break;
    }

    this.score += scoreReward * this.comboMultiplier * scoreMultiplier;
    this.creditsEarned += Math.floor(scoreReward / 10);
    this.addXp(xpReward);

    // Increment combos arpeggio plucks
    if (pickup.type.includes('crystal')) {
      this.comboCount++;
      this.comboMultiplier = 1 + Math.floor(this.comboCount / 5);
      
      // Plucking arpeggiator visual notifications on milestone combos
      if (this.comboCount === 5 || this.comboCount === 10 || this.comboCount === 20 || this.comboCount === 50) {
        soundSynth.playAchievement();
        this.particles.spawnFloatText(this.playerX, this.playerY - 40, `COMBO STREAK x${this.comboMultiplier}!`, '#ff00ff');
        this.triggerScreenShake(0.15, 4);
      }
    }

    if (scoreReward > 0) {
      this.particles.spawnFloatText(
        pickup.x,
        pickup.y,
        `+${scoreReward * this.comboMultiplier * scoreMultiplier}`,
        pickup.color
      );
    }
  }

  private triggerChainLightning() {
    soundSynth.playLightning();
    let zaps = 0;
    const maxZaps = 4;
    const range = 280;

    for (const enemy of this.enemies) {
      if (zaps >= maxZaps) break;
      const dist = Math.hypot(enemy.x - this.playerX, enemy.y - this.playerY);
      if (dist < range) {
        zaps++;
        this.damageEnemy(enemy, 3); // deal heavy chain damage
        
        // Spawn lightning vectors on canvas
        this.particles.spawnShockwave(enemy.x, enemy.y, '#ff00ff');
        this.particles.spawnExplosion(enemy.x, enemy.y, '#ff00ff', 12, 3);
        
        if (enemy.hp <= 0) {
          this.destroyEnemy(enemy);
          this.enemies = this.enemies.filter(e => e.id !== enemy.id);
        }
      }
    }
    if (zaps > 0) {
      this.particles.spawnFloatText(this.playerX, this.playerY - 30, 'ZAP!', '#ff00ff');
    }
  }

  private triggerNovaBlast() {
    this.novaBlastCooldown = this.novaBlastCooldownMax;
    this.triggerScreenShake(0.35, 10);

    // Play resonance shockwave sound
    soundSynth.playLightning();

    // Spawn visual expanding ring and particle spray
    this.particles.spawnShockwave(this.playerX, this.playerY, '#00ffff');
    this.particles.spawnExplosion(this.playerX, this.playerY, '#ffffff', 25, 6);
    this.particles.spawnFloatText(this.playerX, this.playerY - 45, 'NOVA BLAST!', '#00ffff');

    const blastRadius = 250;
    
    // Damage and push enemies in radius
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      const dist = Math.hypot(enemy.x - this.playerX, enemy.y - this.playerY);
      if (dist < blastRadius) {
        this.damageEnemy(enemy, 3); // Deal massive blast damage
        
        // Push enemy back
        const angle = Math.atan2(enemy.y - this.playerY, enemy.x - this.playerX);
        const pushForce = 220;
        enemy.vx = Math.cos(angle) * pushForce;
        enemy.vy = Math.sin(angle) * pushForce;

        if (enemy.hp <= 0) {
          this.destroyEnemy(enemy);
          this.enemies.splice(i, 1);
        }
      }
    }

    // Vaporize spiky bullets
    this.bullets = this.bullets.filter(b => {
      const dist = Math.hypot(b.x - this.playerX, b.y - this.playerY);
      if (dist < blastRadius) {
        this.particles.spawnExplosion(b.x, b.y, '#00ffff', 3, 1.5);
        this.deflectionsCount++;
        return false;
      }
      return true;
    });
  }

  private triggerLiveEvent() {
    const events: LiveEvent[] = ['crystal_storm', 'enemy_rush', 'golden_frenzy', 'system_hack'];
    this.activeLiveEvent = events[Math.floor(Math.random() * events.length)];
    this.liveEventDuration = 12.0; // events last 12s
    this.liveEventTimer = 0;

    if (this.activeLiveEvent === 'system_hack') {
      soundSynth.playGlitch();
      this.triggerScreenShake(0.5, 12);
      this.particles.spawnFloatText(this.playerX, this.playerY - 50, 'WARNING: SYSTEM HACKED!', '#ff0055');
    } else {
      soundSynth.playBossWarning(); // play alarm arpeggiator
      this.particles.spawnFloatText(this.playerX, this.playerY - 50, `${this.activeLiveEvent.toUpperCase()} START!`, '#00ffff');
    }
  }

  private spawnEnemyWave() {
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    
    // Check if Boss is needed
    // Spawns Boss when level % 3 === 0 and no Boss is currently alive
    const hasBoss = this.enemies.some(e => e.isBoss);
    if (this.level >= 3 && this.level % 3 === 0 && !hasBoss) {
      this.spawnBoss();
      return;
    }

    const roll = Math.random();
    let type: EnemyType = 'scout';
    let size = 12;
    let color = '#ffff00'; // Scouts: Yellow
    let hp = 1;

    if (roll < 0.12 && this.waveNumber >= 3) {
      type = 'elite';
      size = 22;
      color = '#00ffff'; // Elites: Cyan
      hp = 6;
    } else if (roll < 0.28 && this.waveNumber >= 2) {
      type = 'hunter';
      size = 13;
      color = '#ff00ff'; // Hunters: Pink
      hp = 2;
    } else if (roll < 0.44 && this.waveNumber >= 2) {
      type = 'mine';
      size = 16;
      color = '#ff3300'; // Mines: Orange-Red
      hp = 3;
    } else if (roll < 0.60) {
      // Swarm: spawn 6 small group units flying downwards
      this.spawnSwarmGroup();
      return;
    }

    this.enemies.push({
      id: this.enemyIdCounter++,
      x: Math.random() * (width - 80) + 40,
      y: -40,
      vx: type === 'hunter' ? 0 : (Math.random() - 0.5) * 50,
      vy: type === 'mine' ? 55 : type === 'elite' ? 50 : 90 + Math.random() * 50,
      type,
      size,
      color,
      hp,
      maxHp: hp,
      trail: [],
      phase: Math.random() * Math.PI,
      beamChargeTimer: type === 'elite' ? 3.0 : undefined,
      isFiringBeam: false
    });
  }

  private spawnSwarmGroup() {
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const startX = Math.random() * (width - 150) + 50;
    
    // Spawn 6 small scouts flying in close formation V-shape
    const swarmOffsets = [
      { dx: 0, dy: 0 },
      { dx: -20, dy: -20 },
      { dx: 20, dy: -20 },
      { dx: -40, dy: -40 },
      { dx: 40, dy: -40 },
      { dx: 0, dy: -40 }
    ];

    for (const offset of swarmOffsets) {
      this.enemies.push({
        id: this.enemyIdCounter++,
        x: startX + offset.dx,
        y: -40 + offset.dy,
        vx: 0,
        vy: 140, // swarms fly faster
        type: 'swarm',
        size: 9,
        color: '#ff7700', // Swarm orange-red
        hp: 1,
        maxHp: 1,
        trail: [],
        phase: Math.random() * Math.PI
      });
    }
  }

  private spawnBoss() {
    soundSynth.playBossWarning();
    this.triggerScreenShake(0.5, 15);
    const width = this.canvas.width / (window.devicePixelRatio || 1);

    this.enemies.push({
      id: this.enemyIdCounter++,
      x: width / 2,
      y: -80,
      vx: 0,
      vy: 35,
      type: 'boss',
      size: 48,
      color: '#ff0055', // Boss neon pink core
      hp: 60 + this.waveNumber * 15,
      maxHp: 60 + this.waveNumber * 15,
      trail: [],
      phase: 0,
      isBoss: true,
      orbitalAngle: 0,
      bulletTimer: 1.5
    });

    this.particles.spawnFloatText(width / 2, 80, 'BOSS FIREWALL DETECTED', '#ff0055');
  }

  private fireBossProjectiles(boss: Enemy) {
    soundSynth.playClick();
    const steps = 8;
    const startAngle = boss.orbitalAngle || 0;

    for (let i = 0; i < steps; i++) {
      const angle = startAngle + (i / steps) * Math.PI * 2;
      this.bullets.push({
        x: boss.x,
        y: boss.y,
        vx: Math.cos(angle) * 160,
        vy: Math.sin(angle) * 160,
        size: 4,
        color: '#ff0055' // Boss projectiles
      });
    }
  }

  private detonateMine(mine: Enemy) {
    mine.mineExploded = true;
    soundSynth.playHit();
    this.particles.spawnExplosion(mine.x, mine.y, '#ff3300', 16, 5);
    this.particles.spawnShockwave(mine.x, mine.y, '#ff3300');

    // Spawn 8 directional bullet shards outwards
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      this.bullets.push({
        x: mine.x,
        y: mine.y,
        vx: Math.cos(angle) * 220,
        vy: Math.sin(angle) * 220,
        size: 3.5,
        color: '#ff3300'
      });
    }
    // Delete mine immediately
    this.enemies = this.enemies.filter(e => e.id !== mine.id);
  }

  private damageEnemy(enemy: Enemy, amt: number) {
    enemy.hp = Math.max(0, enemy.hp - amt);
  }

  private destroyEnemy(enemy: Enemy) {
    soundSynth.playHit();
    this.triggerScreenShake(0.12, 3);
    this.hitStopTimer = 0.045; // 45ms hit stop freeze

    this.particles.spawnExplosion(enemy.x, enemy.y, enemy.color, 15, 6);
    this.particles.spawnShockwave(enemy.x, enemy.y, enemy.color);

    let xpReward = 10;
    let scoreReward = 100;

    if (enemy.type === 'hunter') {
      xpReward = 20;
      scoreReward = 250;
    } else if (enemy.type === 'mine') {
      xpReward = 20;
      scoreReward = 200;
    } else if (enemy.type === 'swarm') {
      xpReward = 8;
      scoreReward = 75;
    } else if (enemy.type === 'elite') {
      xpReward = 90;
      scoreReward = 1000;
      this.slowMoTimer = 3.0;
      this.slowMoScale = 0.4;
      soundSynth.playSlowMoStart();
    } else if (enemy.type === 'boss') {
      xpReward = 350;
      scoreReward = 5000;
      this.creditsEarned += 150; // boss credit bonus!
      this.slowMoTimer = 4.0;
      this.slowMoScale = 0.35;
      soundSynth.playSlowMoStart();
      this.activePowerUps.push('Lightning'); // unlock lighting mod upon boss kill!
      this.particles.spawnFloatText(enemy.x, enemy.y, 'UNLOCKED: CHAIN LIGHTNING', '#ff00ff');
    }

    this.score += scoreReward * this.comboMultiplier;
    this.creditsEarned += Math.floor(scoreReward / 10);
    this.addXp(xpReward);

    this.comboCount++;
    this.comboMultiplier = 1 + Math.floor(this.comboCount / 5);

    this.particles.spawnFloatText(
      enemy.x,
      enemy.y,
      `+${scoreReward * this.comboMultiplier} XP+${xpReward}`,
      enemy.color
    );
  }

  private damagePlayer(amt: number) {
    // If shield active, direct damage is deflected
    if (this.isShieldActive) return;

    soundSynth.playHit();
    this.health = Math.max(0, this.health - amt);
    this.comboCount = 0;
    this.comboMultiplier = 1;

    this.triggerScreenShake(0.3, 10);
    this.hitStopTimer = 0.08; // heavier freeze for player hits

    if (this.health <= 0) {
      this.gameOver();
    }
  }

  private addXp(amt: number) {
    this.xp += amt;
    if (this.xp >= this.nextLevelXp) {
      this.xp -= this.nextLevelXp;
      
      if (this.isSandbox) {
        this.level++;
        this.nextLevelXp = this.level * 150;
        soundSynth.playLevelUp();
        this.particles.spawnFloatText(this.playerX, this.playerY - 40, `LEVEL UP ${this.level}!`, '#00ffff');
        this.particles.spawnShockwave(this.playerX, this.playerY, '#00ffff');
      } else {
        // Trigger Level Up Ready freeze for player review
        this.isLevelUpPending = true;
        this.levelUpProgress = 0;
        soundSynth.playLevelUp();
        this.particles.spawnFloatText(this.playerX, this.playerY - 40, `LEVEL UP READY!`, '#ffff00');
        this.particles.spawnShockwave(this.playerX, this.playerY, '#ffff00');
      }
    }
  }

  private proceedToNextLevel() {
    this.isLevelUpPending = false;
    this.level++;
    this.nextLevelXp = this.level * 150;
    
    // Level up health restore (+30 integrity)
    this.health = Math.min(100 + this.upgrades.maxIntegrity * 20, this.health + 30);
    this.particles.spawnFloatText(this.playerX, this.playerY - 40, `LEVEL UP ${this.level}!`, '#00ffff');
    this.particles.spawnShockwave(this.playerX, this.playerY, '#00ffff');
    soundSynth.playAchievement();
  }

  private updateQuitGesture(dt: number) {
    if (this.detectedGesture === 'rock') {
      this.quitProgress += dt;
      if (this.quitProgress >= 2.0) { // hold horns for 2s to self-destruct/quit
        this.quitProgress = 0;
        this.gameOver();
      }
    } else {
      this.quitProgress = Math.max(0, this.quitProgress - dt * 2.0);
    }
  }

  private drawLevelUpOverlay(width: number, height: number) {
    this.ctx.save();
    
    // Dim background grid slightly
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    this.ctx.fillRect(0, 0, width, height);

    // Centered glassmorphic card bounds
    const cardW = 380;
    const cardH = 170;
    const cardX = (width - cardW) / 2;
    const cardY = (height - cardH) / 2;

    // Draw card border
    this.ctx.strokeStyle = 'rgba(255, 234, 0, 0.45)'; // Neon Yellow
    this.ctx.lineWidth = 2.0;
    this.ctx.shadowBlur = 15;
    this.ctx.shadowColor = '#ffea00';
    this.ctx.fillStyle = 'rgba(10, 10, 15, 0.85)';
    
    this.ctx.beginPath();
    this.ctx.rect(cardX, cardY, cardW, cardH);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.shadowBlur = 0;

    // Draw header text
    this.ctx.fillStyle = '#ffea00';
    this.ctx.font = "bold 18px 'Space Grotesk', sans-serif";
    this.ctx.textAlign = 'center';
    this.ctx.fillText("CORE UPGRADE READY", width / 2, cardY + 35);

    // Draw details text
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    this.ctx.font = "12px 'Space Grotesk', sans-serif";
    this.ctx.fillText(`Proceed to Level ${this.level + 1} with +30 Integrity!`, width / 2, cardY + 62);

    const isDetecting = this.detectedGesture === 'thumbs_up';
    const isPinching = this.isShieldActive;
    
    let instructionText = this.controlMode === 'touch' 
      ? "HOLD SHIELD 🤏 TO UPGRADE" 
      : "SHOW THUMBS UP 👍 (OR HOLD SHIELD 🤏) TO UPGRADE";
    let instructionColor = 'rgba(255, 255, 255, 0.45)';
    
    if (isDetecting) {
      instructionText = "👍 THUMBS UP DETECTED! HOLDING...";
      instructionColor = '#ffea00';
    } else if (isPinching) {
      instructionText = this.controlMode === 'touch'
        ? "🤏 SHIELD HELD! HOLDING..."
        : "🤏 OVERRIDE PINCH DETECTED! HOLDING...";
      instructionColor = '#00ffff';
    }

    this.ctx.fillStyle = instructionColor;
    this.ctx.font = "bold 11px 'Space Grotesk', sans-serif";
    this.ctx.fillText(instructionText, width / 2, cardY + 98);

    // Progress bar background
    const barW = 280;
    const barH = 8;
    const barX = (width - barW) / 2;
    const barY = cardY + 115;

    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    this.ctx.fillRect(barX, barY, barW, barH);

    // Fill progress bar
    const progressPercent = Math.min(1.0, this.levelUpProgress / 1.5);
    this.ctx.fillStyle = isPinching ? '#00ffff' : '#ffea00';
    if (this.settings.graphics.quality === 'high') {
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = this.ctx.fillStyle as string;
    }
    this.ctx.fillRect(barX, barY, barW * progressPercent, barH);
    this.ctx.restore();
  }

  private drawQuitOverlay(width: number) {
    this.ctx.save();
    
    // Warning banner at top of canvas
    const bannerH = 50;
    const bannerY = 120;
    
    this.ctx.fillStyle = 'rgba(255, 0, 85, 0.18)';
    this.ctx.fillRect(0, bannerY, width, bannerH);
    
    this.ctx.strokeStyle = 'rgba(255, 0, 85, 0.5)';
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.moveTo(0, bannerY);
    this.ctx.lineTo(width, bannerY);
    this.ctx.moveTo(0, bannerY + bannerH);
    this.ctx.lineTo(width, bannerY + bannerH);
    this.ctx.stroke();

    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = '#ff0055';
    this.ctx.fillStyle = '#ff0055';
    this.ctx.font = "bold 13px 'Space Grotesk', sans-serif";
    this.ctx.textAlign = 'center';
    this.ctx.fillText("🤘 EXIT SEQUENCE INITIALIZED", width / 2, bannerY + 22);

    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    this.ctx.font = "9px 'Space Grotesk', sans-serif";
    this.ctx.fillText(`Hold Horns gesture for ${(2.0 - this.quitProgress).toFixed(1)}s to self-destruct`, width / 2, bannerY + 38);

    const fillPercent = Math.min(1.0, this.quitProgress / 2.0);
    this.ctx.fillStyle = '#ff0055';
    this.ctx.fillRect(0, bannerY + bannerH - 2, width * fillPercent, 2);

    this.ctx.restore();
  }

  private gameOver() {
    this.isGameOver = true;
    soundSynth.playGameOver();
    this.callbacks.onGameOver(this.score);
    this.sendStateUpdate();
  }

  private sendStateUpdate() {
    this.callbacks.onStateUpdate({
      score: this.score,
      highScore: this.highScore,
      health: Math.round(this.health),
      shieldEnergy: Math.round(this.shieldEnergy),
      comboCount: this.comboCount,
      comboMultiplier: this.comboMultiplier,
      xp: this.xp,
      level: this.level,
      nextLevelXp: this.nextLevelXp,
      isGameOver: this.isGameOver,
      isPlaying: this.isPlaying,
      fps: this.fps,
      trackingConfidence: this.trackingConfidence,
      isHandTracked: this.isHandTracked,
      isShieldActive: this.isShieldActive,
      slowMoActive: this.slowMoTimer > 0,
      enemiesDestroyed: this.enemies.filter(e => e.hp <= 0).length, // placeholder/metric count mapped
      deflections: this.deflectionsCount,
      // Custom Redesign fields
      timeSurvived: Math.floor(this.timeSurvived),
      waveNumber: this.waveNumber,
      activeLiveEvent: this.activeLiveEvent,
      activePowerUps: this.activePowerUps,
      creditsEarned: this.creditsEarned,
      detectedGesture: this.detectedGesture,
      novaBlastCooldown: this.novaBlastCooldown
    });
  }

  private draw() {
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);

    this.ctx.save();

    // 1. Hit Screen Shake
    if (this.screenShakeDuration > 0) {
      const dx = (Math.random() - 0.5) * this.screenShakeIntensity;
      const dy = (Math.random() - 0.5) * this.screenShakeIntensity;
      this.ctx.translate(dx, dy);
      this.screenShakeDuration -= 0.016;
    }

    // 2. Draw Space Sky & dynamic stars
    // Event System Hack: Inverts color background mapping!
    if (this.activeLiveEvent === 'system_hack') {
      this.ctx.fillStyle = '#0a0d05';
    } else {
      this.ctx.fillStyle = '#05030b';
    }
    this.ctx.fillRect(0, 0, width, height);

    // Synthwave horizon gradient
    const horizonY = height * this.perspectiveY;
    const skyGrad = this.ctx.createLinearGradient(0, 0, 0, horizonY);
    if (this.activeLiveEvent === 'system_hack') {
      skyGrad.addColorStop(0, '#090a02');
      skyGrad.addColorStop(0.6, '#202407');
      skyGrad.addColorStop(1.0, '#363d09');
    } else {
      skyGrad.addColorStop(0, '#04020a');
      skyGrad.addColorStop(0.6, '#0f0724');
      skyGrad.addColorStop(1.0, '#360940');
    }
    this.ctx.fillStyle = skyGrad;
    this.ctx.fillRect(0, 0, width, horizonY);

    // Draw stars
    this.ctx.fillStyle = '#ffffff';
    for (const star of this.stars) {
      const sx = ((star.x / star.z) * width * 0.5) + width * 0.5;
      const sy = ((star.y / star.z) * height * 0.3) + horizonY * 0.5;
      
      if (sx >= 0 && sx <= width && sy >= 0 && sy <= horizonY) {
        const speedStretch = (this.comboMultiplier > 2 || this.slowMoTimer > 0) ? 5 : 1;
        const starSize = (1 - star.z / 2) * star.size;
        
        this.ctx.save();
        this.ctx.globalAlpha = 1.0 - star.z / 2;
        if (speedStretch > 1) {
          this.ctx.strokeStyle = '#ffffff';
          this.ctx.lineWidth = starSize;
          this.ctx.beginPath();
          this.ctx.moveTo(sx, sy);
          this.ctx.lineTo(sx, sy + speedStretch * 1.5);
          this.ctx.stroke();
        } else {
          this.ctx.beginPath();
          this.ctx.arc(sx, sy, starSize, 0, Math.PI * 2);
          this.ctx.fill();
        }
        this.ctx.restore();
      }
    }

    // 3. Draw 3D Perspective Grid
    if (this.settings.graphics.quality !== 'low') {
      this.drawPerspectiveFloor(width, height, horizonY);
    }

    // 4. Draw Hand wireframe
    if (this.isHandTracked && this.rawHandLandmarks.length > 0) {
      this.drawHandOverlay(width, height);
    }

    // 5. Draw Lasers
    for (const laser of this.lasers) {
      this.ctx.save();
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = laser.color;
      this.ctx.fillStyle = '#ffffff';
      this.ctx.strokeStyle = laser.color;
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.arc(laser.x, laser.y - 6, laser.size, Math.PI, 0);
      this.ctx.lineTo(laser.x + laser.size, laser.y + 6);
      this.ctx.arc(laser.x, laser.y + 6, laser.size, 0, Math.PI);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 6. Draw Boss Projectiles
    for (const b of this.bullets) {
      this.ctx.save();
      this.ctx.shadowBlur = 6;
      this.ctx.shadowColor = b.color;
      this.ctx.fillStyle = '#ffffff';
      this.ctx.strokeStyle = b.color;
      this.ctx.lineWidth = 1.0;
      this.ctx.beginPath();
      this.ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();
    }

    // 7. Draw Enemies
    for (const enemy of this.enemies) {
      this.drawEnemy(enemy);
    }

    // 8. Draw Pickups
    for (const pickup of this.pickups) {
      this.drawPickup(pickup);
    }

    // 9. Draw Player Trail
    if (this.isHandTracked && this.playerTrail.length > 1) {
      this.ctx.save();
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      const themeColor = this.getThemeColor();
      for (let i = 1; i < this.playerTrail.length; i++) {
        const pt1 = this.playerTrail[i - 1];
        const pt2 = this.playerTrail[i];
        const alpha = (i / this.playerTrail.length) * 0.45;
        this.ctx.strokeStyle = themeColor;
        this.ctx.globalAlpha = alpha;
        this.ctx.lineWidth = 1 + (i / this.playerTrail.length) * 6;
        this.ctx.beginPath();
        this.ctx.moveTo(pt1.x, pt1.y);
        this.ctx.lineTo(pt2.x, pt2.y);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    // 10. Draw Player
    if (this.isHandTracked) {
      this.drawPlayer();
    }

    // 11. Draw Particles
    this.particles.draw(this.ctx);

    // 12. Draw Canvas HUD Overlay (XP bar, Level)
    this.drawCanvasHUD(width, height);

    // Visual Glitch overlay during System Hack event
    if (this.activeLiveEvent === 'system_hack' && Math.random() < 0.14) {
      this.ctx.save();
      this.ctx.fillStyle = `rgba(255, 0, 85, ${0.05 + Math.random() * 0.1})`;
      this.ctx.fillRect(0, 0, width, height);
      
      // Draw horizontal glitch lines
      this.ctx.fillStyle = '#ff0055';
      const gy = Math.random() * height;
      this.ctx.fillRect(0, gy, width, 1 + Math.random() * 3);
      this.ctx.restore();
    }

    if (this.isLevelUpPending) {
      this.drawLevelUpOverlay(width, height);
    }
    if (this.quitProgress > 0) {
      this.drawQuitOverlay(width);
    }
    this.ctx.restore();
  }

  private drawPerspectiveFloor(width: number, height: number, horizonY: number) {
    this.ctx.save();
    
    // Draw neon pink horizon line
    this.ctx.strokeStyle = '#ff0055';
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = '#ff0055';
    this.ctx.lineWidth = 2.0;
    this.ctx.beginPath();
    this.ctx.moveTo(0, horizonY);
    this.ctx.lineTo(width, horizonY);
    this.ctx.stroke();
    
    this.ctx.shadowBlur = 0;
    const themeColor = this.getThemeColor();
    this.ctx.strokeStyle = themeColor === '#00ffff' ? '#1f0d3d' : `${themeColor}22`;
    this.ctx.lineWidth = 1.0;

    // Draw vanishing lines
    const centerX = width / 2;
    const lineCount = 20;
    for (let i = 0; i <= lineCount; i++) {
      const ratio = i / lineCount;
      const targetX = ratio * width;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX, horizonY);
      this.ctx.lineTo(targetX, height);
      this.ctx.stroke();
    }

    // Draw horizontal lines
    const gridSpacing = 35;
    const totalLines = 10;
    for (let i = 0; i < totalLines; i++) {
      const pos = ((i * gridSpacing + this.gridOffset) % (gridSpacing * totalLines));
      const ratio = pos / (gridSpacing * totalLines);
      const ly = horizonY + ratio * (height - horizonY);
      
      this.ctx.strokeStyle = themeColor === '#00ffff' ? '#1f0d3d' : `${themeColor}${Math.floor(ratio * 30).toString(16).padStart(2, '0')}`;
      this.ctx.lineWidth = 0.5 + ratio * 1.5;
      
      this.ctx.beginPath();
      this.ctx.moveTo(0, ly);
      this.ctx.lineTo(width, ly);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  private drawEnemy(enemy: Enemy) {
    if (this.settings.graphics.quality !== 'low' && enemy.trail && enemy.trail.length > 1) {
      this.ctx.save();
      this.ctx.lineWidth = 1.5;
      this.ctx.lineCap = 'round';
      for (let i = 1; i < enemy.trail.length; i++) {
        const pt1 = enemy.trail[i - 1];
        const pt2 = enemy.trail[i];
        const alpha = (i / enemy.trail.length) * 0.25;
        this.ctx.strokeStyle = enemy.color;
        this.ctx.globalAlpha = alpha;
        this.ctx.beginPath();
        this.ctx.moveTo(pt1.x, pt1.y);
        this.ctx.lineTo(pt2.x, pt2.y);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    this.ctx.save();
    if (this.settings.graphics.quality === 'high') {
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = enemy.color;
    }
    this.ctx.strokeStyle = enemy.color;
    this.ctx.lineWidth = 2.0;

    // Vector drawing logic by class type
    if (enemy.type === 'scout') {
      this.ctx.beginPath();
      this.ctx.moveTo(enemy.x, enemy.y + enemy.size);
      this.ctx.lineTo(enemy.x - enemy.size, enemy.y - enemy.size * 0.5);
      this.ctx.lineTo(enemy.x, enemy.y - enemy.size * 0.2);
      this.ctx.lineTo(enemy.x + enemy.size, enemy.y - enemy.size * 0.5);
      this.ctx.closePath();
      this.ctx.stroke();
    } else if (enemy.type === 'hunter') {
      this.ctx.beginPath();
      this.ctx.moveTo(enemy.x, enemy.y - enemy.size);
      this.ctx.lineTo(enemy.x - enemy.size * 0.7, enemy.y);
      this.ctx.lineTo(enemy.x, enemy.y + enemy.size);
      this.ctx.lineTo(enemy.x + enemy.size * 0.7, enemy.y);
      this.ctx.closePath();
      this.ctx.stroke();

      this.ctx.fillStyle = enemy.color;
      this.ctx.beginPath();
      this.ctx.arc(enemy.x, enemy.y, enemy.size * 0.35, 0, Math.PI * 2);
      this.ctx.fill();
    } else if (enemy.type === 'mine') {
      // Octagon Mine Core
      this.ctx.beginPath();
      for (let j = 0; j < 8; j++) {
        const angle = (j / 8) * Math.PI * 2 + enemy.phase * 0.4;
        const px = enemy.x + Math.cos(angle) * enemy.size;
        const py = enemy.y + Math.sin(angle) * enemy.size;
        if (j === 0) this.ctx.moveTo(px, py);
        else this.ctx.lineTo(px, py);
      }
      this.ctx.closePath();
      this.ctx.stroke();

      // Proximity range pulse circle
      this.ctx.save();
      this.ctx.strokeStyle = `${enemy.color}33`;
      this.ctx.lineWidth = 0.5;
      this.ctx.setLineDash([3, 3]);
      this.ctx.beginPath();
      this.ctx.arc(enemy.x, enemy.y, 90 + Math.sin(enemy.phase * 4) * 8, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.restore();
    } else if (enemy.type === 'swarm') {
      // Tiny needle vectors
      this.ctx.beginPath();
      this.ctx.moveTo(enemy.x, enemy.y + enemy.size * 1.2);
      this.ctx.lineTo(enemy.x - enemy.size * 0.5, enemy.y - enemy.size * 0.6);
      this.ctx.lineTo(enemy.x + enemy.size * 0.5, enemy.y - enemy.size * 0.6);
      this.ctx.closePath();
      this.ctx.stroke();
    } else if (enemy.type === 'elite') {
      const sz = enemy.size;
      this.ctx.beginPath();
      this.ctx.moveTo(enemy.x, enemy.y + sz * 0.8);
      this.ctx.lineTo(enemy.x - sz, enemy.y - sz * 0.8);
      this.ctx.lineTo(enemy.x - sz * 0.4, enemy.y - sz * 0.4);
      this.ctx.lineTo(enemy.x + sz * 0.4, enemy.y - sz * 0.4);
      this.ctx.lineTo(enemy.x + sz, enemy.y - sz * 0.8);
      this.ctx.closePath();
      this.ctx.stroke();

      if (enemy.isFiringBeam) {
        const beamGrad = this.ctx.createLinearGradient(enemy.x - 30, 0, enemy.x + 30, 0);
        beamGrad.addColorStop(0, 'rgba(0, 255, 255, 0.05)');
        beamGrad.addColorStop(0.3, '#ffffff');
        beamGrad.addColorStop(0.5, '#00ffff');
        beamGrad.addColorStop(0.7, '#ffffff');
        beamGrad.addColorStop(1.0, 'rgba(0, 255, 255, 0.05)');
        
        this.ctx.save();
        this.ctx.fillStyle = beamGrad;
        this.ctx.fillRect(enemy.x - 22, enemy.y + 15, 44, this.canvas.height);
        this.ctx.restore();
      } else if (enemy.beamChargeTimer !== undefined && enemy.beamChargeTimer < 1.5) {
        this.ctx.strokeStyle = 'rgba(255, 0, 85, 0.55)';
        this.ctx.lineWidth = 1.0;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(enemy.x - 15, enemy.y);
        this.ctx.lineTo(enemy.x - 15, this.canvas.height);
        this.ctx.moveTo(enemy.x + 15, enemy.y);
        this.ctx.lineTo(enemy.x + 15, this.canvas.height);
        this.ctx.stroke();
      }
    } else if (enemy.type === 'boss') {
      // Giant neon pink central sphere
      const sz = enemy.size;
      this.ctx.beginPath();
      this.ctx.arc(enemy.x, enemy.y, sz, 0, Math.PI * 2);
      this.ctx.stroke();

      // Outer rotating shields
      const orbAngle = enemy.orbitalAngle || 0;
      this.ctx.lineWidth = 4.0;
      this.ctx.strokeStyle = '#00ffff';
      this.ctx.beginPath();
      this.ctx.arc(enemy.x, enemy.y, sz + 24, orbAngle, orbAngle + Math.PI * 0.45);
      this.ctx.stroke();
      
      this.ctx.beginPath();
      this.ctx.arc(enemy.x, enemy.y, sz + 24, orbAngle + Math.PI, orbAngle + Math.PI * 1.45);
      this.ctx.stroke();
      
      // Boss Health Bar directly above it
      this.ctx.save();
      const hbW = 100;
      const hbH = 5;
      const hPercent = enemy.hp / enemy.maxHp;
      this.ctx.fillStyle = 'rgba(255,255,255,0.06)';
      this.ctx.fillRect(enemy.x - hbW/2, enemy.y - sz - 20, hbW, hbH);
      this.ctx.fillStyle = '#ff0055';
      this.ctx.fillRect(enemy.x - hbW/2, enemy.y - sz - 20, hbW * hPercent, hbH);
      this.ctx.restore();
    }

    this.ctx.restore();
  }

  private drawPlayer() {
    this.ctx.save();
    const themeColor = this.getThemeColor();

    // 1. Draw Protective Shield Dome
    if (this.isShieldActive) {
      const shieldRadius = this.playerSize + 22;
      
      this.ctx.shadowBlur = 18;
      this.ctx.shadowColor = themeColor;
      this.ctx.strokeStyle = themeColor;
      this.ctx.lineWidth = 2.5;
      
      this.ctx.beginPath();
      for (let j = 0; j < 6; j++) {
        const angle = (j / 6) * Math.PI * 2 + performance.now() * 0.0015;
        const px = this.playerX + Math.cos(angle) * shieldRadius;
        const py = this.playerY + Math.sin(angle) * shieldRadius;
        if (j === 0) this.ctx.moveTo(px, py);
        else this.ctx.lineTo(px, py);
      }
      this.ctx.closePath();
      this.ctx.stroke();

      this.ctx.fillStyle = `${themeColor}11`;
      this.ctx.fill();
    }

    // 2. Shield Charge meter ring
    const energyRadius = this.playerSize + 8;
    this.ctx.shadowBlur = 0;
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    this.ctx.lineWidth = 2.0;
    this.ctx.beginPath();
    this.ctx.arc(this.playerX, this.playerY, energyRadius, 0, Math.PI * 2);
    this.ctx.stroke();

    const energyPercent = this.shieldEnergy / 100;
    this.ctx.strokeStyle = this.shieldEnergy < 30 ? '#ff0055' : themeColor;
    this.ctx.lineWidth = 3.0;
    this.ctx.beginPath();
    this.ctx.arc(
      this.playerX, 
      this.playerY, 
      energyRadius, 
      -Math.PI / 2, 
      -Math.PI / 2 + (Math.PI * 2 * energyPercent)
    );
    this.ctx.stroke();

    // Nova Blast Cooldown ring
    if (this.novaBlastCooldown > 0) {
      const cdRadius = energyRadius + 5;
      const cdPercent = this.novaBlastCooldown / this.novaBlastCooldownMax;
      this.ctx.strokeStyle = 'rgba(255, 0, 85, 0.45)';
      this.ctx.lineWidth = 2.0;
      this.ctx.beginPath();
      this.ctx.arc(
        this.playerX,
        this.playerY,
        cdRadius,
        -Math.PI / 2,
        -Math.PI / 2 + (Math.PI * 2 * cdPercent)
      );
      this.ctx.stroke();
    }

    // Swirling Gravity Vortex (Fist)
    if (this.detectedGesture === 'fist') {
      const vortexRadius = 75;
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(191, 85, 236, 0.45)';
      this.ctx.shadowBlur = 12;
      this.ctx.shadowColor = '#bf55ec';
      this.ctx.lineWidth = 1.5;
      
      this.ctx.beginPath();
      const now = performance.now() * 0.006;
      for (let j = 0; j <= 360; j += 6) {
        const rad = (j * Math.PI) / 180;
        const r = (j / 360) * vortexRadius;
        const px = this.playerX + Math.cos(rad + now) * r;
        const py = this.playerY + Math.sin(rad + now) * r;
        if (j === 0) this.ctx.moveTo(px, py);
        else this.ctx.lineTo(px, py);
      }
      this.ctx.stroke();
      this.ctx.restore();
    }

    // Cyber Sabers (Peace Sign)
    if (this.detectedGesture === 'peace' && this.shieldEnergy > 0) {
      const saberLength = 95;
      this.ctx.save();
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = '#ffea00';
      this.ctx.lineWidth = 3.5;

      const angles = [this.cyberSaberAngle, this.cyberSaberAngle + Math.PI];
      for (const angle of angles) {
        const sx = this.playerX;
        const sy = this.playerY;
        const ex = this.playerX + Math.cos(angle) * saberLength;
        const ey = this.playerY + Math.sin(angle) * saberLength;
        
        const grad = this.ctx.createLinearGradient(sx, sy, ex, ey);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        grad.addColorStop(0.3, '#ffea00');
        grad.addColorStop(1, 'rgba(255, 234, 0, 0.05)');
        
        this.ctx.strokeStyle = grad;
        this.ctx.beginPath();
        this.ctx.moveTo(sx, sy);
        this.ctx.lineTo(ex, ey);
        this.ctx.stroke();

        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.arc(sx + Math.cos(angle) * 18, sy + Math.sin(angle) * 18, 4, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.restore();
    }

    // 3. Vector Waveform Core (Uniqueness!)
    this.ctx.shadowBlur = 15;
    this.ctx.shadowColor = themeColor;
    this.ctx.strokeStyle = themeColor;
    this.ctx.lineWidth = 2.0;
    this.ctx.beginPath();

    const pointsCount = 18;
    const time = performance.now() * 0.015;

    for (let i = 0; i <= pointsCount; i++) {
      const angle = (i / pointsCount) * Math.PI * 2;
      let radius = this.playerSize;

      // Morph shape dynamically based on active upgrades, events, and gestures
      if (this.detectedGesture === 'fist') {
        // Compress core to blocky/octagonal wave
        radius += Math.sin(angle * 6.0) * 2.0;
        if (i % 3 === 0) radius += 4;
      } else if (this.detectedGesture === 'peace') {
        // Twin spikes aligned with saber rotation
        const dAngle = Math.abs(Math.sin(angle - this.cyberSaberAngle));
        radius += Math.pow(1 - dAngle, 4.0) * 10;
      } else if (this.activePowerUps.includes('Magnet')) {
        radius += Math.sin(angle * 3.0 + time) * 3;
      } else if (this.activePowerUps.includes('Hyper Core')) {
        radius += (Math.random() - 0.5) * 5;
      } else if (this.slowMoTimer > 0) {
        radius += Math.sin(angle * 2.0 + time * 0.3) * 4;
      } else {
        radius += Math.sin(angle * 4.0 + time) * 1.5;
      }

      const px = this.playerX + Math.cos(angle) * radius;
      const py = this.playerY + Math.sin(angle) * radius;

      if (i === 0) this.ctx.moveTo(px, py);
      else this.ctx.lineTo(px, py);
    }
    this.ctx.closePath();
    this.ctx.stroke();

    // Central white arpeggio core
    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.arc(this.playerX, this.playerY, this.playerSize * 0.35, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }

  private drawHandOverlay(canvasWidth: number, canvasHeight: number) {
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(0, 255, 255, 0.08)';
    this.ctx.lineWidth = 1.0;

    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // Index
      [9, 10], [10, 11], [11, 12],     // Middle
      [13, 14], [14, 15], [15, 16],    // Ring
      [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
      [5, 9], [9, 13], [13, 17]
    ];

    for (const [sIdx, eIdx] of connections) {
      if (this.rawHandLandmarks[sIdx] && this.rawHandLandmarks[eIdx]) {
        const pt1 = this.rawHandLandmarks[sIdx];
        const pt2 = this.rawHandLandmarks[eIdx];
        this.ctx.beginPath();
        this.ctx.moveTo(pt1.x * canvasWidth, pt1.y * canvasHeight);
        this.ctx.lineTo(pt2.x * canvasWidth, pt2.y * canvasHeight);
        this.ctx.stroke();
      }
    }

    this.ctx.restore();
  }

  private drawCanvasHUD(width: number, height: number) {
    const barWidth = 260;
    const barHeight = 6;
    const barX = (width - barWidth) / 2;
    const barY = height - 30;

    this.ctx.save();

    if (this.isSandbox) {
      this.ctx.save();
      this.ctx.fillStyle = '#ffea00';
      this.ctx.font = "bold 13px 'Space Grotesk', sans-serif";
      this.ctx.textAlign = 'center';
      this.ctx.shadowBlur = 6;
      this.ctx.shadowColor = '#ffea00';
      this.ctx.fillText("SANDBOX PRACTICE MODE", width / 2, 45);
      
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      this.ctx.font = "10px 'Space Grotesk', sans-serif";
      this.ctx.shadowBlur = 0;
      this.ctx.fillText("NO ENEMY THREATS • practice your hand gestures", width / 2, 60);
      this.ctx.restore();
    }
    
    // Health Bar
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    this.ctx.fillRect(barX, barY, barWidth, barHeight);

    // Max health capacity updates based on upgrades
    const maxHP = 100 + this.upgrades.maxIntegrity * 20;
    const healthPercent = this.health / maxHP;
    const fillWidth = barWidth * healthPercent;
    
    const themeColor = this.getThemeColor();
    this.ctx.fillStyle = this.health < 30 ? '#ff0055' : themeColor;
    if (this.settings.graphics.quality === 'high') {
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = this.ctx.fillStyle as string;
    }
    this.ctx.fillRect(barX, barY, fillWidth, barHeight);

    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    this.ctx.font = "bold 9px 'Space Grotesk', sans-serif";
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`LVL ${this.level} // INTEGRITY ${Math.round(this.health)}/${maxHP} HP`, width / 2, barY - 6);

    this.ctx.restore();
  }

  private drawPickup(pickup: Pickup) {
    this.ctx.save();
    if (this.settings.graphics.quality === 'high') {
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = pickup.color;
    }
    this.ctx.strokeStyle = pickup.color;
    this.ctx.lineWidth = 2.0;

    const sz = pickup.size;
    const pulse = Math.sin(pickup.phase * 4.0) * 1.5;

    // Draw specific crystal/orb geometry based on item type
    if (pickup.type.includes('crystal')) {
      // 4-sided diamond crystal shards
      this.ctx.beginPath();
      this.ctx.moveTo(pickup.x, pickup.y - sz - pulse);
      this.ctx.lineTo(pickup.x + (sz + pulse) * 0.7, pickup.y);
      this.ctx.lineTo(pickup.x, pickup.y + sz + pulse);
      this.ctx.lineTo(pickup.x - (sz + pulse) * 0.7, pickup.y);
      this.ctx.closePath();
      this.ctx.stroke();

      // Inner glowing core
      this.ctx.fillStyle = pickup.color;
      this.ctx.beginPath();
      this.ctx.arc(pickup.x, pickup.y, 2.0, 0, Math.PI * 2);
      this.ctx.fill();
    } else if (pickup.type === 'multiplier_orb') {
      // Pulsing concentric circles arpeggiator
      this.ctx.beginPath();
      this.ctx.arc(pickup.x, pickup.y, sz + pulse, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.strokeStyle = `${pickup.color}66`;
      this.ctx.lineWidth = 1.0;
      this.ctx.beginPath();
      this.ctx.arc(pickup.x, pickup.y, (sz + pulse) * 0.6, 0, Math.PI * 2);
      this.ctx.stroke();
    } else if (pickup.type === 'xp_core') {
      // Hexagon Core
      this.ctx.beginPath();
      for (let j = 0; j < 6; j++) {
        const angle = (j / 6) * Math.PI * 2 + pickup.phase * 0.5;
        this.ctx.lineTo(pickup.x + Math.cos(angle) * sz, pickup.y + Math.sin(angle) * sz);
      }
      this.ctx.closePath();
      this.ctx.stroke();
    } else if (pickup.type === 'time_warp') {
      // Hourglass
      this.ctx.beginPath();
      this.ctx.moveTo(pickup.x - sz * 0.7, pickup.y - sz);
      this.ctx.lineTo(pickup.x + sz * 0.7, pickup.y - sz);
      this.ctx.lineTo(pickup.x - sz * 0.2, pickup.y);
      this.ctx.lineTo(pickup.x + sz * 0.7, pickup.y + sz);
      this.ctx.lineTo(pickup.x - sz * 0.7, pickup.y + sz);
      this.ctx.lineTo(pickup.x + sz * 0.2, pickup.y);
      this.ctx.closePath();
      this.ctx.stroke();
    } else if (pickup.type === 'shield_gen') {
      // Shield crest
      this.ctx.beginPath();
      this.ctx.moveTo(pickup.x, pickup.y - sz);
      this.ctx.lineTo(pickup.x + sz * 0.8, pickup.y - sz * 0.5);
      this.ctx.lineTo(pickup.x + sz * 0.6, pickup.y + sz * 0.4);
      this.ctx.lineTo(pickup.x, pickup.y + sz);
      this.ctx.lineTo(pickup.x - sz * 0.6, pickup.y + sz * 0.4);
      this.ctx.lineTo(pickup.x - sz * 0.8, pickup.y - sz * 0.5);
      this.ctx.closePath();
      this.ctx.stroke();
    } else if (pickup.type === 'magnet_orb') {
      // Horseshoe magnet
      this.ctx.save();
      this.ctx.translate(pickup.x, pickup.y);
      this.ctx.rotate(pickup.phase);
      this.ctx.beginPath();
      this.ctx.arc(0, 0, sz, Math.PI, 0, true);
      this.ctx.lineTo(sz, sz * 0.8);
      this.ctx.lineTo(sz * 0.5, sz * 0.8);
      this.ctx.lineTo(sz * 0.5, 0);
      this.ctx.arc(0, 0, sz * 0.5, 0, Math.PI, true);
      this.ctx.lineTo(-sz * 0.5, sz * 0.8);
      this.ctx.lineTo(-sz, sz * 0.8);
      this.ctx.closePath();
      this.ctx.stroke();
      this.ctx.restore();
    } else if (pickup.type === 'hyper_core') {
      // Flashing nuclear arpeggio spark core
      this.ctx.beginPath();
      for (let j = 0; j < 8; j++) {
        const isOuter = j % 2 === 0;
        const rad = isOuter ? sz + pulse : sz * 0.4;
        const angle = (j / 8) * Math.PI * 2 + pickup.phase * 0.8;
        this.ctx.lineTo(pickup.x + Math.cos(angle) * rad, pickup.y + Math.sin(angle) * rad);
      }
      this.ctx.closePath();
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  private getThemeColor(): string {
    if (this.comboMultiplier >= 5) {
      return '#ff0055'; // Pink/Red
    } else if (this.comboMultiplier >= 4) {
      return '#ff00ff'; // Magenta
    } else if (this.comboMultiplier >= 3) {
      return '#ffea00'; // Yellow
    } else if (this.comboMultiplier >= 2) {
      return '#39ff14'; // Green
    }
    return '#00ffff'; // Cyan default
  }

  private triggerScreenShake(duration: number, intensity: number) {
    if (this.settings.accessibility.reducedMotion) return;
    this.screenShakeDuration = duration;
    this.screenShakeIntensity = intensity;
  }
}
