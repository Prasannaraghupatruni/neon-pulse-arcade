export type ParticleType = 'spark' | 'glow' | 'burst' | 'text' | 'ring';

export interface Particle {
  id: number;
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  type: ParticleType;
  text?: string;
  friction: number;
  gravity: number;
}

export class ParticlePool {
  private pool: Particle[] = [];
  private maxParticles = 600;

  constructor() {
    // Pre-allocate the pool to avoid garbage collection churn
    for (let i = 0; i < this.maxParticles; i++) {
      this.pool.push({
        id: i,
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        color: '#ffffff',
        size: 0,
        alpha: 1,
        life: 0,
        maxLife: 0,
        type: 'spark',
        friction: 0.98,
        gravity: 0
      });
    }
  }

  /**
   * Spawns a single particle by re-using an inactive one from the pool
   */
  public spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: string,
    size: number,
    maxLife: number,
    type: ParticleType,
    text?: string,
    friction = 0.98,
    gravity = 0
  ): Particle | null {
    // Find first inactive particle
    const p = this.pool.find(item => !item.active);
    if (!p) return null; // Pool full (gracefully ignore new spawns to maintain FPS)

    p.active = true;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.color = color;
    p.size = size;
    p.alpha = 1.0;
    p.life = maxLife;
    p.maxLife = maxLife;
    p.type = type;
    p.text = text;
    p.friction = friction;
    p.gravity = gravity;

    return p;
  }

  /**
   * Spawns a circular neon explosion burst
   */
  public spawnExplosion(x: number, y: number, color: string, count = 20, force = 6) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.3 + Math.random() * 0.7) * force;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const size = 2 + Math.random() * 4;
      const life = 0.4 + Math.random() * 0.5; // 400 - 900ms life
      
      this.spawn(
        x, 
        y, 
        vx, 
        vy, 
        color, 
        size, 
        life, 
        'spark', 
        undefined, 
        0.96, // high friction
        0.05  // slight gravity fall
      );
    }
  }

  /**
   * Spawns a floating score multiplier text
   */
  public spawnFloatText(x: number, y: number, text: string, color: string) {
    this.spawn(
      x,
      y,
      (Math.random() - 0.5) * 1.0, // slight drift left/right
      -2.0 - Math.random() * 1.5,   // float upwards
      color,
      16, // Font size representation
      1.0, // 1 second life
      'text',
      text,
      0.98,
      0 // No gravity for floating text
    );
  }

  /**
   * Spawns an expanding shockwave ripple ring
   */
  public spawnShockwave(x: number, y: number, color: string) {
    this.spawn(
      x,
      y,
      0,
      0,
      color,
      8,    // initial radius
      0.45, // 450ms life
      'ring',
      undefined,
      1.0, // no friction
      0    // no gravity
    );
  }

  /**
   * Updates all active particles
   * @param dt Delta time in seconds
   */
  public update(dt: number) {
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      // Physics integration
      p.vx *= p.friction;
      p.vy = p.vy * p.friction + p.gravity;
      p.x += p.vx;
      p.y += p.vy;

      // Decay size and alpha
      p.alpha = Math.max(0, p.life / p.maxLife);
      if (p.type === 'spark') {
        p.size *= 0.98;
      } else if (p.type === 'ring') {
        p.size += dt * 320; // expand radius rapidly
      }
    }
  }

  /**
   * Draws all active particles onto the canvas
   */
  public draw(ctx: CanvasRenderingContext2D) {
    // Cache current drawing state
    const originalComposite = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter'; // Additive neon blend

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      ctx.save();
      ctx.globalAlpha = p.alpha;

      if (p.type === 'text' && p.text) {
        ctx.fillStyle = p.color;
        // Bold Space Grotesk / Outfit font for score floaters
        ctx.font = `bold ${Math.round(p.size)}px 'Space Grotesk', sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
      } else if (p.type === 'glow') {
        // Draw a soft glowing orb
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'ring') {
        // Draw fading outline circle
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3.0 * p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Draw a sharp retro spark
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.restore();
    }

    ctx.globalCompositeOperation = originalComposite;
  }
}
